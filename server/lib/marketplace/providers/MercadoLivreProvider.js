const { IntegracaoNaoConfiguradaError } = require("./MarketplaceProvider");

// Adaptador do Mercado Livre. Fase 1: sem OAuth/chamadas reais - só a
// estrutura, tipada e pronta, para a Fase 2 preencher.
//
// Quando a Fase 2 for implementada, aqui entra:
// - OAuth (authorization code + PKCE) usando as variáveis
//   MERCADOLIVRE_CLIENT_ID / MERCADOLIVRE_CLIENT_SECRET / MERCADOLIVRE_REDIRECT_URI;
// - renovação de access_token via refresh_token antes do vencimento;
// - GET /orders/search e /orders/:id (verificar a documentação oficial
//   atual do Mercado Livre antes de implementar - não foi verificada
//   agora, então nenhum endpoint é chamado nesta fase);
// - validação de assinatura/origem dos webhooks (topic "orders_v2");
// - paginação e limite de requisições (rate limit) conforme a
//   documentação oficial.
const marketplace = "mercado_livre";

function credencialConfigurada(account) {
  return !!(account.credencial_ref && process.env[account.credencial_ref]);
}

async function testarConexao(account) {
  if (!credencialConfigurada(account)) {
    return { ok: false, mensagem: "Nenhuma credencial configurada para esta loja (variável de ambiente vazia)." };
  }
  // Fase 2: chamar um endpoint leve e autenticado da API oficial para
  // confirmar que o token ainda é válido.
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
