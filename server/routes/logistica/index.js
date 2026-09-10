const express = require("express");
const { requireAuth } = require("../../auth");

const router = express.Router();
router.use(requireAuth);

router.use("/produtos", require("./produtos"));
router.use("/mapa", require("./mapa"));
router.use("/movimentacoes", require("./movimentacoes"));
router.use("/historico", require("./historico"));
router.use("/dashboard", require("./dashboard"));
router.use("/orcamentos", require("./orcamentos"));

module.exports = router;
