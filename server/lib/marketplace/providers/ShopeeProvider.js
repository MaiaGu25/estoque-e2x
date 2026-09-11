const { IntegracaoNaoConfiguradaError } = require("./MarketplaceProvider");

// Adaptador da Shopee. Fase 1: sem chamadas reais - estrutura tipada,
// pronta para a Fase 3 preencher.
//
// Quando a Fase 3 for implementada, aqui entra:
// - autenticação por partner_id/partner_key com assinatura HMAC por
//   requisição, conforme a documentação oficial da Shopee Open Platform
//   (verificar antes de implementar - não foi verificada agora);
// - shop_id por loja conectada (SHOPEE_LOJA*_SHOP_ID);
// - renovação de access_token/refresh_token conforme o fluxo oficial;
// - endpoint de pedidos (get_order_list / get_order_detail - confirmar
//   nomes exatos na documentação oficial vigente antes de chamar);
// - validação de assinatura dos webhooks (push notifications);
// - paginação e limite de requisições conforme a documentação oficial.
const marketplace = "shopee";

function credencialConfigurada(account) {
  return !!(account.credencial_ref && process.env[account.credencial_ref]);
}

async function testarConexao(account) {
  if (!credencialConfigurada(account)) {
    return { ok: false, mensagem: "Nenhuma credencial configurada para esta loja (variável de ambiente vazia)." };
  }
  throw new IntegracaoNaoConfiguradaError(marketplace, account);
}

async function buscarPedido(account) {
  throw new IntegracaoNaoConfiguradaError(marketplace, account);
}

async function listarPedidosRecentes(account) {
  throw new IntegracaoNaoConfiguradaError(marketplace, account);
}

async function renovarToken(account) {
  throw new IntegracaoNaoConfiguradaError(marketplace, account);
}

module.exports = { marketplace, testarConexao, buscarPedido, listarPedidosRecentes, renovarToken };
