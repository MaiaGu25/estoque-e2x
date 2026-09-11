const express = require("express");
const anexos = require("../../lib/rma/anexos");

const router = express.Router();

router.get("/:id/arquivo", (req, res) => {
  const anexo = anexos.buscarPorId(Number(req.params.id));
  const caminho = anexos.caminhoSeguro(anexo);
  if (!caminho) return res.status(404).json({ error: "Anexo não encontrado." });
  res.sendFile(caminho);
});

module.exports = router;
