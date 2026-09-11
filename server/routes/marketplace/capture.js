const express = require("express");
const { processarCaptura, descartarCaptura } = require("../../lib/marketplace/capture/service");

const router = express.Router();

router.post("/", async (req, res) => {
  const dataUrl = (req.body || {}).imagem;
  if (!dataUrl) return res.status(400).json({ error: "Envie a captura de tela." });
  try {
    const resultado = await processarCaptura(dataUrl, req.user);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível processar a captura." });
  }
});

router.delete("/:id", (req, res) => {
  try {
    descartarCaptura(Number(req.params.id), req.user);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível descartar a captura." });
  }
});

module.exports = router;
