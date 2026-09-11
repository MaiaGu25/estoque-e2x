const express = require("express");
const { db } = require("../../db");
const { broadcast } = require("../../realtime");
const { buscarPedidoExistente, criarOuAtualizarPedidoTx } = require("../../lib/marketplace/orders");
const { buscarPedidoNaApi } = require("../../lib/marketplace/sync");

const router = express.Router();

function erro(res, error, fallback) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

// Pesquisa obrigatória antes de qualquer cadastro manual - nunca deixa
// duplicar um pedido que já existe (automático ou manual).
router.post("/buscar-existente", (req, res) => {
  const b = req.body || {};
  const accountId = Number(b.accountId);
  if (!accountId) return res.status(400).json({ error: "Selecione a loja." });
  const existente = buscarPedidoExistente({ accountId, idExterno: b.idExterno, numeroVisivel: b.numeroVisivel });
  if (!existente) return res.json({ encontrado: null });
  const conta = db.prepare("SELECT nome_interno, apelido FROM marketplace_accounts WHERE id = ?").get(accountId);
  res.json({ encontrado: { ...existente, conta_nome: conta?.nome_interno, conta_apelido: conta?.apelido } });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.itens) || !b.itens.length) return res.status(400).json({ error: "Adicione pelo menos um produto ao pedido." });
  if (!String(b.motivoManual || "").trim()) return res.status(400).json({ error: "Informe o motivo do cadastro manual." });
  try {
    const resultado = criarOuAtualizarPedidoTx({ ...b, origem: "manual" }, req.user);
    broadcast("marketplace");
    res.json({ ok: true, ...resultado });
  } catch (error) {
    erro(res, error, "Não foi possível cadastrar o pedido manualmente.");
  }
});

// Antes de desistir e cadastrar manualmente, o administrador pode pedir
// uma nova tentativa de busca direto na API (quando a conta já estiver
// configurada - Fase 2/3).
router.post("/:accountId/buscar-na-api", async (req, res) => {
  const idExterno = String((req.body || {}).idExterno || "").trim();
  if (!idExterno) return res.status(400).json({ error: "Informe o ID ou número do pedido." });
  try {
    const resultado = await buscarPedidoNaApi(Number(req.params.accountId), idExterno, req.user);
    if (resultado.ok) broadcast("marketplace");
    res.json(resultado);
  } catch (error) {
    erro(res, error, "Não foi possível buscar o pedido na API.");
  }
});

module.exports = router;
