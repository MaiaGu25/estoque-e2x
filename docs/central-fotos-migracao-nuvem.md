# Central de Fotos — migração futura para armazenamento em nuvem

A Central de Fotos guarda os arquivos (original, otimizada, miniatura) através
de uma abstração (`StorageProvider`, em `server/centralFotos/storage/`), não
diretamente pelo caminho do disco. Hoje só existe o `LocalStorageProvider`
(disco local, pasta configurável por `CENTRAL_FOTOS_DIR`). Este documento
descreve como trocar para um armazenamento de objetos (Cloudflare R2, Amazon
S3 ou qualquer serviço compatível com a API do S3) sem mudar a API nem como os
outros módulos consultam as fotos.

## O que não muda

- O contrato da API (`/api/central-fotos/products/:sku/photos`,
  `/api/central-fotos/images/:id/thumbnail|optimized|original`) continua
  igual — quem consome (frontend, outros módulos, `apiClient.js`) nunca lida
  com o provedor de armazenamento diretamente.
- IDs, SKUs, ordem das imagens, foto principal e todo o histórico de
  auditoria continuam no banco isolado (`central_fotos.db`) exatamente como
  estão hoje.
- As colunas `storage_key_original`, `storage_key_otimizada` e
  `storage_key_miniatura` na tabela `cf_imagens` já guardam apenas uma chave
  opaca (hoje, um nome de arquivo) — não um caminho de disco.

## Passo a passo da migração

1. **Implementar `CloudStorageProvider`** em
   `server/centralFotos/storage/CloudStorageProvider.js`, cumprindo o mesmo
   contrato documentado em `StorageProvider.js` (`put`, `get`, `exists`,
   `remove`, todos recebendo a mesma `key` já usada hoje). Usar o SDK oficial
   do provedor escolhido (AWS SDK v3 pro S3, ou o cliente S3-compatível pro
   R2/outros).
2. **Copiar os arquivos existentes** das pastas locais
   (`data/central-fotos/original|optimized|thumbnails`) para o bucket,
   preservando a mesma `key` (nome de arquivo) de cada um — isso é o que
   garante que nenhuma linha do banco precise mudar.
3. **Verificar o hash depois da cópia**: recalcular o SHA-256 de cada arquivo
   já no bucket e comparar com `cf_imagens.hash_sha256` (o original) antes de
   considerar a migração daquele arquivo concluída.
4. **Trocar o provider por configuração**, sem alterar código de quem
   consome: em `server/centralFotos/storage/index.js`, decidir entre
   `LocalStorageProvider` e `CloudStorageProvider` a partir de uma variável
   de ambiente (ex.: `CENTRAL_FOTOS_STORAGE_PROVIDER=local|cloud`), montando
   o segundo com as credenciais/bucket vindos de outras variáveis de
   ambiente (nunca commitadas no Git).
5. **Migrar em lotes**, produto por produto ou por período, e só apagar o
   arquivo local depois de confirmar o hash no bucket — assim uma migração
   interrompida no meio nunca perde arquivo nenhum (o local continua servindo
   até o provider trocar de fato).
6. **Trocar a variável de ambiente** e reiniciar o servidor. Nenhuma
   migration de banco é necessária — as chaves já são as mesmas.

## O que fica preservado automaticamente

Como o relacionamento interno usa sempre o ID do produto/imagem (nunca o
caminho físico), a migração preserva sozinha: IDs, SKUs, ordem de exibição,
qual imagem é a principal, e todo o histórico de auditoria (`cf_auditoria`).
Nada disso precisa de tratamento especial na migração de armazenamento.
