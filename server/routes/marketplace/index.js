const express = require("express");
const { requireAuth, requireAdmin } = require("../../auth");

const router = express.Router();
// Módulo inteiro é só para administradores nesta fase (Marketplace lida
// com estoque, dinheiro e integrações externas) - aplicado aqui, na raiz
// de todas as sub-rotas, e não só escondendo o item do menu no frontend.
router.use(requireAuth, requireAdmin);

router.use("/dashboard", require("./dashboard"));
router.use("/contas", require("./accounts"));
router.use("/pedidos", require("./orders"));
router.use("/manual", require("./manual"));
router.use("/capturas", require("./capture"));
router.use("/anuncios", require("./listings"));
router.use("/estoque", require("./stock"));
router.use("/sincronizacao", require("./sync"));
router.use("/alertas", require("./alerts"));
router.use("/auditoria", require("./audit"));

module.exports = router;
