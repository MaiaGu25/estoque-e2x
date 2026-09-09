const express = require("express");
const { requireAuth } = require("../../auth");
const { broadcast } = require("../../realtime");
const {
  registrarEntradaTx,
  registrarSaidaTx,
  registrarTransferenciaTx,
  registrarAjusteTx,
} = require("../../lib/logisticaMovimentos");

const router = express.Router();
router.use(requireAuth);

router.post("/entrada", (req, res) => {
  try {
    const number = registrarEntradaTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, number });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar a entrada." });
  }
});

router.post("/saida", (req, res) => {
  try {
    const number = registrarSaidaTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, number });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar a saída." });
  }
});

router.post("/transferencia", (req, res) => {
  try {
    const number = registrarTransferenciaTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, number });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar a transferência." });
  }
});

router.post("/ajuste", (req, res) => {
  try {
    const { number, diferenca } = registrarAjusteTx(req.body || {}, req.user);
    broadcast("logistica");
    res.json({ ok: true, number, diferenca });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar o ajuste." });
  }
});

module.exports = router;
