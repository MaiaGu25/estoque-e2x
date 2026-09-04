const express = require("express");
const { db } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const { from, to } = req.query;
  const hasRange = from && to;

  const parts = db.prepare("SELECT * FROM parts WHERE active = 1 ORDER BY name COLLATE NOCASE").all();

  const movements = hasRange
    ? db
        .prepare(
          `SELECT m.*, p.code, p.name AS part_name, p.unit FROM movements m
           JOIN parts p ON p.id = m.part_id
           WHERE m.created_at >= ? AND m.created_at < datetime(?, '+1 day')
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1000`
        )
        .all(from, to)
    : db
        .prepare(
          `SELECT m.*, p.code, p.name AS part_name, p.unit FROM movements m
           JOIN parts p ON p.id = m.part_id
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1000`
        )
        .all();

  const orders = db
    .prepare(
      `SELECT o.*, COUNT(m.id) AS item_count, COALESCE(SUM(m.quantity),0) AS total_quantity
       FROM orders o LEFT JOIN movements m ON m.order_id = o.id
       GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500`
    )
    .all();

  const members = db
    .prepare("SELECT id, name, role FROM users WHERE active = 1 ORDER BY name COLLATE NOCASE")
    .all();

  const reasons = db
    .prepare(
      "SELECT reason, COUNT(*) AS occurrences, SUM(quantity) AS quantity FROM movements WHERE type = 'SAIDA' GROUP BY reason ORDER BY quantity DESC LIMIT 12"
    )
    .all();

  res.json({ parts, movements, orders, members, reasons });
});

module.exports = router;
