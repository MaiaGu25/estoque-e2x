const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

// Implementação em disco local do contrato descrito em StorageProvider.js.
// "key" é sempre um nome de arquivo gerado pelo servidor (UUID), nunca
// algo vindo do cliente - não existe risco de path traversal aqui porque
// nenhuma parte do caminho é controlada por fora.
class LocalStorageProvider {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  resolve(key) {
    return path.join(this.rootDir, key);
  }

  async put(key, buffer) {
    const dest = this.resolve(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
  }

  async get(key) {
    return fs.readFile(this.resolve(key));
  }

  async exists(key) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key) {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  // Usado só pelo diagnóstico administrativo (relatório de espaço/consistência),
  // por isso síncrono e tolerante a arquivo ausente.
  sizeSync(key) {
    try {
      return fsSync.statSync(this.resolve(key)).size;
    } catch {
      return 0;
    }
  }
}

module.exports = { LocalStorageProvider };
