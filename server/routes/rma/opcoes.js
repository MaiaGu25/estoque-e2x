const express = require("express");
const { requireAdmin } = require("../../auth");
const { broadcast } = require("../../realtime");
const opcoes = require("../../lib/rma/opcoes");

const router = express.Router();

// Só administradores mexem nas listas configuráveis (status, canal de
// compra, motivo do produto, etc.) - usuários do SAC/recebimento só as
// enxergam através dos selects normais do protocolo.
router.use(requireAdmin);

router.get("/", (req, res) => {
  res.json({ opcoes: opcoes.listarTodas({ incluirInativos: true }) });
});

router.post("/:tipo", (req, res) => {
  try {
    const opcao = opcoes.criar({ tipo: req.params.tipo, rotulo: (req.body || {}).rotulo, cor: (req.body || {}).cor, user: req.user });
    broadcast("rma");
    res.json({ ok: true, opcao });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/item/:id", (req, res) => {
  try {
    const b = req.body || {};
    let opcao;
    if (b.ativo !== undefined) {
      opcao = opcoes.definirAtiva({ id: Number(req.params.id), ativo: !!b.ativo });
    } else {
      opcao = opcoes.editar({ id: Number(req.params.id), rotulo: b.rotulo, cor: b.cor });
    }
    broadcast("rma");
    res.json({ ok: true, opcao });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/:tipo/reordenar", (req, res) => {
  try {
    const lista = opcoes.reordenar({ tipo: req.params.tipo, ids: (req.body || {}).ids || [] });
    broadcast("rma");
    res.json({ ok: true, opcoes: lista });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
