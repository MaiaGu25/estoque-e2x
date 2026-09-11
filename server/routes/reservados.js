const express = require("express");
const { transaction } = require("../db");
const { requireAuth } = require("../auth");
const { broadcast } = require("../realtime");
const { reservaCore } = require("../lib/reservas");

const router = express.Router();
router.use(requireAuth);

const createReservaTx = transaction(reservaCore);

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
