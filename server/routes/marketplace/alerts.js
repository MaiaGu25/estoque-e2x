const express = require("express");
const { db } = require("../../db");
const { broadcast } = require("../../realtime");
const { marcarAlertaVisto, resolverAlerta } = require("../../lib/marketplace/alerts");

const router = express.Router();

router.get("/", (req, res) => {
  const { status, tipo, severidade } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("al.status = ?");
    params.push(String(status));
  }
  if (tipo) {
    where.push("al.tipo = ?");
    params.push(String(tipo));
  }
  if (severidade) {
    where.push("al.severidade = ?");
    params.push(String(severidade));
  }
  const alertas = db
    .prepare(
      `SELECT al.*, a.nome_interno AS conta_nome, o.numero_visivel, o.id_externo
       FROM marketplace_alerts al
       LEFT JOIN marketplace_accounts a ON a.id = al.account_id
       LEFT JOIN marketplace_orders o ON o.id = al.order_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY al.status = 'aberto' DESC, al.created_at DESC LIMIT 500`
    )
    .all(...params);
  res.json({ alertas });
});

router.patch("/:id/visto", (req, res) => {
  marcarAlertaVisto(Number(req.params.id));
  broadcast("marketplace");
  res.json({ ok: true });
});

router.patch("/:id/resolver", (req, res) => {
  resolverAlerta(Number(req.params.id), req.user);
  broadcast("marketplace");
  res.json({ ok: true });
});

module.exports = router;
