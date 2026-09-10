const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { nowStamp } = require("../util");

// Banco isolado da Central de Fotos - propositalmente separado do
// data/estoque.db (server/db.js). Nenhuma tabela daqui referencia nem é
// referenciada por tabelas de outros módulos: a única forma de outro
// módulo enxergar essas fotos é pela API (ou pelo apiClient interno),
// nunca por uma junção direta de banco.
const BASE_DIR = process.env.CENTRAL_FOTOS_DIR
  ? path.resolve(process.env.CENTRAL_FOTOS_DIR)
  : path.join(__dirname, "..", "..", "data", "central-fotos");

const ORIGINAL_DIR = path.join(BASE_DIR, "original");
const OPTIMIZED_DIR = path.join(BASE_DIR, "optimized");
const THUMBNAILS_DIR = path.join(BASE_DIR, "thumbnails");

for (const dir of [BASE_DIR, ORIGINAL_DIR, OPTIMIZED_DIR, THUMBNAILS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(BASE_DIR, "central_fotos.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

function transaction(fn) {
  return (...args) => {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
}

db.exec(`
CREATE TABLE IF NOT EXISTS cf_produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  sku_normalizado TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_by_nome TEXT NOT NULL DEFAULT '',
  updated_by INTEGER,
  updated_by_nome TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cf_imagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES cf_produtos(id),
  principal INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  storage_key_original TEXT NOT NULL,
  storage_key_otimizada TEXT NOT NULL DEFAULT '',
  storage_key_miniatura TEXT NOT NULL DEFAULT '',
  nome_original TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  tamanho_otimizada_bytes INTEGER NOT NULL DEFAULT 0,
  tamanho_miniatura_bytes INTEGER NOT NULL DEFAULT 0,
  largura INTEGER,
  altura INTEGER,
  hash_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','excluida')),
  excluida_em TEXT,
  excluida_por INTEGER,
  excluida_por_nome TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_by_nome TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Trilha de auditoria própria do módulo (não usa a de Logística, que fica
-- em outro banco). Nunca deve derrubar a operação principal - ver
-- centralFotos/auditoria.js.
CREATE TABLE IF NOT EXISTS cf_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  produto_id INTEGER,
  sku TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER,
  usuario_nome TEXT NOT NULL DEFAULT '',
  dados_anteriores TEXT NOT NULL DEFAULT '',
  dados_novos TEXT NOT NULL DEFAULT '',
  resultado TEXT NOT NULL DEFAULT 'sucesso',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_produtos_sku_norm ON cf_produtos(sku_normalizado);
CREATE INDEX IF NOT EXISTS idx_cf_produtos_nome ON cf_produtos(nome COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cf_produtos_ativo ON cf_produtos(ativo);

CREATE INDEX IF NOT EXISTS idx_cf_imagens_produto ON cf_imagens(produto_id);
CREATE INDEX IF NOT EXISTS idx_cf_imagens_status ON cf_imagens(status);
CREATE INDEX IF NOT EXISTS idx_cf_imagens_ordem ON cf_imagens(produto_id, ordem);
-- Garante no próprio banco que nunca existam duas fotos principais ativas
-- pro mesmo produto, mesmo que um bug na aplicação tente permitir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_imagens_principal_unico ON cf_imagens(produto_id) WHERE principal = 1 AND status = 'ativa';

CREATE INDEX IF NOT EXISTS idx_cf_auditoria_produto ON cf_auditoria(produto_id);
CREATE INDEX IF NOT EXISTS idx_cf_auditoria_created_at ON cf_auditoria(created_at);
`);

module.exports = {
  db,
  transaction,
  nowStamp,
  BASE_DIR,
  ORIGINAL_DIR,
  OPTIMIZED_DIR,
  THUMBNAILS_DIR,
  DB_PATH,
};
