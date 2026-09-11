const mercadoLivre = require("./MercadoLivreProvider");
const shopee = require("./ShopeeProvider");

const PROVIDERS = {
  mercado_livre: mercadoLivre,
  shopee: shopee,
};

function obterProvider(marketplace) {
  const provider = PROVIDERS[marketplace];
  if (!provider) throw new Error(`Marketplace desconhecido: ${marketplace}`);
  return provider;
}

module.exports = { PROVIDERS, obterProvider };
