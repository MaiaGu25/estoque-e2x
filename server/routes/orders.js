const express = require("express");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth);

const createOrderTx = transaction((b, user) => {
  const now = nowStamp();
  const number = `${b.type === "ENTRADA" ? "ENT" : "OS"}-${now.slice(0, 10).replaceAll("-", "")}-${String(
    Date.now()
  ).slice(-5)}`;

  const orderResult = db
    .prepare(
      "INSERT INTO orders (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?)"
    )
    .run(number, b.type, b.reason, user.name, b.notes, user.id, now);
  const orderId = orderResult.lastInsertRowid;

  for (const item of b.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

    const part = db
      .prepare("SELECT id, quantity FROM parts WHERE id = ? AND active = 1")
      .get(Number(item.partId));
    if (!part) throw new Error("Peça não encontrada.");

    const next = b.type === "ENTRADA" ? part.quantity + qty : part.quantity - qty;
    if (next < 0) throw new Error("Saldo insuficiente para concluir a ordem.");

    const changed = db
      .prepare("UPDATE parts SET quantity = ?, updated_at = ? WHERE id = ? AND quantity = ?")
      .run(next, now, part.id, part.quantity);
    if (!changed.changes) throw new Error("O saldo mudou durante a operação. Tente novamente.");

    db.prepare(
      "INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).run(part.id, orderId, b.type, qty, part.quantity, next, b.reason, user.name, b.notes, user.id, now);
  }

  return number;
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const type = b.type === "ENTRADA" || b.type === "SAIDA" ? b.type : null;
  const reason = String(b.reason || "").trim();
  const notes = String(b.notes || "").trim();
  const items = Array.isArray(b.items) ? b.items : [];

  if (!type || !reason || !items.length) {
    return res.status(400).json({ error: "Preencha tipo, motivo e ao menos um item." });
  }

  try {
    const number = createOrderTx({ type, reason, notes, items }, req.user);
    res.json({ ok: true, number });
  } catch (error) {
    // A transação já desfez qualquer alteração parcial no banco.
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar a ordem." });
  }
});

module.exports = router;
