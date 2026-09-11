const express = require("express");
const { db } = require("../../db");
const { requireAdmin } = require("../../auth");
const { broadcast } = require("../../realtime");
const {
  CANAIS,
  PRIORIDADES,
  buscarPedido,
  itensDoPedido,
  divergenciasDoPedido,
  alocacoesDoItem,
  sugerirPosicoes,
  criarPedidoSaidaTx,
  iniciarSeparacaoTx,
  pausarSeparacaoTx,
  registrarPickTx,
  estornarAlocacaoTx,
  registrarDivergenciaSeparacaoTx,
  resolverDivergenciaSeparacaoTx,
  finalizarSeparacaoTx,
  encaminharExpedicaoTx,
  expedirTx,
  cancelarPedidoSaidaTx,
} = require("../../lib/logisticaSeparacao");

const router = express.Router();

function erro(res, error, fallback) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/opcoes", (req, res) => res.json({ canais: CANAIS, prioridades: PRIORIDADES }));

router.get("/", (req, res) => {
  const { status, canal, prioridade, responsavel, busca } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("ps.status = ?");
    params.push(String(status));
  }
  if (canal) {
    where.push("ps.canal = ?");
    params.push(String(canal));
  }
  if (prioridade) {
    where.push("ps.prioridade = ?");
    params.push(String(prioridade));
  }
  if (responsavel) {
    where.push("ps.responsavel LIKE ?");
    params.push(`%${responsavel}%`);
  }
  if (busca) {
    const like = `%${busca}%`;
    where.push(
      `(ps.numero LIKE ? OR ps.numero_visivel LIKE ? OR ps.cliente_nome LIKE ? OR ps.vendedor LIKE ? OR EXISTS (
         SELECT 1 FROM logistics_pedido_saida_itens pi JOIN logistics_products p ON p.id = pi.product_id
         WHERE pi.pedido_id = ps.id AND (p.code LIKE ? OR p.name LIKE ?)
       ))`
    );
    params.push(like, like, like, like, like, like);
  }
  const pedidos = db
    .prepare(
      `SELECT ps.*,
        (SELECT COUNT(*) FROM logistics_pedido_saida_itens WHERE pedido_id = ps.id) AS total_itens,
        (SELECT COUNT(*) FROM logistics_separacao_divergencias WHERE pedido_id = ps.id AND status = 'aberta') AS divergencias_abertas
       FROM logistics_pedidos_saida ps
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY
         CASE ps.prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         ps.created_at DESC
       LIMIT 500`
    )
    .all(...params);
  res.json({ pedidos });
});

router.get("/:id", (req, res) => {
  try {
    const pedido = buscarPedido(Number(req.params.id));
    const itens = itensDoPedido(pedido.id).map((item) => ({ ...item, alocacoes: alocacoesDoItem(item.id) }));
    const divergencias = divergenciasDoPedido(pedido.id);
    const eventos = db.prepare("SELECT * FROM logistics_separacao_eventos WHERE pedido_id = ? ORDER BY created_at DESC, id DESC").all(pedido.id);
    res.json({ pedido, itens, divergencias, eventos });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Pedido não encontrado." });
  }
});

router.get("/:id/itens/:itemId/sugestoes", (req, res) => {
  const item = db.prepare("SELECT * FROM logistics_pedido_saida_itens WHERE id = ? AND pedido_id = ?").get(Number(req.params.itemId), Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Item não encontrado." });
  const pendente = item.quantidade_solicitada - item.quantidade_separada;
  res.json({ sugestoes: sugerirPosicoes(item.product_id, pendente) });
});

router.post("/", (req, res) => {
  try {
    const { id, numero } = criarPedidoSaidaTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, id, numero });
  } catch (error) {
    erro(res, error, "Não foi possível criar o pedido.");
  }
});

router.post("/:id/iniciar", (req, res) => {
  try {
    iniciarSeparacaoTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível iniciar a separação.");
  }
});

router.post("/:id/pausar", (req, res) => {
  try {
    pausarSeparacaoTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível pausar a separação.");
  }
});

router.post("/:id/itens/:itemId/separar", (req, res) => {
  try {
    const resultado = registrarPickTx(Number(req.params.id), Number(req.params.itemId), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível registrar a separação do item.");
  }
});

router.delete("/alocacoes/:alocacaoId", requireAdmin, (req, res) => {
  try {
    estornarAlocacaoTx(Number(req.params.alocacaoId), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível desfazer essa separação.");
  }
});

router.post("/:id/divergencias", (req, res) => {
  try {
    const resultado = registrarDivergenciaSeparacaoTx(Number(req.params.id), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível registrar a divergência.");
  }
});

router.patch("/:id/divergencias/:divId/resolver", requireAdmin, (req, res) => {
  try {
    resolverDivergenciaSeparacaoTx(Number(req.params.id), Number(req.params.divId), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível resolver a divergência.");
  }
});

router.post("/:id/finalizar", (req, res) => {
  const b = req.body || {};
  if (b.permitirPendencias && req.user.role !== "admin") {
    return res.status(403).json({ error: "Só um administrador pode finalizar uma separação com itens pendentes." });
  }
  try {
    finalizarSeparacaoTx(Number(req.params.id), b, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível finalizar a separação.");
  }
});

router.post("/:id/encaminhar-expedicao", (req, res) => {
  try {
    encaminharExpedicaoTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível encaminhar para expedição.");
  }
});

router.post("/:id/expedir", (req, res) => {
  try {
    expedirTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível expedir o pedido.");
  }
});

router.post("/:id/cancelar", requireAdmin, (req, res) => {
  try {
    cancelarPedidoSaidaTx(Number(req.params.id), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível cancelar o pedido.");
  }
});

module.exports = router;
