const express = require("express");
const { db } = require("../../db");
const { requireAdmin } = require("../../auth");
const { broadcast } = require("../../realtime");
const {
  buscarConferencia,
  itensDaConferencia,
  divergenciasDaConferencia,
  criarConferenciaTx,
  iniciarConferenciaTx,
  pausarConferenciaTx,
  registrarItemConferidoTx,
  registrarDivergenciaConferenciaTx,
  resolverDivergenciaConferenciaTx,
  finalizarConferenciaTx,
  cancelarConferenciaTx,
} = require("../../lib/logisticaConferencia");

const router = express.Router();

function erro(res, error, fallback) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/", (req, res) => {
  const { status, busca } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("c.status = ?");
    params.push(String(status));
  }
  if (busca) {
    const like = `%${busca}%`;
    where.push(
      `(c.numero LIKE ? OR c.fornecedor_nome LIKE ? OR EXISTS (
         SELECT 1 FROM logistics_conferencia_itens ci JOIN logistics_products p ON p.id = ci.product_id
         WHERE ci.conferencia_id = c.id AND (p.code LIKE ? OR p.name LIKE ?)
       ))`
    );
    params.push(like, like, like, like);
  }
  const conferencias = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM logistics_conferencia_itens WHERE conferencia_id = c.id) AS total_itens,
        (SELECT COUNT(*) FROM logistics_conferencia_divergencias WHERE conferencia_id = c.id AND status = 'aberta') AS divergencias_abertas
       FROM logistics_conferencias c
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY c.created_at DESC LIMIT 500`
    )
    .all(...params);
  res.json({ conferencias });
});

router.get("/:id", (req, res) => {
  try {
    const conferencia = buscarConferencia(Number(req.params.id));
    const itens = itensDaConferencia(conferencia.id);
    const divergencias = divergenciasDaConferencia(conferencia.id);
    const eventos = db
      .prepare("SELECT * FROM logistics_conferencia_eventos WHERE conferencia_id = ? ORDER BY created_at DESC, id DESC")
      .all(conferencia.id);
    res.json({ conferencia, itens, divergencias, eventos });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Conferência não encontrada." });
  }
});

router.post("/", (req, res) => {
  try {
    const { id, numero } = criarConferenciaTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, id, numero });
  } catch (error) {
    erro(res, error, "Não foi possível criar a conferência.");
  }
});

router.post("/:id/iniciar", (req, res) => {
  try {
    iniciarConferenciaTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível iniciar a conferência.");
  }
});

router.post("/:id/pausar", (req, res) => {
  try {
    pausarConferenciaTx(Number(req.params.id), req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível pausar a conferência.");
  }
});

router.post("/:id/itens/:itemId/conferir", (req, res) => {
  try {
    const resultado = registrarItemConferidoTx(Number(req.params.id), Number(req.params.itemId), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível registrar o item conferido.");
  }
});

router.post("/:id/divergencias", (req, res) => {
  try {
    const resultado = registrarDivergenciaConferenciaTx(Number(req.params.id), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível registrar a divergência.");
  }
});

router.patch("/:id/divergencias/:divId/resolver", requireAdmin, (req, res) => {
  try {
    resolverDivergenciaConferenciaTx(Number(req.params.id), Number(req.params.divId), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível resolver a divergência.");
  }
});

router.post("/:id/finalizar", (req, res) => {
  const b = req.body || {};
  if (b.permitirPendencias && req.user.role !== "admin") {
    return res.status(403).json({ error: "Só um administrador pode finalizar uma conferência com itens pendentes." });
  }
  try {
    finalizarConferenciaTx(Number(req.params.id), b, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível finalizar a conferência.");
  }
});

router.post("/:id/cancelar", requireAdmin, (req, res) => {
  try {
    cancelarConferenciaTx(Number(req.params.id), req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    erro(res, error, "Não foi possível cancelar a conferência.");
  }
});

module.exports = router;
