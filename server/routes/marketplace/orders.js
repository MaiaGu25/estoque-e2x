const express = require("express");
const { db } = require("../../db");
const { broadcast } = require("../../realtime");
const {
  itensDoPedido,
  reservasDoItem,
  cancelarPedidoTx,
  iniciarSeparacaoTx,
  marcarItemSeparadoTx,
  encaminharExpedicaoTx,
  expedirPedidoTx,
  marcarEntregueTx,
  calcularSituacaoPrazo,
} = require("../../lib/marketplace/orders");

const router = express.Router();

function erro(res, error, fallback) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/", (req, res) => {
  const { busca, marketplace, accountId, status, origem, responsavel, dataInicio, dataFim, situacaoPrazo, comDivergencia } = req.query;
  const where = [];
  const params = [];
  if (marketplace) {
    where.push("o.marketplace = ?");
    params.push(String(marketplace));
  }
  if (accountId) {
    where.push("o.account_id = ?");
    params.push(Number(accountId));
  }
  if (status) {
    where.push("o.status_interno = ?");
    params.push(String(status));
  }
  if (origem) {
    where.push("o.origem = ?");
    params.push(String(origem));
  }
  if (responsavel) {
    where.push("o.responsavel LIKE ?");
    params.push(`%${responsavel}%`);
  }
  if (comDivergencia === "1") where.push("o.status_interno = 'com_divergencia'");
  if (dataInicio) {
    where.push("o.importado_em >= ?");
    params.push(String(dataInicio));
  }
  if (dataFim) {
    where.push("o.importado_em <= ?");
    params.push(String(dataFim));
  }
  if (busca) {
    const like = `%${busca}%`;
    where.push(
      `(o.numero_visivel LIKE ? OR o.id_externo LIKE ? OR o.comprador_nome LIKE ? OR EXISTS (
         SELECT 1 FROM marketplace_order_items oi WHERE oi.order_id = o.id AND (oi.sku_externo LIKE ? OR oi.sku_interno LIKE ? OR oi.titulo_recebido LIKE ?)
       ))`
    );
    params.push(like, like, like, like, like, like);
  }

  const pedidos = db
    .prepare(
      `SELECT o.*, a.nome_interno AS conta_nome, a.apelido AS conta_apelido,
        (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) AS total_itens,
        (SELECT COALESCE(SUM(quantidade),0) FROM marketplace_order_items WHERE order_id = o.id) AS total_unidades
       FROM marketplace_orders o
       JOIN marketplace_accounts a ON a.id = o.account_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY o.importado_em DESC LIMIT 500`
    )
    .all(...params);

  const comSituacao = pedidos.map((p) => ({ ...p, situacao_prazo: calcularSituacaoPrazo(p).situacao }));
  const filtrados = situacaoPrazo ? comSituacao.filter((p) => p.situacao_prazo === situacaoPrazo) : comSituacao;

  res.json({ pedidos: filtrados });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = db
    .prepare(
      `SELECT o.*, a.nome_interno AS conta_nome, a.apelido AS conta_apelido
       FROM marketplace_orders o JOIN marketplace_accounts a ON a.id = o.account_id WHERE o.id = ?`
    )
    .get(id);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

  const itens = itensDoPedido(id).map((item) => ({ ...item, reservas: reservasDoItem(item.id) }));
  const alertas = db.prepare("SELECT * FROM marketplace_alerts WHERE order_id = ? ORDER BY created_at DESC").all(id);
  const eventos = db
    .prepare("SELECT * FROM marketplace_sync_events WHERE id_externo = ? AND account_id = ? ORDER BY created_at DESC")
    .all(pedido.id_externo, pedido.account_id);
  const auditoria = db
    .prepare(
      `SELECT * FROM marketplace_audit_logs WHERE (entity_type = 'marketplace_orders' AND entity_id = ?) OR entity_id IN (SELECT id FROM marketplace_order_items WHERE order_id = ?) ORDER BY created_at DESC`
    )
    .all(id, id);

  res.json({ pedido: { ...pedido, situacao_prazo: calcularSituacaoPrazo(pedido) }, itens, alertas, eventos, auditoria });
});

router.post("/:id/cancelar", (req, res) => {
  try {
    const resultado = cancelarPedidoTx(Number(req.params.id), req.body || {}, req.user);
    broadcast("marketplace");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível cancelar o pedido.");
  }
});

router.post("/:id/iniciar-separacao", (req, res) => {
  try {
    iniciarSeparacaoTx(Number(req.params.id), req.user);
    broadcast("marketplace");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível iniciar a separação.");
  }
});

router.post("/:id/itens/:itemId/separar", (req, res) => {
  try {
    const resultado = marcarItemSeparadoTx(Number(req.params.id), Number(req.params.itemId), (req.body || {}).quantidade, req.user);
    broadcast("marketplace");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível marcar o item como separado.");
  }
});

router.post("/:id/encaminhar-expedicao", (req, res) => {
  try {
    encaminharExpedicaoTx(Number(req.params.id), req.user);
    broadcast("marketplace");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível encaminhar para expedição.");
  }
});

router.post("/:id/expedir", (req, res) => {
  try {
    expedirPedidoTx(Number(req.params.id), req.user);
    broadcast("marketplace");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível expedir o pedido.");
  }
});

router.post("/:id/entregue", (req, res) => {
  try {
    marcarEntregueTx(Number(req.params.id), req.user);
    broadcast("marketplace");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível marcar como entregue.");
  }
});

module.exports = router;
