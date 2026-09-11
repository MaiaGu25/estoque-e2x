# Marketplace — como conectar cada loja no futuro

O módulo Marketplace já está completo (banco, telas, pedidos manuais,
captura de tela, reservas, sincronização, alertas, auditoria) e funciona
hoje em **modo desconectado**: nenhuma loja está de fato ligada ao Mercado
Livre ou à Shopee, então tudo que chega ao sistema hoje entra pelo cadastro
manual ou pela captura de tela. Este documento explica o que falta para
ligar cada integração de verdade, sem inventar nada que ainda não existe.

## O que já está pronto para receber a integração real

- **Adaptador único** (`server/lib/marketplace/providers/`): `MarketplaceProvider.js`
  documenta o contrato (`testarConexao`, `buscarPedido`, `listarPedidosRecentes`,
  `renovarToken`); `MercadoLivreProvider.js` e `ShopeeProvider.js` já têm essa
  forma, só faltando implementar as chamadas HTTP reais.
- **Núcleo de importação idempotente** (`server/lib/marketplace/orders.js`,
  função `criarOuAtualizarPedidoTx`): já trata duplicidade, vinculação de SKU,
  reserva de estoque, divergência de saldo insuficiente e reconciliação de
  pedido manual. Um provider real só precisa entregar o pedido já normalizado
  nesse formato - o resto do sistema não muda.
- **Fila de sincronização e falhas** (`server/lib/marketplace/sync.js` +
  `server/jobs/marketplaceSync.js`): reconciliação periódica, retry com atraso
  progressivo e ações administrativas (testar conexão, sincronizar agora,
  buscar pedido, reprocessar falha) já funcionam - hoje só retornam "não
  configurado" porque nenhum provider tem credencial.
- **Cadastro de lojas** (aba "Lojas"): já permite cadastrar quantas contas
  quiser de cada marketplace, sem limite fixo, guardando só o **nome da
  variável de ambiente** que terá a credencial (nunca o valor).

## Passo a passo por marketplace

### Mercado Livre (Fase 2)

1. Criar uma aplicação no Mercado Livre Developers e obter `client_id`/`client_secret`.
2. **Antes de escrever qualquer chamada**, conferir a documentação oficial
   vigente do Mercado Livre para: fluxo OAuth (authorization code + PKCE),
   endpoints de pedidos (busca e detalhe), formato exato dos campos de
   status, formato e assinatura dos webhooks (`topic=orders_v2`), limites de
   requisição e paginação. Nada disso foi verificado nesta implementação -
   a tabela de mapeamento de status em `normalizeStatus.js` é só um rascunho
   com nomes públicos conhecidos, marcado explicitamente como não validado.
3. Implementar o fluxo OAuth (pode viver em `server/routes/marketplace/oauth.js`,
   novo) usando `MERCADOLIVRE_CLIENT_ID`/`MERCADOLIVRE_CLIENT_SECRET`/
   `MERCADOLIVRE_REDIRECT_URI`. Guardar o `access_token`/`refresh_token`
   resultantes em variáveis de ambiente próprias por loja (ex.:
   `MERCADOLIVRE_LOJA1_ACCESS_TOKEN`) ou em outro cofre de segredos do
   ambiente de hospedagem - nunca em coluna de banco sem criptografia nem
   em log.
4. Preencher `credencial_ref` da loja (aba "Lojas") com o nome dessa
   variável. `testarConexao`/`buscarPedido`/`listarPedidosRecentes` em
   `MercadoLivreProvider.js` passam a funcionar de verdade.
5. Registrar o webhook do Mercado Livre apontando para uma URL pública
   HTTPS do seu ambiente hospedado (`MARKETPLACE_BASE_URL` + uma rota nova,
   ex.: `/api/marketplace/webhooks/mercado-livre`) - **isso não existe
   enquanto o sistema roda só localmente pelo IP**, ver seção abaixo.
6. Mesmo com o webhook ativo, a reconciliação periódica
   (`MARKETPLACE_SYNC_INTERVAL_MS`) continua rodando - é o que garante que
   um pedido nunca fica perdido só porque uma notificação não chegou.

### Shopee (Fase 3)

1. Criar um app na Shopee Open Platform e obter `partner_id`/`partner_key`.
2. Conferir a documentação oficial vigente da Shopee para: autenticação por
   assinatura HMAC por requisição, `shop_id` por loja autorizada, endpoints
   de pedidos, formato dos status e das notificações push. Também não
   verificado nesta implementação.
3. Implementar a autenticação em `ShopeeProvider.js` usando
   `SHOPEE_PARTNER_ID`/`SHOPEE_PARTNER_KEY` e, por loja,
   `SHOPEE_LOJA1_SHOP_ID`/`SHOPEE_LOJA1_ACCESS_TOKEN`/`SHOPEE_LOJA1_REFRESH_TOKEN`.
4. Mesmo passo a passo de cadastro de `credencial_ref` e webhook descrito
   acima para o Mercado Livre.

## Local (Windows, pelo IP) x hospedado

Callbacks OAuth e webhooks exigem um endereço HTTPS público que os
servidores do Mercado Livre/Shopee conseguem alcançar pela internet - um
IP de rede local (ex.: `192.168.0.10`) nunca vai receber essas chamadas.
Por isso:

- Enquanto o sistema rodar só localmente, deixe as lojas cadastradas sem
  `credencial_ref` (ou com uma variável vazia) - o módulo continua
  funcionando inteiro em modo manual/captura de tela, e a tela de
  Sincronização mostra claramente "Não configurada" em vez de fingir uma
  conexão que não existe.
- Quando o sistema for hospedado com um domínio e HTTPS de verdade,
  defina `MARKETPLACE_BASE_URL` com essa URL pública, cadastre os
  callbacks/webhooks nos painéis de desenvolvedor de cada marketplace
  apontando para ela, e só então preencha as variáveis de credencial.
- Nunca hardcode `localhost` ou um IP fixo em código - toda URL pública
  usada pelas integrações deve vir de `MARKETPLACE_BASE_URL`.

## Backup

As tabelas do Marketplace vivem no mesmo banco principal
(`data/estoque.db`), então já são cobertas pelos scripts existentes
(`FAZER_BACKUP.bat`/`RESTAURAR_ULTIMO_BACKUP.bat`) sem nenhuma mudança.
As capturas de tela ficam em `data/marketplace/capturas/` (mesma pasta
`data/`, também coberta pelo backup) e são apagadas automaticamente depois
de `MARKETPLACE_CAPTURE_RETENCAO_DIAS` dias.
