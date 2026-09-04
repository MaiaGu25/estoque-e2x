const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "estoque.db");
const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

// node:sqlite não tem um helper de transação como o better-sqlite3;
// envolve manualmente em BEGIN/COMMIT com rollback automático em erro.
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
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operador')) DEFAULT 'operador',
  active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  unit TEXT NOT NULL DEFAULT 'UN',
  location TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  minimum_stock REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('ENTRADA','SAIDA')),
  reason TEXT NOT NULL,
  responsible TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL REFERENCES parts(id),
  order_id INTEGER REFERENCES orders(id),
  type TEXT NOT NULL CHECK(type IN ('ENTRADA','SAIDA')),
  quantity REAL NOT NULL,
  previous_balance REAL NOT NULL,
  new_balance REAL NOT NULL,
  reason TEXT NOT NULL,
  responsible TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_part ON movements(part_id);
CREATE INDEX IF NOT EXISTS idx_movements_order ON movements(order_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at);
CREATE INDEX IF NOT EXISTS idx_parts_active ON parts(active);

-- Módulo "Estoque dos Técnicos" (peças de bancada + máquinas montadas)
CREATE TABLE IF NOT EXISTS tec_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL UNIQUE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  limite_baixo INTEGER NOT NULL DEFAULT 5,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tec_configuracoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  processador TEXT NOT NULL DEFAULT '',
  ram TEXT NOT NULL DEFAULT '',
  ssd TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tec_config_itens (
  configuracao_id INTEGER NOT NULL REFERENCES tec_configuracoes(id),
  item_id INTEGER NOT NULL REFERENCES tec_itens(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (configuracao_id, item_id)
);

CREATE TABLE IF NOT EXISTS tec_maquinas (
  configuracao_id INTEGER PRIMARY KEY REFERENCES tec_configuracoes(id),
  quantidade INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tec_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  responsible TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Módulo "Central de Testes" (registro de testes de máquinas com fotos)
CREATE TABLE IF NOT EXISTS testes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  numero_teste INTEGER NOT NULL,
  responsible TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  foto_serial TEXT NOT NULL,
  foto_teste TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tec_movimentos_created_at ON tec_movimentos(created_at);
CREATE INDEX IF NOT EXISTS idx_testes_created_at ON testes(created_at);

-- Módulo "RMA / SAC" (devoluções de clientes vindas das plataformas)
CREATE TABLE IF NOT EXISTS rma_casos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  plataforma TEXT NOT NULL,
  pedido TEXT NOT NULL DEFAULT '',
  produto TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  motivo_cliente TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando_devolucao'
    CHECK(status IN ('aguardando_devolucao','recebido','em_inspecao','concluido')),
  culpa TEXT CHECK(culpa IN ('nossa','cliente')),
  laudo_tecnico TEXT NOT NULL DEFAULT '',
  desfecho TEXT CHECK(desfecho IN ('reembolso_cliente','cobranca_plataforma')),
  valor REAL,
  disputa_status TEXT CHECK(disputa_status IN ('nao_aberta','aberta','ganha','perdida')),
  tecnico_responsavel TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS rma_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caso_id INTEGER NOT NULL REFERENCES rma_casos(id),
  tipo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  foto TEXT,
  responsible TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rma_casos_status ON rma_casos(status);
CREATE INDEX IF NOT EXISTS idx_rma_casos_created_at ON rma_casos(created_at);
CREATE INDEX IF NOT EXISTS idx_rma_eventos_caso ON rma_eventos(caso_id);
`);

function getMeta(key) {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

// Sessão precisa de um segredo estável para assinar os cookies. Gerado
// uma única vez e guardado no próprio banco, para não depender de
// configuração manual em variáveis de ambiente.
function getOrCreateSessionSecret() {
  let secret = getMeta("session_secret");
  if (!secret) {
    secret = crypto.randomBytes(48).toString("hex");
    setMeta("session_secret", secret);
  }
  return secret;
}

module.exports = { db, transaction, getMeta, setMeta, getOrCreateSessionSecret, DB_PATH };
