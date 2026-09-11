const express = require("express");
const { db } = require("../../db");

const router = express.Router();

// Consulta somente leitura do Estoque geral pelo módulo Marketplace -
// nunca edita saldo por aqui (isso continua sendo feito só pelo módulo
// Estoque/Reservados).
router.get("/", (req, res) => {
  const { busca, status } = req.query;
  const where = [];
  const params = [];
  if (busca) {
    where.push("(p.code LIKE ? OR p.name LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like);
  }

  const pecas = db
    .prepare(
      `SELECT p.id, p.code, p.name, p.unit, p.quantity, p.reserved_quantity, p.minimum_stock, p.active,
              (p.quantity - p.reserved_quantity) AS saldo_disponivel,
              (SELECT MAX(created_at) FROM movements WHERE part_id = p.id) AS ultima_movimentacao,
              (SELECT COUNT(*) FROM marketplace_listing_mappings mm WHERE mm.part_id = p.id) AS anuncios_vinculados
       FROM parts p
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY p.name COLLATE NOCASE LIMIT 1000`
    )
    .all(...params);

  const comStatus = pecas.map((p) => {
    let situacao = "disponivel";
    if (!p.active) situacao = "inativo";
    else if (p.saldo_disponivel <= 0) situacao = "sem_estoque";
    else if (p.saldo_disponivel <= p.minimum_stock) situacao = "baixo";
    return { ...p, situacao, com_reserva: p.reserved_quantity > 0, nao_vinculado: p.anuncios_vinculados === 0 };
  });

  const filtrados = !status
    ? comStatus
    : comStatus.filter((p) => {
        if (status === "com_reserva") return p.com_reserva;
        if (status === "nao_vinculado") return p.nao_vinculado;
        return p.situacao === status;
      });

  res.json({ pecas: filtrados });
});

router.get("/:id/reservas", (req, res) => {
  const partId = Number(req.params.id);
  const reservas = db
    .prepare(
      `SELECT r.*, o.numero_visivel, o.id_externo, o.marketplace, o.status_interno,
              a.nome_interno AS conta_nome
       FROM marketplace_order_reservations r
       JOIN marketplace_order_items oi ON oi.id = r.order_item_id
       JOIN marketplace_orders o ON o.id = oi.order_id
       JOIN marketplace_accounts a ON a.id = o.account_id
       WHERE r.part_id = ? AND r.status = 'reservado'
       ORDER BY r.created_at DESC`
    )
    .all(partId);
  res.json({ reservas });
});

module.exports = router;
