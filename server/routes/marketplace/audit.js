const express = require("express");
const { db } = require("../../db");

const router = express.Router();

// Só leitura - usuários comuns nem chegam aqui (o módulo inteiro já é
// admin-only), mas mesmo um admin não tem rota de edição/exclusão de
// auditoria.
router.get("/", (req, res) => {
  const { entityType, action, dataInicio, dataFim } = req.query;
  const where = [];
  const params = [];
  if (entityType) {
    where.push("entity_type = ?");
    params.push(String(entityType));
  }
  if (action) {
    where.push("action LIKE ?");
    params.push(`%${action}%`);
  }
  if (dataInicio) {
    where.push("created_at >= ?");
    params.push(String(dataInicio));
  }
  if (dataFim) {
    where.push("created_at <= ?");
    params.push(String(dataFim));
  }
  const registros = db
    .prepare(
      `SELECT * FROM marketplace_audit_logs
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY created_at DESC LIMIT 500`
    )
    .all(...params);
  res.json({ registros });
});

module.exports = router;
