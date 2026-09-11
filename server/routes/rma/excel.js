const express = require("express");
const { broadcast } = require("../../realtime");
const excel = require("../../lib/rma/excel");

const router = express.Router();

function enviarXlsx(res, buffer, nomeArquivo) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
  res.send(Buffer.from(buffer));
}

router.get("/exportar", async (req, res) => {
  try {
    const buffer = await excel.exportarProtocolos(req.query, req.user.name);
    enviarXlsx(res, buffer, `rma-sac-protocolos-${Date.now()}.xlsx`);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/modelo", async (req, res) => {
  try {
    const buffer = await excel.gerarModeloImportacao();
    enviarXlsx(res, buffer, "modelo-importacao-rma-sac.xlsx");
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Import em duas chamadas: primeiro só valida e devolve prévia (nunca
// grava nada), depois confirma - sempre revalidando do zero, nunca
// confiando na prévia anterior.
router.post("/importar/pre-visualizar", async (req, res) => {
  try {
    const arquivoBase64 = (req.body || {}).arquivo || "";
    const base64 = arquivoBase64.includes(",") ? arquivoBase64.split(",")[1] : arquivoBase64;
    const previa = await excel.pesquisar(Buffer.from(base64, "base64"));
    res.json(previa);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/importar/confirmar", async (req, res) => {
  try {
    const arquivoBase64 = (req.body || {}).arquivo || "";
    const base64 = arquivoBase64.includes(",") ? arquivoBase64.split(",")[1] : arquivoBase64;
    const criados = await excel.confirmar(Buffer.from(base64, "base64"), { user: req.user });
    broadcast("rma");
    res.json({ ok: true, criados });
  } catch (error) {
    const status = error.invalidas ? 409 : 400;
    res.status(status).json({ error: error.message, invalidas: error.invalidas });
  }
});

module.exports = router;
