const express = require("express");
const { broadcast } = require("../../realtime");
const protocolos = require("../../lib/rma/protocolos");
const produtos = require("../../lib/rma/produtos");
const solucoes = require("../../lib/rma/solucoes");

const router = express.Router();

function tratarErro(res, error) {
  const status = error.duplicados || error.invalidas ? 409 : 400;
  const corpo = { error: error.message || "Não foi possível concluir a operação." };
  if (error.duplicados) corpo.duplicados = error.duplicados;
  res.status(status).json(corpo);
}

router.get("/", (req, res) => {
  const q = req.query;
  const resultado = protocolos.listar({
    numeroProtocolo: q.numeroProtocolo,
    status: q.status,
    canalCompra: q.canalCompra,
    cpfCnpj: q.cpfCnpj,
    numeroPedido: q.numeroPedido,
    numeroSistema: q.numeroSistema,
    numeroEnvio: q.numeroEnvio,
    numeroReversa: q.numeroReversa,
    numeroRastreio: q.numeroRastreio,
    cliente: q.cliente,
    dataAberturaDe: q.dataAberturaDe,
    dataAberturaAte: q.dataAberturaAte,
    pagina: q.pagina,
    porPagina: q.porPagina,
    ordenarPor: q.ordenarPor,
    ordem: q.ordem,
  });
  res.json(resultado);
});

router.post("/verificar-duplicidade", (req, res) => {
  const b = req.body || {};
  const duplicados = protocolos.verificarDuplicidade({
    numeroPedido: b.numeroPedido,
    numeroRastreio: b.numeroRastreio,
    cpfCnpj: b.cpfCnpj,
    excluirProtocoloId: b.excluirProtocoloId,
  });
  res.json({ duplicados });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  try {
    const protocolo = protocolos.criar({
      dados: b.dados || {},
      cliente: b.cliente || {},
      user: req.user,
      confirmarDuplicidade: !!b.confirmarDuplicidade,
    });
    broadcast("rma");
    res.json({ ok: true, protocolo });
  } catch (error) {
    tratarErro(res, error);
  }
});

router.get("/:id", (req, res) => {
  const protocolo = protocolos.buscarDetalhe(Number(req.params.id));
  if (!protocolo) return res.status(404).json({ error: "Protocolo não encontrado." });
  res.json({ protocolo });
});

router.patch("/:id", (req, res) => {
  try {
    const protocolo = protocolos.atualizar({ id: Number(req.params.id), dados: req.body || {}, user: req.user });
    broadcast("rma");
    res.json({ ok: true, protocolo });
  } catch (error) {
    tratarErro(res, error);
  }
});

router.patch("/:id/cliente", (req, res) => {
  try {
    const protocolo = protocolos.atualizarCliente({ protocoloId: Number(req.params.id), dados: req.body || {}, user: req.user });
    broadcast("rma");
    res.json({ ok: true, protocolo });
  } catch (error) {
    tratarErro(res, error);
  }
});

router.post("/:id/nota", (req, res) => {
  try {
    const b = req.body || {};
    const protocolo = protocolos.adicionarNota({ protocoloId: Number(req.params.id), texto: b.texto, foto: b.foto, user: req.user });
    broadcast("rma");
    res.json({ ok: true, protocolo });
  } catch (error) {
    tratarErro(res, error);
  }
});

// ---- Produtos do protocolo ----

router.get("/:id/produtos", (req, res) => {
  res.json({ produtos: produtos.listar(Number(req.params.id)) });
});

router.get("/produtos/referencia-estoque", (req, res) => {
  res.json({ resultados: produtos.buscarReferenciaEstoque(req.query.termo) });
});

router.post("/:id/produtos", (req, res) => {
  try {
    const produto = produtos.adicionar({ protocoloId: Number(req.params.id), dados: req.body || {}, user: req.user });
    broadcast("rma");
    res.json({ ok: true, produto });
  } catch (error) {
    tratarErro(res, error);
  }
});

router.patch("/produtos/:produtoId", (req, res) => {
  try {
    const produto = produtos.editar({ id: Number(req.params.produtoId), dados: req.body || {}, user: req.user });
    broadcast("rma");
    res.json({ ok: true, produto });
  } catch (error) {
    tratarErro(res, error);
  }
});

router.delete("/produtos/:produtoId", (req, res) => {
  try {
    produtos.remover({ id: Number(req.params.produtoId), user: req.user });
    broadcast("rma");
    res.json({ ok: true });
  } catch (error) {
    tratarErro(res, error);
  }
});

// ---- Solução do protocolo ----

router.get("/:id/solucao", (req, res) => {
  res.json({ solucao: solucoes.buscar(Number(req.params.id)) });
});

router.patch("/:id/solucao", (req, res) => {
  try {
    const solucao = solucoes.salvar({ protocoloId: Number(req.params.id), dados: req.body || {}, user: req.user });
    broadcast("rma");
    res.json({ ok: true, solucao });
  } catch (error) {
    tratarErro(res, error);
  }
});

module.exports = router;
