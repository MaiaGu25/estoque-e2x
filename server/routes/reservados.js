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

    const next = b.type === "RESERVAR" ? part.reserved_quantity + qty : part.reserved_quantity - qty;
    if (next < 0) throw new Error("Não há reserva suficiente para liberar essa quantidade.");
    if (next > part.quantity) throw new Error("Saldo insuficiente para reservar essa quantidade.");

    const changed = db
      .prepare("UPDATE parts SET reserved_quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ?")
      .run(next, now, part.id, part.reserved_quantity);
    if (!changed.changes) throw new Error("A reserva mudou durante a operação. Tente novamente.");

    db.prepare(
      `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(part.id, b.type, qty, part.reserved_quantity, next, b.reason, user.name, b.notes, user.id, now);
  }
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const type = b.type === "RESERVAR" || b.type === "LIBERAR" ? b.type : null;
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
