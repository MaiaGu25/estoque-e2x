// Cache bem curto do resultado de "fotos por SKU", só pra não bater no
// banco a cada consulta em uma tela com vários produtos na mesma página.
// Invalidado explicitamente por service.js sempre que algo muda nas fotos
// de um produto (nunca fica sem atualizar por até TTL_MS - é só um teto).
const TTL_MS = Number(process.env.CENTRAL_FOTOS_CACHE_TTL_MS || 30000);
const cache = new Map();

function get(chave) {
  const entrada = cache.get(chave);
  if (!entrada) return undefined;
  if (Date.now() > entrada.expira) {
    cache.delete(chave);
    return undefined;
  }
  return entrada.dados;
}

function set(chave, dados) {
  cache.set(chave, { dados, expira: Date.now() + TTL_MS });
}

function invalidate(chave) {
  cache.delete(chave);
}

module.exports = { get, set, invalidate };
