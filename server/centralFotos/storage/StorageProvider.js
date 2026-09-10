// Contrato que qualquer provedor de armazenamento da Central de Fotos
// precisa cumprir. Hoje só existe o LocalStorageProvider (disco local);
// no futuro um CloudStorageProvider (S3, Cloudflare R2, ou compatível)
// implementa o mesmo contrato, e a troca é só de configuração - nenhum
// código que chama put/get/exists/remove precisa mudar.
// Ver docs/central-fotos-migracao-nuvem.md para o plano de migração.
//
//   put(key, buffer)    -> Promise<void>   grava o arquivo
//   get(key)            -> Promise<Buffer> lê o arquivo inteiro
//   exists(key)         -> Promise<boolean>
//   remove(key)         -> Promise<void>   apaga (sem erro se já não existir)
//
// "key" é sempre um identificador opaco gerado pelo servidor (nunca um
// nome vindo do usuário nem um caminho absoluto), então nenhuma
// implementação precisa se preocupar com path traversal vindo de fora.
module.exports = {};
