const express = require("express");
const { requireAuth } = require("../../auth");
const opcoesLib = require("../../lib/rma/opcoes");

const router = express.Router();

// Todo o módulo exige login - RMA/SAC continua acessível para
// admin e operador (SAC e recebimento), igual ao módulo antigo. Só a
// administração das listas configuráveis (mais abaixo, em /opcoes) fica
// restrita a administradores.
router.use(requireAuth);

// Leitura das opções ativas de cada lista - usado para preencher os
// selects do wizard, disponível para qualquer usuário autenticado (a
// escrita/gestão dessas listas é só em /opcoes, admin-only).
router.get("/opcoes-ativas", (req, res) => {
  res.json({ opcoes: opcoesLib.listarTodas({ incluirInativos: false }) });
});

router.use("/protocolos", require("./protocolos"));
router.use("/etiqueta", require("./etiqueta"));
router.use("/opcoes", require("./opcoes"));
router.use("/excel", require("./excel"));
router.use("/anexos", require("./anexos"));

module.exports = router;
