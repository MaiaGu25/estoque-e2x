const express = require("express");
const { db } = require("../../db");

const router = express.Router();

function montarFiltros(query) {
  const { from, to, type, productId, responsavel, motivo, positionId, busca } = query;
  const where = [];
  const params = [];
  if (from) {
    where.push("m.created_at >= ?");
    params.push(String(from));
  }
  if (to) {
    where.push("m.created_at < datetime(?, '+1 day')");
    params.push(String(to));
  }
  if (type) {
    where.push("o.type = ?");
    params.push(String(type));
  }
  if (productId) {
    where.push("m.product_id = ?");
    params.push(Number(productId));
  }
  if (responsavel) {
    where.push("o.responsible LIKE ?");
    params.push(`%${responsavel}%`);
  }
  if (motivo) {
    where.push("o.reason LIKE ?");
    params.push(`%${motivo}%`);
  }
  if (positionId) {
    where.push("(m.from_position_id = ? OR m.to_position_id = ?)");
    params.push(Number(positionId), Number(positionId));
  }
  if (busca) {
    where.push(
      "(o.number LIKE ? OR p.code LIKE ? OR p.name LIKE ? OR o.reason LIKE ? OR o.responsible LIKE ? OR fp.code LIKE ? OR tp.code LIKE ?)"
    );
    const like = `%${busca}%`;
    params.push(like, like, like, like, like, like, like);
  }
  return { where, params };
}

router.get("/", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
  const { where, params } = montarFiltros(req.query);
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const fromSql = `
    FROM logistics_movements m
    JOIN logistics_operations o ON o.id = m.operation_id
    JOIN logistics_products p ON p.id = m.product_id
    LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
    LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
    LEFT JOIN users u ON u.id = o.created_by
    ${whereSql}`;

  const total = db.prepare(`SELECT COUNT(*) AS n ${fromSql}`).get(...params).n;

  const registros = db
    .prepare(
      `SELECT m.id, m.created_at, m.quantity, m.previous_total_quantity, m.new_total_quantity,
              o.id AS operation_id, o.number, o.type, o.reason, o.responsible, o.notes,
              p.id AS product_id, p.code AS product_code, p.name AS product_name, p.unit,
              fp.id AS from_position_id, fp.code AS from_position_code,
              tp.id AS to_position_id, tp.code AS to_position_code,
              u.name AS registered_by
       ${fromSql}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  res.json({ registros, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get("/:operationId", (req, res) => {
  const id = Number(req.params.operationId);
  const operacao = db.prepare("SELECT o.*, u.name AS registered_by FROM logistics_operations o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?").get(id);
  if (!operacao) return res.status(404).json({ error: "Operação não encontrada." });

  const movimentos = db
    .prepare(
      `SELECT m.*, p.code AS product_code, p.name AS product_name, p.unit,
              fp.code AS from_position_code, tp.code AS to_position_code
       FROM logistics_movements m
       JOIN logistics_products p ON p.id = m.product_id
       LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
       LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
       WHERE m.operation_id = ?`
    )
    .all(id);

  res.json({ operacao, movimentos });
});

module.exports = router;
