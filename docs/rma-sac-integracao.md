# RMA / SAC — pontos de extensão para integração futura com o Mercado Livre

Esta versão do módulo é **100% manual**: todo protocolo é aberto por uma
pessoa do SAC, e toda identificação de etiqueta compara contra números
digitados manualmente no cadastro. Não existe nenhuma chamada de rede para
o Mercado Livre nem qualquer simulação de integração - só os pontos de
extensão abaixo, prontos para receber a importação automática no futuro
sem precisar redesenhar o restante do módulo.

## Onde a importação automática entraria

- **Identificação por etiqueta** (`server/lib/rma/etiqueta.js`, função
  `buscar`): hoje só normaliza o número digitado/lido e compara contra os
  5 campos já cadastrados manualmente (pedido/sistema/envio/reversa/
  rastreio). O comentário no topo do arquivo marca exatamente onde entraria
  um pré-processamento de "texto lido de uma etiqueta/QR do Mercado Livre"
  → "número normalizado", sem mexer em mais nada da função.
- **Criação de protocolo** (`server/lib/rma/protocolos.js`, função
  `criarCore`): hoje só é chamada pelo wizard manual e pela importação de
  Excel. Uma futura importação automática do Mercado Livre chamaria essa
  mesma função (ou a variante transacional `criar`), preenchendo `dados` e
  `cliente` a partir da reclamação recebida pela API, e reaproveitando de
  graça a checagem de duplicidade, a auditoria e a validação contra as
  listas configuráveis.
- **Antes de implementar de verdade**: conferir a documentação oficial
  vigente do Mercado Livre para o fluxo de reclamações/devoluções (`claims`/
  `returns` na API de pós-venda) - formato dos eventos, como a plataforma
  identifica pedido/reversa/rastreio, e se existe webhook específico. Nada
  disso foi verificado nesta implementação.

## O que nunca deve mudar quando essa integração for implementada

- O módulo continua **nunca** movimentando estoque - uma reclamação
  importada automaticamente do Mercado Livre também não pode criar
  entrada/saída/reserva.
- Toda ação continuaria passando pelas mesmas listas administráveis
  (`rma_opcoes`) e pelo mesmo histórico granular (`rma_historico`) - um
  protocolo importado automaticamente é auditado exatamente como um
  cadastrado manualmente, só que com `acao` indicando a origem automática.

## Backup

As tabelas do RMA/SAC (`rma_protocolos`, `rma_clientes`, `rma_produtos`,
`rma_solucoes`, `rma_opcoes`, `rma_historico`, `rma_recebimentos`,
`rma_anexos`, e as antigas `rma_casos`/`rma_eventos`, mantidas apenas como
histórico da versão anterior) vivem no mesmo banco principal
(`data/estoque.db`), já cobertas pelos scripts existentes
(`FAZER_BACKUP.bat`/`RESTAURAR_ULTIMO_BACKUP.bat`) sem nenhuma mudança.
Os anexos ficam em `data/rma/` (mesma pasta usada pelo módulo antigo).
