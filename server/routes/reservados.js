const express = require("express");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");
const { broadcast } = require("../realtime");

const router = express.Router();
router.use(requireAuth);

const createReservaTx = transaction((b, user) => {
  const now = nowStamp();

  for (const item of b.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

    const part = db
      .prepare("SELECT id, quantity, reserved_quantity FROM parts WHERE id = ? AND active = 1")
      .get(Number(item.partId));
    if (!part) throw new Error("Peça não encontrada.");

    if (b.type === "RESERVAR") {
      const nextReserved = part.reserved_quantity + qty;
      if (nextReserved > part.quantity) throw new Error("Saldo insuficiente para reservar essa quantidade.");

      const changed = db
        .prepare("UPDATE parts SET reserved_quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ?")
        .run(nextReserved, now, part.id, part.reserved_quantity);
      if (!changed.changes) throw new Error("A reserva mudou durante a operação. Tente novamente.");

      db.prepare(
        `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
         VALUES (?,'RESERVAR',?,?,?,?,?,?,?,?)`
      ).run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes, user.id, now);
    } else if (b.type === "LIBERAR") {
      const nextReserved = part.reserved_quantity - qty;
      if (nextReserved < 0) throw new Error("Não há reserva suficiente para liberar essa quantidade.");

      const changed = db
        .prepare("UPDATE parts SET reserved_quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ?")
        .run(nextReserved, now, part.id, part.reserved_quantity);
      if (!changed.changes) throw new Error("A reserva mudou durante a operação. Tente novamente.");

      db.prepare(
        `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
         VALUES (?,'LIBERAR',?,?,?,?,?,?,?,?)`
      ).run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes, user.id, now);
    } else if (b.type === "BAIXA") {
      const nextReserved = part.reserved_quantity - qty;
      if (nextReserved < 0) throw new Error("Não há reserva suficiente para dar baixa nessa quantidade.");
      const nextQuantity = part.quantity - qty;
      if (nextQuantity < 0) throw new Error("Saldo insuficiente para dar baixa nessa quantidade.");

      const changed = db
        .prepare(
          "UPDATE parts SET reserved_quantity = ?, quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ? AND quantity = ?"
        )
        .run(nextReserved, nextQuantity, now, part.id, part.reserved_quantity, part.quantity);
      if (!changed.changes) throw new Error("O saldo mudou durante a operação. Tente novamente.");

      db.prepare(
        `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
         VALUES (?,'BAIXA',?,?,?,?,?,?,?,?)`
      ).run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes, user.id, now);

      // Reason fixo ("Reservados") para agrupar certinho nos Relatórios por
      // motivo, junto com RMA e as outras saídas; o motivo digitado pela
      // pessoa vai para a observação, sem se perder.
      const notaBaixa = [b.reason, b.notes].filter(Boolean).join(" · ");
      db.prepare(
        `INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at)
         VALUES (?,NULL,'SAIDA',?,?,?,'Reservados',?,?,?,?)`
      ).run(part.id, qty, part.quantity, nextQuantity, user.name, notaBaixa, user.id, now);
    } else {
      throw new Error("Tipo inválido.");
    }
  }
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const type = b.type === "RESERVAR" || b.type === "LIBERAR" || b.type === "BAIXA" ? b.type : null;
  const reason = String(b.reason || "").trim();
  const notes = String(b.notes || "").trim();
  const items = Array.isArray(b.items) ? b.items : [];

  if (!type || !reason || !items.length) {
    return res.status(400).json({ error: "Preencha tipo, motivo e ao menos um item." });
  }

  try {
    createReservaTx({ type, reason, notes, items }, req.user);
    broadcast("estoque");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar." });
  }
});

module.exports = router;
