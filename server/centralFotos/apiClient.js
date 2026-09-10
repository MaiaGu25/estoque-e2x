const { db } = require("./db");
const cache = require("./cache");
const { normalizarSku } = require("./validation");

function montarUrlImagem(imagemId, variante) {
  return `/api/central-fotos/images/${imagemId}/${variante}`;
}

function montarRespostaFoto(imagem) {
  if (!imagem) return null;
  return {
    id: imagem.id,
    thumbnailUrl: montarUrlImagem(imagem.id, "thumbnail"),
    optimizedUrl: montarUrlImagem(imagem.id, "optimized"),
    originalUrl: montarUrlImagem(imagem.id, "original"),
    width: imagem.largura,
    height: imagem.altura,
    mimeType: imagem.mime_type,
    updatedAt: imagem.updated_at,
  };
}

// Cliente interno reutilizável por qualquer outro módulo do mesmo
// processo pra consultar as fotos de um produto pelo SKU - é a mesma
// consulta que a rota GET /api/central-fotos/products/:sku/photos expõe
// por HTTP pra sistemas realmente externos, só que em chamada de função
// direta (mais rápida, sem round-trip de rede, já que roda no mesmo
// processo Node do resto do sistema).
//
// Nunca lança erro pra "SKU não existe" - devolve null, pra quem consome
// decidir sozinho o que mostrar (placeholder, ocultar a foto, etc.) sem
// precisar de try/catch. Erros de banco genuinamente inesperados ainda
// propagam, porque aí é uma falha real que quem chamou precisa saber.
function getProductPhotosBySku(sku) {
  const skuNormalizado = normalizarSku(sku);
  if (!skuNormalizado) return null;

  const cacheado = cache.get(skuNormalizado);
  if (cacheado !== undefined) return cacheado;

  const produto = db.prepare("SELECT * FROM cf_produtos WHERE sku_normalizado = ?").get(skuNormalizado);
  if (!produto) {
    cache.set(skuNormalizado, null);
    return null;
  }

  const imagens = db
    .prepare("SELECT * FROM cf_imagens WHERE produto_id = ? AND status = 'ativa' ORDER BY principal DESC, ordem ASC")
    .all(produto.id);
  const principal = imagens.find((i) => i.principal) || null;
  const adicionais = imagens.filter((i) => !i.principal);

  const resultado = {
    sku: produto.sku,
    productId: produto.id,
    name: produto.nome,
    primary: montarRespostaFoto(principal),
    additional: adicionais.map(montarRespostaFoto),
    updatedAt: produto.updated_at,
  };

  cache.set(skuNormalizado, resultado);
  return resultado;
}

// Chamado por service.js sempre que produto/fotos de um SKU mudam.
function invalidarCacheDoSku(sku) {
  const skuNormalizado = normalizarSku(sku);
  if (skuNormalizado) cache.invalidate(skuNormalizado);
}

module.exports = { getProductPhotosBySku, invalidarCacheDoSku };
