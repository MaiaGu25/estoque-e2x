const express = require("express");
const { buscarSerialDetalhado, normalizarSerial } = require("../../lib/logisticaSerial");

const router = express.Router();

// Consulta única usada tanto pela conferência quanto pela separação: nunca
// cria nada, só devolve o que existe (ou null) para a tela decidir qual
// dos estados mostrar (não encontrado / já cadastrado / de outro produto).
router.get("/:valor", (req, res) => {
  const valor = normalizarSerial(req.params.valor);
  if (!valor) return res.status(400).json({ error: "Informe um número de série." });
  const encontrado = buscarSerialDetalhado(valor);
  res.json({ valor, encontrado: encontrado ? encontrado.serial : null, historico: encontrado ? encontrado.historico : [] });
});

module.exports = router;
