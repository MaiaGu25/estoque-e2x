const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { nowStamp } = require("./util");

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

CREATE TABLE IF NOT EXISTS reserved_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL REFERENCES parts(id),
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  previous_reserved REAL NOT NULL,
  new_reserved REAL NOT NULL,
  reason TEXT NOT NULL,
  responsible TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reserved_movements_part ON reserved_movements(part_id);
CREATE INDEX IF NOT EXISTS idx_reserved_movements_created_at ON reserved_movements(created_at);

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

-- Módulo "Peças / Fornecedores" (peças com defeito enviadas para troca)
CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  identificacao TEXT NOT NULL DEFAULT '',
  contato TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pecas_fornecedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL DEFAULT '',
  serial TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  ean TEXT NOT NULL DEFAULT '',
  marca TEXT NOT NULL DEFAULT '',
  defeito TEXT NOT NULL DEFAULT '',
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  status TEXT NOT NULL DEFAULT 'aguardando_envio'
    CHECK(status IN ('aguardando_envio','aguardando_fornecedor','trocada','recusada')),
  rma_relacionado TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pecas_fornecedor_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  peca_id INTEGER NOT NULL REFERENCES pecas_fornecedor(id),
  texto TEXT NOT NULL DEFAULT '',
  responsible TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_status ON pecas_fornecedor(status);
CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_created_at ON pecas_fornecedor(created_at);
CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_eventos_peca ON pecas_fornecedor_eventos(peca_id);

-- Módulo "Logística": estoque de galpão totalmente independente do Estoque
-- geral (parts/movements/orders) - nenhuma tabela ou saldo é compartilhado.
CREATE TABLE IF NOT EXISTS logistics_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Geral',
  unit TEXT NOT NULL DEFAULT 'UN',
  minimum_stock REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Hierarquia física: fileira -> corredor -> montante -> nível (a posição
-- de armazenagem em si). Um galpão só por enquanto: se um dia precisar de
-- mais de um galpão, dá pra adicionar uma tabela logistics_warehouses e uma
-- coluna warehouse_id aqui em cima sem quebrar nada do que já existe.
CREATE TABLE IF NOT EXISTS logistics_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_aisles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  row_id INTEGER NOT NULL REFERENCES logistics_rows(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE(row_id, code)
);

CREATE TABLE IF NOT EXISTS logistics_racks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aisle_id INTEGER NOT NULL REFERENCES logistics_aisles(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE(aisle_id, code)
);

-- Um montante pode ter um ou mais "lados" (ex.: só a frente, ou frente e
-- verso), cada um com sua própria quantidade de prateleiras - um montante
-- comprido pode ter só 1 lado com 70 prateleiras, outro pode ter 2 lados
-- com 8 prateleiras cada. O código do lado (ex.: "A") nunca muda depois de
-- criado, pelo mesmo motivo do código da posição abaixo.
CREATE TABLE IF NOT EXISTS logistics_rack_sides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rack_id INTEGER NOT NULL REFERENCES logistics_racks(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  shelves_count INTEGER NOT NULL DEFAULT 1 CHECK(shelves_count >= 1 AND shelves_count <= 300),
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE(rack_id, code)
);

-- Cada linha aqui é uma prateleira de um lado de um montante, que é a
-- posição de armazenagem final (ex.: F01-C02-M05-A-P003). O código é
-- gerado a partir dos códigos dos pais e nunca muda depois de criado,
-- mesmo se o nome (name) for renomeado - assim o histórico de
-- movimentações nunca fica órfão. rack_id fica duplicado aqui (dá pra
-- chegar nele via side_id também) só pra evitar mais um JOIN nas consultas
-- que listam posições por montante.
CREATE TABLE IF NOT EXISTS logistics_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rack_id INTEGER NOT NULL REFERENCES logistics_racks(id),
  side_id INTEGER NOT NULL REFERENCES logistics_rack_sides(id),
  shelf_number INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE(side_id, shelf_number)
);

-- Saldo por produto em cada posição - a soma disso é o saldo total do
-- produto (calculado, nunca guardado direto para não correr risco de
-- ficar dessincronizado).
CREATE TABLE IF NOT EXISTS logistics_position_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL REFERENCES logistics_positions(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE(position_id, product_id)
);

CREATE TABLE IF NOT EXISTS logistics_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('ENTRADA','SAIDA','TRANSFERENCIA','AJUSTE')),
  reason TEXT NOT NULL,
  responsible TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Uma linha por produto afetado dentro de uma operação. Cobre os 4 tipos:
-- ENTRADA só preenche o lado "to", SAIDA só o lado "from", TRANSFERENCIA
-- preenche os dois (uma única linha para toda a transferência, nunca duas
-- linhas separadas), e AJUSTE usa from=to=a própria posição ajustada.
CREATE TABLE IF NOT EXISTS logistics_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL REFERENCES logistics_operations(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  quantity REAL NOT NULL,
  from_position_id INTEGER REFERENCES logistics_positions(id),
  to_position_id INTEGER REFERENCES logistics_positions(id),
  previous_from_quantity REAL,
  new_from_quantity REAL,
  previous_to_quantity REAL,
  new_to_quantity REAL,
  previous_total_quantity REAL NOT NULL,
  new_total_quantity REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL,
  previous_data TEXT NOT NULL DEFAULT '',
  new_data TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logistics_products_active ON logistics_products(active);
CREATE INDEX IF NOT EXISTS idx_logistics_aisles_row ON logistics_aisles(row_id);
CREATE INDEX IF NOT EXISTS idx_logistics_racks_aisle ON logistics_racks(aisle_id);
CREATE INDEX IF NOT EXISTS idx_logistics_rack_sides_rack ON logistics_rack_sides(rack_id);
CREATE INDEX IF NOT EXISTS idx_logistics_positions_rack ON logistics_positions(rack_id);
CREATE INDEX IF NOT EXISTS idx_logistics_position_stock_position ON logistics_position_stock(position_id);
CREATE INDEX IF NOT EXISTS idx_logistics_position_stock_product ON logistics_position_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_logistics_operations_created_at ON logistics_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_logistics_operations_type ON logistics_operations(type);
CREATE INDEX IF NOT EXISTS idx_logistics_movements_operation ON logistics_movements(operation_id);
CREATE INDEX IF NOT EXISTS idx_logistics_movements_product ON logistics_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_logistics_movements_created_at ON logistics_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_logistics_movements_from_position ON logistics_movements(from_position_id);
CREATE INDEX IF NOT EXISTS idx_logistics_movements_to_position ON logistics_movements(to_position_id);
CREATE INDEX IF NOT EXISTS idx_logistics_audit_entity ON logistics_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_logistics_audit_created_at ON logistics_audit_log(created_at);
`);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

// pecas_fornecedor existia sem agrupamento por pedido; adiciona a coluna
// em bancos já criados, sem mexer nos dados existentes.
if (!columnExists("pecas_fornecedor", "pedido_numero")) {
  db.exec("ALTER TABLE pecas_fornecedor ADD COLUMN pedido_numero TEXT NOT NULL DEFAULT ''");
}
// Peças cadastradas antes do agrupamento por pedido ficam sem número;
// dá um número sintético para cada uma virar um "pedido" de 1 item.
db.exec("UPDATE pecas_fornecedor SET pedido_numero = 'LEG-' || id WHERE pedido_numero = ''");
db.exec("CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_pedido ON pecas_fornecedor(pedido_numero)");

// parts existia sem saldo reservado; adiciona a coluna em bancos já criados.
if (!columnExists("parts", "reserved_quantity")) {
  db.exec("ALTER TABLE parts ADD COLUMN reserved_quantity REAL NOT NULL DEFAULT 0");
}

// reserved_movements existia só com RESERVAR/LIBERAR; o tipo BAIXA (peça
// reservada que efetivamente saiu do estoque) precisa de uma recriação da
// tabela, já que o SQLite não altera CHECK de coluna existente. A validação
// do tipo passa a ficar só na rota, então isso não deve se repetir.
const reservedMovementsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reserved_movements'").get();
if (reservedMovementsInfo && reservedMovementsInfo.sql.includes("'RESERVAR','LIBERAR'")) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE reserved_movements_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_id INTEGER NOT NULL REFERENCES parts(id),
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        previous_reserved REAL NOT NULL,
        new_reserved REAL NOT NULL,
        reason TEXT NOT NULL,
        responsible TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL
      );
      INSERT INTO reserved_movements_new SELECT * FROM reserved_movements;
      DROP TABLE reserved_movements;
      ALTER TABLE reserved_movements_new RENAME TO reserved_movements;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_reserved_movements_part ON reserved_movements(part_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_reserved_movements_created_at ON reserved_movements(created_at)");
}

// logistics_racks tinha uma quantidade fixa de "níveis" (levels_count); um
// montante agora pode ter vários "lados" configuráveis, cada lado com sua
// própria quantidade de prateleiras (logistics_rack_sides). Bancos criados
// antes dessa mudança são migrados criando um lado único "A" por montante
// (com a mesma quantidade de níveis que ele já tinha) e preservando o id,
// o saldo e o histórico de cada posição - só o layout (e o texto do
// código) é atualizado para o novo formato F01-C02-M05-A-P003.
const racksInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='logistics_racks'").get();
if (racksInfo && racksInfo.sql.includes("levels_count")) {
  // logistics_rack_sides e logistics_positions têm FK apontando para
  // logistics_racks; o SQLite não deixa dar DROP TABLE numa tabela "pai"
  // com filhos enquanto a checagem de chave estrangeira está ligada.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    const racksAntigos = db.prepare("SELECT id, levels_count FROM logistics_racks").all();
    const now = nowStamp();
    const inserirLadoA = db.prepare(
      `INSERT INTO logistics_rack_sides (rack_id,code,name,shelves_count,display_order,active,created_at,updated_at)
       VALUES (?, 'A', 'Lado A', ?, 0, 1, ?, ?)`
    );
    for (const rack of racksAntigos) {
      inserirLadoA.run(rack.id, rack.levels_count, now, now);
    }
    db.exec(`
      CREATE TABLE logistics_racks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aisle_id INTEGER NOT NULL REFERENCES logistics_aisles(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL,
        UNIQUE(aisle_id, code)
      );
      INSERT INTO logistics_racks_new (id,aisle_id,code,name,color,display_order,active,created_by,created_at,updated_by,updated_at)
        SELECT id,aisle_id,code,name,color,display_order,active,created_by,created_at,updated_by,updated_at FROM logistics_racks;
      DROP TABLE logistics_racks;
      ALTER TABLE logistics_racks_new RENAME TO logistics_racks;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_racks_aisle ON logistics_racks(aisle_id)");
}

const positionsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='logistics_positions'").get();
if (positionsInfo && positionsInfo.sql.includes("level_number")) {
  // logistics_position_stock e logistics_movements têm FK apontando para
  // logistics_positions - mesmo motivo do bloco de logistics_racks acima.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE logistics_positions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rack_id INTEGER NOT NULL REFERENCES logistics_racks(id),
        side_id INTEGER NOT NULL REFERENCES logistics_rack_sides(id),
        shelf_number INTEGER NOT NULL,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        blocked INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL,
        UNIQUE(side_id, shelf_number)
      );
      INSERT INTO logistics_positions_new (id,rack_id,side_id,shelf_number,code,name,active,blocked,created_by,created_at,updated_by,updated_at)
        SELECT p.id, p.rack_id, s.id, p.level_number,
               rw.code || '-' || al.code || '-' || rk.code || '-A-P' || substr('000' || CAST(p.level_number AS TEXT), -3, 3),
               p.name, p.active, p.blocked, p.created_by, p.created_at, p.updated_by, p.updated_at
        FROM logistics_positions p
        JOIN logistics_racks rk ON rk.id = p.rack_id
        JOIN logistics_aisles al ON al.id = rk.aisle_id
        JOIN logistics_rows rw ON rw.id = al.row_id
        JOIN logistics_rack_sides s ON s.rack_id = p.rack_id AND s.code = 'A';
      DROP TABLE logistics_positions;
      ALTER TABLE logistics_positions_new RENAME TO logistics_positions;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_positions_rack ON logistics_positions(rack_id)");
}

// Criado aqui (e não junto com os outros índices lá em cima) porque numa
// atualização a partir do schema antigo a coluna side_id só passa a
// existir depois da migração de logistics_positions logo acima.
db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_positions_side ON logistics_positions(side_id)");

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
