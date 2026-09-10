const express = require("express");
const { requireAuth, requireAdmin } = require("../auth");
const service = require("../centralFotos/service");
const apiClient = require("../centralFotos/apiClient");
const { ImagemInvalidaError } = require("../centralFotos/processing");

const router = express.Router();

// Permite consumo por outro processo/serviço via token fixo (variável de
// ambiente, nunca no código/Git), sem precisar de sessão de usuário -
// usado só nas rotas de leitura (consulta por SKU e imagens não-originais).
// Se não houver token configurado ou enviado, cai na autenticação normal
// por cookie de sessão.
function requireAuthOuServiceToken(req, res, next) {
  const tokenEsperado = process.env.CENTRAL_FOTOS_SERVICE_TOKEN;
  const tokenRecebido = req.headers["x-service-token"];
  if (tokenEsperado && tokenRecebido && tokenRecebido === tokenEsperado) return next();
  return requireAuth(req, res, next);
}

// Sem requireAuth no nível do router de propósito: as rotas de consulta
// (SKU e imagens não-originais) usam requireAuthOuServiceToken, que só
// cai para a sessão normal quando não há token de serviço válido. Um
// requireAuth aqui em cima rejeitaria a chamada com token antes mesmo de
// ela chegar nessa checagem. Por isso toda rota abaixo declara sua
// própria autenticação explicitamente - as administrativas usam
// "requireAuth, requireAdmin" (requireAdmin sozinho quebra, porque
// pressupõe que req.user já foi preenchido por um requireAuth anterior).

const jsonPequeno = express.json({ limit: "1mb" });
// Limite maior só na rota de envio de foto - o restante da API continua
// com o corpo pequeno, e o tamanho de verdade é validado contra o buffer
// decodificado em server/centralFotos/processing.js, não neste limite.
const jsonUpload = express.json({ limit: "16mb" });

function tratarErro(res, error) {
  if (error instanceof service.NaoEncontradoError) return res.status(404).json({ error: error.message });
  if (error instanceof service.ConflitoError) {
    return res.status(409).json({ error: error.message, ...(error.detalhes ? { detalhes: error.detalhes } : {}) });
  }
  if (error instanceof service.DadosInvalidosError || error instanceof ImagemInvalidaError) {
    return res.status(400).json({ error: error.message });
  }
  console.error("Central de Fotos:", error);
  return res.status(500).json({ error: "Erro interno do servidor." });
}

// ---- Produtos (administração) ----

router.get("/produtos", requireAuth, requireAdmin, (req, res) => {
  const { busca, categoria, status, foto, pagina, porPagina } = req.query;
  res.json(service.listarProdutos({ busca, categoria, status, foto, pagina: Number(pagina) || 1, porPagina: Number(porPagina) || 24 }));
});

router.get("/produtos/categorias", requireAuth, requireAdmin, (req, res) => {
  res.json({ categorias: service.listarCategorias() });
});

router.post("/produtos", requireAuth, requireAdmin, jsonPequeno, (req, res) => {
  try {
    res.json(service.criarProduto(req.body || {}, req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

router.get("/produtos/:id", requireAuth, requireAdmin, (req, res) => {
  const detalhe = service.buscarProdutoDetalhado(Number(req.params.id));
  if (!detalhe) return res.status(404).json({ error: "Produto não encontrado." });
  res.json(detalhe);
});

router.patch("/produtos/:id", requireAuth, requireAdmin, jsonPequeno, (req, res) => {
  try {
    res.json(service.atualizarProduto(Number(req.params.id), req.body || {}, req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

// ---- Imagens de um produto (administração) ----

router.post("/produtos/:id/imagens", requireAuth, requireAdmin, jsonUpload, async (req, res) => {
  try {
    res.json(await service.adicionarImagem(Number(req.params.id), req.body || {}, req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

router.post("/produtos/:id/imagens/:imagemId/principal", requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(service.definirPrincipal(Number(req.params.id), Number(req.params.imagemId), req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

router.post("/produtos/:id/imagens/ordem", requireAuth, requireAdmin, jsonPequeno, (req, res) => {
  try {
    res.json(service.reordenarImagens(Number(req.params.id), (req.body || {}).ordem, req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

router.delete("/produtos/:id/imagens/:imagemId", requireAuth, requireAdmin, jsonPequeno, (req, res) => {
  try {
    res.json(service.excluirImagem(Number(req.params.id), Number(req.params.imagemId), req.body || {}, req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

router.post("/produtos/:id/imagens/:imagemId/restaurar", requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(service.restaurarImagem(Number(req.params.id), Number(req.params.imagemId), req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

// ---- Visão geral e manutenção (administração) ----

router.get("/visao-geral", requireAuth, requireAdmin, (req, res) => {
  res.json(service.visaoGeral());
});

router.get("/manutencao/diagnostico", requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await service.diagnostico());
  } catch (error) {
    tratarErro(res, error);
  }
});

router.post("/manutencao/limpar-lixeira", requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json(await service.limparLixeira(req.user));
  } catch (error) {
    tratarErro(res, error);
  }
});

// ---- API interna de consulta (outros módulos / outros sistemas) ----

router.get("/products/:sku/photos", requireAuthOuServiceToken, (req, res) => {
  const resultado = apiClient.getProductPhotosBySku(req.params.sku);
  if (!resultado) return res.status(404).json({ error: "SKU não encontrado." });
  res.json(resultado);
});

async function servirVariante(req, res, variante) {
  try {
    const dado = await service.lerVarianteImagem(req.params.id, variante);
    if (!dado) return res.status(404).json({ error: "Imagem não encontrada." });
    if (req.headers["if-none-match"] === dado.etag) return res.status(304).end();
    res.setHeader("Content-Type", dado.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("ETag", dado.etag);
    if (variante === "original") {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(dado.nomeOriginal || "imagem")}"`);
    }
    res.send(dado.buffer);
  } catch (error) {
    tratarErro(res, error);
  }
}

router.get("/images/:id/thumbnail", requireAuthOuServiceToken, (req, res) => servirVariante(req, res, "thumbnail"));
router.get("/images/:id/optimized", requireAuthOuServiceToken, (req, res) => servirVariante(req, res, "optimized"));
// Original só para administradores - o restante do sistema nunca precisa
// do arquivo bruto, só das versões já otimizadas para exibição.
router.get("/images/:id/original", requireAuth, requireAdmin, (req, res) => servirVariante(req, res, "original"));

module.exports = router;
