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

// A Logística deixou de organizar posições por fileira/corredor e passou a
// ser um mapa livre, com o montante desenhado direto no galpão (x/y/
// largura/altura). Pedido explícito do usuário pra recomeçar essa parte do
// zero, já que só havia dado de teste. logistics_rows é reconhecida aqui
// como a marca do schema anterior (ela deixa de existir no schema novo);
// se ela ainda existir, apaga todas as tabelas da Logística de uma vez só
// pra recriar do zero logo em seguida - não mexe em nada do estoque de
// peças, técnicos, RMA, etc. Roda no máximo uma vez: depois que
// logistics_rows some, essa checagem nunca mais encontra nada pra apagar.
const logisticaSchemaAntigo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logistics_rows'").get();
if (logisticaSchemaAntigo) {
  db.exec("PRAGMA foreign_keys = OFF");
  for (const tabela of [
    "logistics_audit_log",
    "logistics_movements",
    "logistics_operations",
    "logistics_position_stock",
    "logistics_positions",
    "logistics_rack_sides",
    "logistics_racks",
    "logistics_aisles",
    "logistics_rows",
    "logistics_products",
  ]) {
    db.exec(`DROP TABLE IF EXISTS ${tabela}`);
  }
  db.exec("PRAGMA foreign_keys = ON");
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

-- Inventário físico do estoque dos Técnicos: contagem de itens (tec_itens)
-- comparada ao saldo do sistema, gerando ajustes em tec_movimentos quando
-- finalizado. Não mexe em nenhum outro estoque (peças gerais, Logística).
CREATE TABLE IF NOT EXISTS tec_inventarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK(status IN ('em_andamento','concluido','cancelado')),
  motivo TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  finalized_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  concluded_at TEXT
);

-- Uma linha por item ativo no momento em que o inventário começou (o
-- "universo" do inventário fica travado na criação). saldo_inicial guarda
-- o saldo visto nesse momento, pra detectar se alguém mexeu no estoque
-- desse item enquanto a contagem rolava. saldo_revisao/diferenca/
-- saldo_posterior só são preenchidos na finalização, como registro
-- permanente de auditoria.
CREATE TABLE IF NOT EXISTS tec_inventario_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_id INTEGER NOT NULL REFERENCES tec_inventarios(id),
  item_id INTEGER NOT NULL REFERENCES tec_itens(id),
  saldo_inicial INTEGER NOT NULL,
  modo TEXT NOT NULL DEFAULT 'final' CHECK(modo IN ('final','soma')),
  contado INTEGER NOT NULL DEFAULT 0,
  quantidade_contada INTEGER,
  observacao TEXT NOT NULL DEFAULT '',
  saldo_revisao INTEGER,
  diferenca INTEGER,
  saldo_posterior INTEGER,
  updated_at TEXT NOT NULL,
  UNIQUE(inventario_id, item_id)
);

-- Parcelas do modo "somar aos poucos" (10 + 8 + 5 = 23). Cada parcela fica
-- guardada pra permitir "desfazer a última" sem perder as anteriores.
CREATE TABLE IF NOT EXISTS tec_inventario_contagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventario_item_id INTEGER NOT NULL REFERENCES tec_inventario_itens(id),
  valor INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tec_inventarios_status ON tec_inventarios(status);
CREATE INDEX IF NOT EXISTS idx_tec_inventario_itens_inventario ON tec_inventario_itens(inventario_id);
CREATE INDEX IF NOT EXISTS idx_tec_inventario_contagens_item ON tec_inventario_contagens(inventario_item_id);

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
  endereco TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1
);

-- Contatos nomeados do fornecedor (podem ser pessoas diferentes, cada
-- uma com seu telefone/email) - substitui o campo único "contato" livre
-- pra quem cadastra a partir de agora.
CREATE TABLE IF NOT EXISTS fornecedor_contatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  nome TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Uma ordem (pedido) agrupa peças mandadas pro fornecedor de uma vez; o
-- status de andamento é da ordem inteira, não de cada peça (o fornecedor
-- decide o pacote todo junto, mesmo que aceite só parte das peças).
CREATE TABLE IF NOT EXISTS pedidos_fornecedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  rma_relacionado TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'em_aberto'
    CHECK(status IN ('em_aberto','registrado','em_analise','revisar','liberado','concluido')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
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
  decisao TEXT NOT NULL DEFAULT 'pendente' CHECK(decisao IN ('pendente','aceita','recusada')),
  observacoes TEXT NOT NULL DEFAULT '',
  pedido_numero TEXT NOT NULL DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_created_at ON pecas_fornecedor(created_at);
CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_eventos_peca ON pecas_fornecedor_eventos(peca_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_contatos_fornecedor ON fornecedor_contatos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_status ON pedidos_fornecedor(status);

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
  sale_price REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Prédio pode ter mais de um andar; cada andar tem seu próprio mapa (os
-- montantes de um andar não aparecem nem se misturam com os de outro).
CREATE TABLE IF NOT EXISTS logistics_floors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Hierarquia física: andar -> montante (desenhado livremente no mapa) ->
-- lado -> prateleira (a posição de armazenagem em si). Um galpão só por
-- enquanto: se um dia precisar de mais de um galpão, dá pra adicionar uma
-- tabela logistics_warehouses e uma coluna warehouse_id aqui em cima sem
-- quebrar nada do que já existe.
-- x/y/width/height guardam a posição e o tamanho do retângulo do montante
-- no mapa (visão de cima); rotation é só 0/90/180/270 e, na prática, o
-- efeito de girar já fica embutido em width/height (largura e altura são
-- sempre o tamanho já "rotacionado" que aparece na tela) - a coluna existe
-- para lembrar a orientação original e for útil no futuro.
-- is_holding_area marca o único montante especial "Estoque não organizado"
-- (criado automaticamente) usado para guardar produto recém-cadastrado
-- antes de ser organizado numa posição de verdade - ele nunca aparece
-- desenhado no mapa.
CREATE TABLE IF NOT EXISTS logistics_racks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_id INTEGER NOT NULL REFERENCES logistics_floors(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 20,
  y REAL NOT NULL DEFAULT 20,
  width REAL NOT NULL DEFAULT 120 CHECK(width > 0),
  height REAL NOT NULL DEFAULT 80 CHECK(height > 0),
  rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation IN (0, 90, 180, 270)),
  color TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  is_holding_area INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
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
-- posição de armazenagem final (ex.: MA-A-P003). O código é gerado a
-- partir dos códigos dos pais e nunca muda depois de criado, mesmo se o
-- nome (name) for renomeado - assim o histórico de movimentações nunca
-- fica órfão. rack_id fica duplicado aqui (dá pra chegar nele via side_id
-- também) só pra evitar mais um JOIN nas consultas que listam posições por
-- montante.
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
CREATE INDEX IF NOT EXISTS idx_logistics_racks_active ON logistics_racks(active);
CREATE INDEX IF NOT EXISTS idx_logistics_rack_sides_rack ON logistics_rack_sides(rack_id);
CREATE INDEX IF NOT EXISTS idx_logistics_positions_rack ON logistics_positions(rack_id);
CREATE INDEX IF NOT EXISTS idx_logistics_positions_side ON logistics_positions(side_id);
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

// O status de uma ordem pro fornecedor deixou de ser por peça e passou a
// ser da ordem inteira (5 etapas: em_aberto/registrado/em_analise/
// liberado/concluido); o que decide se cada peça foi aceita ou recusada
// pelo fornecedor virou um campo separado ("decisao"). pecas_fornecedor
// existia só com o status antigo por peça - migra criando um registro em
// pedidos_fornecedor pra cada pedido_numero já existente (com um status
// deduzido a partir do que as peças tinham) e recria pecas_fornecedor já
// com "decisao" no lugar de "status" (SQLite não altera CHECK de coluna
// existente, então precisa recriar a tabela, igual foi feito antes pra
// reserved_movements).
const pecasFornecedorInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pecas_fornecedor'").get();
if (pecasFornecedorInfo && pecasFornecedorInfo.sql.includes("aguardando_envio")) {
  const pecasAntigas = db
    .prepare("SELECT pedido_numero, fornecedor_id, rma_relacionado, status, created_by, created_at, updated_at FROM pecas_fornecedor ORDER BY pedido_numero, id")
    .all();
  const porPedido = new Map();
  for (const p of pecasAntigas) {
    if (!porPedido.has(p.pedido_numero)) {
      porPedido.set(p.pedido_numero, {
        fornecedorId: p.fornecedor_id,
        rmaRelacionado: "",
        createdBy: p.created_by,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        statuses: new Set(),
      });
    }
    const grupo = porPedido.get(p.pedido_numero);
    if (!grupo.rmaRelacionado && p.rma_relacionado) grupo.rmaRelacionado = p.rma_relacionado;
    if (p.created_at < grupo.createdAt) grupo.createdAt = p.created_at;
    if (p.updated_at > grupo.updatedAt) grupo.updatedAt = p.updated_at;
    grupo.statuses.add(p.status);
  }

  function statusDaOrdem(statuses) {
    const todasDecididas = [...statuses].every((s) => s === "trocada" || s === "recusada");
    if (todasDecididas) return "concluido";
    if (statuses.has("aguardando_fornecedor")) return "em_analise";
    if (statuses.has("trocada") || statuses.has("recusada")) return "liberado";
    return "em_aberto";
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    const inserirPedido = db.prepare(
      `INSERT INTO pedidos_fornecedor (numero,fornecedor_id,rma_relacionado,status,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    for (const [numero, grupo] of porPedido) {
      inserirPedido.run(
        numero,
        grupo.fornecedorId,
        grupo.rmaRelacionado,
        statusDaOrdem(grupo.statuses),
        grupo.createdBy,
        grupo.createdAt,
        grupo.createdBy,
        grupo.updatedAt
      );
    }

    db.exec(`
      CREATE TABLE pecas_fornecedor_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL DEFAULT '',
        serial TEXT NOT NULL DEFAULT '',
        descricao TEXT NOT NULL DEFAULT '',
        ean TEXT NOT NULL DEFAULT '',
        marca TEXT NOT NULL DEFAULT '',
        defeito TEXT NOT NULL DEFAULT '',
        fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
        decisao TEXT NOT NULL DEFAULT 'pendente' CHECK(decisao IN ('pendente','aceita','recusada')),
        observacoes TEXT NOT NULL DEFAULT '',
        pedido_numero TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL
      );
      INSERT INTO pecas_fornecedor_new
        (id,codigo,serial,descricao,ean,marca,defeito,fornecedor_id,decisao,observacoes,pedido_numero,created_by,created_at,updated_by,updated_at)
      SELECT
        id,codigo,serial,descricao,ean,marca,defeito,fornecedor_id,
        CASE status WHEN 'trocada' THEN 'aceita' WHEN 'recusada' THEN 'recusada' ELSE 'pendente' END,
        observacoes,pedido_numero,created_by,created_at,updated_by,updated_at
      FROM pecas_fornecedor;
      DROP TABLE pecas_fornecedor;
      ALTER TABLE pecas_fornecedor_new RENAME TO pecas_fornecedor;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_pedido ON pecas_fornecedor(pedido_numero)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_created_at ON pecas_fornecedor(created_at)");
}

// Criado aqui (não junto com os outros índices lá em cima) porque numa
// atualização a partir do schema antigo a coluna decisao só passa a
// existir depois da recriação da tabela, logo acima.
db.exec("CREATE INDEX IF NOT EXISTS idx_pecas_fornecedor_decisao ON pecas_fornecedor(decisao)");

// pedidos_fornecedor existia sem a etapa "revisar" (entre em_analise e
// liberado); precisa recriar porque o SQLite não altera CHECK de coluna
// existente. Só amplia a lista de valores aceitos - nenhum pedido
// existente muda de status com isso.
const pedidosFornecedorInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pedidos_fornecedor'").get();
if (pedidosFornecedorInfo && !pedidosFornecedorInfo.sql.includes("'revisar'")) {
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE pedidos_fornecedor_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL UNIQUE,
        fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
        rma_relacionado TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'em_aberto'
          CHECK(status IN ('em_aberto','registrado','em_analise','revisar','liberado','concluido')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL
      );
      INSERT INTO pedidos_fornecedor_new SELECT * FROM pedidos_fornecedor;
      DROP TABLE pedidos_fornecedor;
      ALTER TABLE pedidos_fornecedor_new RENAME TO pedidos_fornecedor;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor_status ON pedidos_fornecedor(status)");
}

// fornecedores existia sem endereço; adiciona as colunas em bancos já
// criados, sem mexer no que já estava cadastrado.
for (const coluna of ["endereco", "numero", "cep", "cidade", "estado"]) {
  if (!columnExists("fornecedores", coluna)) {
    db.exec(`ALTER TABLE fornecedores ADD COLUMN ${coluna} TEXT NOT NULL DEFAULT ''`);
  }
}

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

// logistics_racks existia sem andar (galpão de um andar só); bancos criados
// antes disso ganham a coluna e um andar padrão pra não perder nenhum
// montante já cadastrado. floor_id fica sem NOT NULL no schema porque o
// SQLite não permite adicionar coluna NOT NULL sem um valor padrão fixo
// (o id do andar padrão só existe depois de criado) - a rota de criação de
// montante sempre exige o andar, então isso nunca fica vazio na prática.
if (!columnExists("logistics_racks", "floor_id")) {
  db.exec("ALTER TABLE logistics_racks ADD COLUMN floor_id INTEGER REFERENCES logistics_floors(id)");
}
if (!columnExists("logistics_racks", "is_holding_area")) {
  db.exec("ALTER TABLE logistics_racks ADD COLUMN is_holding_area INTEGER NOT NULL DEFAULT 0");
}

// logistics_products existia sem preço de venda; adiciona a coluna em
// bancos já criados, sem mexer no que já estava cadastrado.
if (!columnExists("logistics_products", "sale_price")) {
  db.exec("ALTER TABLE logistics_products ADD COLUMN sale_price REAL NOT NULL DEFAULT 0");
}

let andarPadrao = db.prepare("SELECT id FROM logistics_floors ORDER BY display_order, id LIMIT 1").get();
if (!andarPadrao) {
  const now = nowStamp();
  const result = db
    .prepare("INSERT INTO logistics_floors (code,name,display_order,active,created_at,updated_at) VALUES ('1','Andar 1',0,1,?,?)")
    .run(now, now);
  andarPadrao = { id: result.lastInsertRowid };
}
db.prepare("UPDATE logistics_racks SET floor_id = ? WHERE floor_id IS NULL").run(andarPadrao.id);

// "Estoque não organizado": posição especial pra receber produto recém-
// cadastrado já com uma quantidade física informada, antes de decidir em
// qual posição real ele vai ficar (o usuário organiza depois com uma
// transferência normal). Criada uma única vez; nunca aparece desenhada no
// mapa (is_holding_area).
const areaNaoOrganizada = db.prepare("SELECT id FROM logistics_racks WHERE is_holding_area = 1").get();
if (!areaNaoOrganizada) {
  const now = nowStamp();
  const rack = db
    .prepare(
      `INSERT INTO logistics_racks (floor_id,code,name,x,y,width,height,rotation,color,active,is_holding_area,created_at,updated_at)
       VALUES (?,'ESTOQUE-INICIAL','Estoque não organizado',0,0,1,1,0,'',1,1,?,?)`
    )
    .run(andarPadrao.id, now, now);
  const side = db
    .prepare(
      `INSERT INTO logistics_rack_sides (rack_id,code,name,shelves_count,display_order,active,created_at,updated_at)
       VALUES (?,'A','Recebimento',1,0,1,?,?)`
    )
    .run(rack.lastInsertRowid, now, now);
  db.prepare(
    `INSERT INTO logistics_positions (rack_id,side_id,shelf_number,code,name,active,blocked,created_at,updated_at)
     VALUES (?,?,1,'ESTOQUE-INICIAL-A-P001','Recebimento',1,0,?,?)`
  ).run(rack.lastInsertRowid, side.lastInsertRowid, now, now);
}

// Criado aqui (não junto com os outros índices lá em cima) porque numa
// atualização a partir do schema sem andares a coluna floor_id só passa a
// existir depois do ALTER TABLE logo acima.
db.exec("CREATE INDEX IF NOT EXISTS idx_logistics_racks_floor ON logistics_racks(floor_id)");

// Orçamento é uma simulação de venda: fica salvo (cliente, itens, desconto)
// sem mexer em estoque nenhum. Só quando é "fechado" que vira uma saída de
// verdade nas posições escolhidas. Desconto acima do limite deixa o
// orçamento como 'aguardando_aprovacao' até um admin liberar.
db.exec(`
CREATE TABLE IF NOT EXISTS sales_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('aberto','aguardando_aprovacao','fechado','cancelado')) DEFAULT 'aberto',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  responsible TEXT NOT NULL DEFAULT '',
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS sales_quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES sales_quotes(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_status ON sales_quotes(status);
CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote ON sales_quote_items(quote_id);
`);

// ---- Logística: Conferência de entrada / Separação de pedidos ----
// Reaproveita logistics_products/logistics_positions e as transações de
// logisticaMovimentos.js (entrada/saída/transferência com trava otimista)
// para nunca duplicar a lógica de saldo - conferência e separação só
// decidem QUANDO chamar cada movimento e registram o pedido/itens/eventos
// em torno dele.
db.exec(`
-- Número de série rastreado individualmente. valor_normalizado tem índice
-- único (maiúsculo, sem espaço nas pontas) para a duplicidade nunca
-- depender só de checagem no frontend.
CREATE TABLE IF NOT EXISTS logistics_serials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  valor TEXT NOT NULL,
  valor_normalizado TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  status TEXT NOT NULL CHECK(status IN (
    'estoque_nao_organizado','disponivel','reservado','em_separacao',
    'expedido','avariado','bloqueado','devolvido'
  )) DEFAULT 'disponivel',
  position_id INTEGER REFERENCES logistics_positions(id),
  pedido_entrada_id INTEGER,
  pedido_saida_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Pedido de entrada (fornecedor) que precisa ser conferido antes de virar
-- estoque de verdade.
CREATE TABLE IF NOT EXISTS logistics_conferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  fornecedor_nome TEXT NOT NULL DEFAULT '',
  fornecedor_contato TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN (
    'aguardando_conferencia','em_conferencia','conferido_parcialmente',
    'com_divergencia','conferido','cancelado'
  )) DEFAULT 'aguardando_conferencia',
  responsavel TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  finalizado_em TEXT
);

CREATE TABLE IF NOT EXISTS logistics_conferencia_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conferencia_id INTEGER NOT NULL REFERENCES logistics_conferencias(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  quantidade_esperada REAL NOT NULL,
  quantidade_conferida REAL NOT NULL DEFAULT 0,
  exige_serial INTEGER NOT NULL DEFAULT 0,
  observacao TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_conferencia_divergencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conferencia_id INTEGER NOT NULL REFERENCES logistics_conferencias(id),
  item_id INTEGER REFERENCES logistics_conferencia_itens(id),
  tipo TEXT NOT NULL CHECK(tipo IN (
    'quantidade_divergente','produto_errado','serial_duplicado',
    'serial_de_outro_produto','avariado','item_nao_identificado','outro'
  )),
  descricao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('aberta','resolvida')) DEFAULT 'aberta',
  resolvido_por INTEGER REFERENCES users(id),
  resolvido_em TEXT,
  resolucao TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_conferencia_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conferencia_id INTEGER NOT NULL REFERENCES logistics_conferencias(id),
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Pedido de saída (venda/marketplace/manual) a ser separado. Um modelo só
-- para todos os canais (adaptador): canal/canal_conta/id_externo guardam a
-- origem externa sem nenhuma integração de verdade implementada agora -
-- só o formato pronto para o dia que existir. id_externo fica NULL em
-- pedidos manuais (o índice único do SQLite não considera NULL == NULL,
-- então vários pedidos manuais convivem sem conflito).
CREATE TABLE IF NOT EXISTS logistics_pedidos_saida (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  canal TEXT NOT NULL CHECK(canal IN ('manual','vendedor','mercado_livre','shopee','outro')) DEFAULT 'manual',
  canal_conta TEXT NOT NULL DEFAULT '',
  id_externo TEXT,
  numero_visivel TEXT NOT NULL DEFAULT '',
  data_pedido TEXT,
  cliente_nome TEXT NOT NULL DEFAULT '',
  vendedor TEXT NOT NULL DEFAULT '',
  status_externo TEXT NOT NULL DEFAULT '',
  payload_origem TEXT NOT NULL DEFAULT '',
  ultima_sincronizacao TEXT,
  status TEXT NOT NULL CHECK(status IN (
    'aguardando_separacao','em_separacao','separado_parcialmente',
    'com_divergencia','separado','aguardando_expedicao','expedido','cancelado'
  )) DEFAULT 'aguardando_separacao',
  prioridade TEXT NOT NULL CHECK(prioridade IN ('baixa','normal','alta','urgente')) DEFAULT 'normal',
  responsavel TEXT NOT NULL DEFAULT '',
  observacao TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  expedido_em TEXT,
  UNIQUE(canal, canal_conta, id_externo)
);

CREATE TABLE IF NOT EXISTS logistics_pedido_saida_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES logistics_pedidos_saida(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  variacao TEXT NOT NULL DEFAULT '',
  quantidade_solicitada REAL NOT NULL,
  quantidade_separada REAL NOT NULL DEFAULT 0,
  exige_serial INTEGER NOT NULL DEFAULT 0,
  observacao TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Uma linha por unidade/posição retirada durante a separação - é o que
-- permite devolver exatamente para a posição de origem em caso de
-- cancelamento (estornado=1 marca uma alocação já revertida ou já
-- consumida na expedição).
CREATE TABLE IF NOT EXISTS logistics_separacao_alocacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_item_id INTEGER NOT NULL REFERENCES logistics_pedido_saida_itens(id),
  product_id INTEGER NOT NULL REFERENCES logistics_products(id),
  position_id INTEGER NOT NULL REFERENCES logistics_positions(id),
  quantidade REAL NOT NULL,
  serial_id INTEGER REFERENCES logistics_serials(id),
  estornado INTEGER NOT NULL DEFAULT 0,
  estornado_por INTEGER REFERENCES users(id),
  estornado_em TEXT,
  expedido INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_separacao_divergencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES logistics_pedidos_saida(id),
  item_id INTEGER REFERENCES logistics_pedido_saida_itens(id),
  tipo TEXT NOT NULL CHECK(tipo IN (
    'nao_encontrado','saldo_insuficiente','localizacao_errada','avariado',
    'serial_invalido','foto_divergente','quantidade_divergente','sku_errado','outro'
  )),
  descricao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('aberta','resolvida')) DEFAULT 'aberta',
  resolvido_por INTEGER REFERENCES users(id),
  resolvido_em TEXT,
  resolucao TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logistics_separacao_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES logistics_pedidos_saida(id),
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logistics_serials_product ON logistics_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_logistics_serials_status ON logistics_serials(status);
CREATE INDEX IF NOT EXISTS idx_logistics_conferencias_status ON logistics_conferencias(status);
CREATE INDEX IF NOT EXISTS idx_logistics_conferencia_itens_conferencia ON logistics_conferencia_itens(conferencia_id);
CREATE INDEX IF NOT EXISTS idx_logistics_conferencia_divergencias_conferencia ON logistics_conferencia_divergencias(conferencia_id);
CREATE INDEX IF NOT EXISTS idx_logistics_conferencia_eventos_conferencia ON logistics_conferencia_eventos(conferencia_id);
CREATE INDEX IF NOT EXISTS idx_logistics_pedidos_saida_status ON logistics_pedidos_saida(status);
CREATE INDEX IF NOT EXISTS idx_logistics_pedido_saida_itens_pedido ON logistics_pedido_saida_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_logistics_separacao_alocacoes_item ON logistics_separacao_alocacoes(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_logistics_separacao_divergencias_pedido ON logistics_separacao_divergencias(pedido_id);
CREATE INDEX IF NOT EXISTS idx_logistics_separacao_eventos_pedido ON logistics_separacao_eventos(pedido_id);
`);

// logistics_racks existia sem a área de separação (posição virtual usada
// para reservar o que já foi separado até a expedição); adiciona a coluna
// e cria o montante especial uma única vez, do mesmo jeito que o
// "Estoque não organizado" acima - nunca aparece no mapa, não pode ser
// excluído nem editado.
if (!columnExists("logistics_racks", "is_separation_area")) {
  db.exec("ALTER TABLE logistics_racks ADD COLUMN is_separation_area INTEGER NOT NULL DEFAULT 0");
}
{
  const andarPadrao = db.prepare("SELECT id FROM logistics_floors ORDER BY display_order, id LIMIT 1").get();
  const areaSeparacao = db.prepare("SELECT id FROM logistics_racks WHERE is_separation_area = 1").get();
  if (andarPadrao && !areaSeparacao) {
    const now = nowStamp();
    const rack = db
      .prepare(
        `INSERT INTO logistics_racks (floor_id,code,name,x,y,width,height,rotation,color,active,is_separation_area,created_at,updated_at)
         VALUES (?,'AREA-SEPARACAO','Área de separação',0,0,1,1,0,'',1,1,?,?)`
      )
      .run(andarPadrao.id, now, now);
    const side = db
      .prepare(
        `INSERT INTO logistics_rack_sides (rack_id,code,name,shelves_count,display_order,active,created_at,updated_at)
         VALUES (?,'A','Separação',1,0,1,?,?)`
      )
      .run(rack.lastInsertRowid, now, now);
    db.prepare(
      `INSERT INTO logistics_positions (rack_id,side_id,shelf_number,code,name,active,blocked,created_at,updated_at)
       VALUES (?,?,1,'AREA-SEPARACAO-A-P001','Separação',1,0,?,?)`
    ).run(rack.lastInsertRowid, side.lastInsertRowid, now, now);
  }
}

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
