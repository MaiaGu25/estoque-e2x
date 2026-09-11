const express = require("express");
const { db } = require("../../db");
const { broadcast } = require("../../realtime");
const { testarConexao, sincronizarAgora, reprocessarFalha } = require("../../lib/marketplace/sync");

const router = express.Router();

function erro(res, error, fallback) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

router.get("/", (req, res) => {
  const contas = db
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM marketplace_orders WHERE account_id = a.id) AS pedidos_importados,
        (SELECT COUNT(*) FROM marketplace_sync_failures WHERE account_id = a.id AND status = 'pendente') AS falhas_pendentes
       FROM marketplace_accounts a
       ORDER BY a.marketplace, a.nome_interno COLLATE NOCASE`
    )
    .all();
  const eventosRecentes = db.prepare("SELECT * FROM marketplace_sync_events ORDER BY created_at DESC LIMIT 100").all();
  res.json({ contas, eventosRecentes });
});

router.get("/falhas", (req, res) => {
  const { status } = req.query;
  const where = status ? "WHERE f.status = ?" : "";
  const params = status ? [String(status)] : [];
  const falhas = db
    .prepare(
      `SELECT f.*, a.nome_interno AS conta_nome
       FROM marketplace_sync_failures f
       LEFT JOIN marketplace_accounts a ON a.id = f.account_id
       ${where}
       ORDER BY f.created_at DESC LIMIT 500`
    )
    .all(...params);
  res.json({ falhas });
});

router.post("/:accountId/testar-conexao", async (req, res) => {
  try {
    const resultado = await testarConexao(Number(req.params.accountId), req.user);
    broadcast("marketplace");
    res.json(resultado);
  } catch (error) {
    erro(res, error, "Não foi possível testar a conexão.");
  }
});

router.post("/:accountId/sincronizar-agora", async (req, res) => {
  try {
    const resultado = await sincronizarAgora(Number(req.params.accountId), req.user);
    broadcast("marketplace");
    res.json(resultado);
  } catch (error) {
    erro(res, error, "Não foi possível sincronizar agora.");
  }
});

router.post("/falhas/:id/reprocessar", async (req, res) => {
  try {
    const resultado = await reprocessarFalha(Number(req.params.id), req.user);
    broadcast("marketplace");
    res.json(resultado);
  } catch (error) {
    erro(res, error, "Não foi possível reprocessar essa falha.");
  }
});

module.exports = router;
