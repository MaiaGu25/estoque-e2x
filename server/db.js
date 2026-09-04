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
