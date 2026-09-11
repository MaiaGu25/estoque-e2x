const express = require("express");
const { broadcast } = require("../../realtime");
const etiqueta = require("../../lib/rma/etiqueta");

const router = express.Router();

// Camada de identificação por etiqueta (lida ou digitada). Só consulta -
// nunca cria/altera protocolo aqui; a confirmação de recebimento é uma
// chamada separada (POST /:protocoloId/confirmar), sempre com o usuário
// autenticado como responsável. Toda consulta (achando ou não) já fica
// registrada dentro de etiqueta.buscar/marcarRecebido.
router.post("/buscar", (req, res) => {
  const resultado = etiqueta.buscar((req.body || {}).numero, req.user);
  res.json(resultado);
});

router.post("/:protocoloId/confirmar", (req, res) => {
  try {
    const b = req.body || {};
    const novoStatus = String(b.novoStatus || "recebido");
    const protocolo = etiqueta.marcarRecebido({
      protocoloId: Number(req.params.protocoloId),
      novoStatus,
      numeroPesquisado: b.numeroPesquisado || "",
      campoCorrespondido: b.campoCorrespondido || "",
      user: req.user,
    });
    broadcast("rma");
    res.json({ ok: true, protocolo });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
