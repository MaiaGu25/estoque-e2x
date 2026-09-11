// Interface comum que qualquer adaptador de marketplace deve implementar.
// O resto do sistema (importação, sincronização, reconciliação) só
// conversa com essa interface - nunca com o formato específico de uma
// API. Cada método aqui devolve sempre o MESMO formato normalizado
// (ver `normalizeStatus.js` e o formato de pedido em `orders.js`),
// nunca o payload bruto do marketplace.
//
// Nesta fase (Fase 1, sem credenciais reais configuradas) nenhuma
// implementação concreta faz uma chamada de rede de verdade - todas
// lançam um erro claro "integração não configurada" até que as
// credenciais de uma conta existam (ver docs/marketplace-integracao.md).
//
// Contrato esperado de cada provider concreto:
//   marketplace: 'mercado_livre' | 'shopee'
//   testarConexao(account): Promise<{ ok: boolean, mensagem: string }>
//   buscarPedido(account, idExterno): Promise<PedidoNormalizado>
//   listarPedidosRecentes(account, desde): Promise<PedidoNormalizado[]>
//   renovarToken(account): Promise<void>
//
// PedidoNormalizado é o mesmo formato aceito por
// `criarOuAtualizarPedidoTx` em server/lib/marketplace/orders.js.

class IntegracaoNaoConfiguradaError extends Error {
  constructor(marketplace, account) {
    super(
      `A integração com ${marketplace} ainda não está configurada${
        account ? ` para a loja "${account.nome_interno}"` : ""
      }. Configure a variável de ambiente indicada em credencial_ref (veja docs/marketplace-integracao.md) para habilitar esta fase.`
    );
    this.name = "IntegracaoNaoConfiguradaError";
  }
}

module.exports = { IntegracaoNaoConfiguradaError };
