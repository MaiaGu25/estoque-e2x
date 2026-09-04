const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { db, transaction, getMeta, setMeta } = require("../db");
const { initialParts, initialMovements } = require("./initial-data");
const tecnicosData = require("./tecnicos-data");
const { testes: testesIniciais } = require("./testes-data");

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

function seedInventoryIfEmpty() {
  if (getMeta("inventory_seeded")) return;

  const insertPart = db.prepare(
    "INSERT INTO parts (id,code,name,category,unit,location,quantity,minimum_stock,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const insertMovement = db.prepare(
    "INSERT INTO movements (id,part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at) VALUES (?,?,NULL,?,?,?,?,?,?,?,NULL,?)"
  );

  const run = transaction(() => {
    for (const p of initialParts) {
      insertPart.run(
        p.id, p.code, p.name, p.category, p.unit, p.location,
        p.quantity, p.minimumStock, p.notes, p.active, p.createdAt, p.updatedAt
      );
    }
    for (const m of initialMovements) {
      insertMovement.run(
        m.id, m.partId, m.type, m.quantity, m.previousBalance, m.newBalance,
        m.reason, m.responsible, m.notes || "Migração da versão anterior", m.createdAt
      );
    }
    // Mantém os contadores AUTOINCREMENT à frente dos IDs importados.
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'parts'").run(initialParts.length);
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'movements'").run(initialMovements.length);
    setMeta("inventory_seeded", new Date().toISOString());
  });
  run();

  console.log(`[seed] ${initialParts.length} peças e ${initialMovements.length} movimentações importadas.`);
}

function seedTecnicosIfEmpty() {
  if (getMeta("tecnicos_seeded")) return;

  const insertItem = db.prepare(
    "INSERT INTO tec_itens (id,categoria,nome,quantidade,limite_baixo,ativo) VALUES (?,?,?,?,?,1)"
  );
  const insertConfig = db.prepare(
    "INSERT INTO tec_configuracoes (id,nome,processador,ram,ssd,observacao,ativo) VALUES (?,?,?,?,?,?,1)"
  );
  const insertConfigItem = db.prepare(
    "INSERT INTO tec_config_itens (configuracao_id,item_id,quantidade) VALUES (?,?,?)"
  );
  const insertMaquina = db.prepare(
    "INSERT INTO tec_maquinas (configuracao_id,quantidade) VALUES (?,?)"
  );
  const insertMovimento = db.prepare(
    "INSERT INTO tec_movimentos (tipo,alvo,quantidade,motivo,detalhe,responsible,created_by,created_at) VALUES (?,?,?,?,?,?,NULL,?)"
  );

  const run = transaction(() => {
    for (const it of tecnicosData.itens) {
      insertItem.run(it.id, it.categoria, it.nome, it.quantidade, it.limiteBaixo);
    }
    for (const c of tecnicosData.configuracoes) {
      insertConfig.run(c.id, c.nome, c.processador, c.ram, c.ssd, c.observacao);
    }
    for (const ci of tecnicosData.configItens) {
      insertConfigItem.run(ci.configuracaoId, ci.itemId, ci.quantidade);
    }
    for (const m of tecnicosData.maquinas) {
      insertMaquina.run(m.configuracaoId, m.quantidade);
    }
    for (const mv of tecnicosData.movimentos) {
      insertMovimento.run(mv.tipo, mv.alvo, mv.quantidade, mv.motivo, mv.detalhe, mv.responsavel, mv.dataHora);
    }
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'tec_itens'").run(tecnicosData.itens.length);
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'tec_configuracoes'").run(tecnicosData.configuracoes.length);
    setMeta("tecnicos_seeded", new Date().toISOString());
  });
  run();

  console.log(`[seed] ${tecnicosData.itens.length} itens e ${tecnicosData.movimentos.length} movimentações do Estoque dos Técnicos importados.`);
}

function seedTestesIfEmpty() {
  if (getMeta("testes_seeded")) return;

  const FOTOS_SEED = path.join(__dirname, "testes-fotos");
  const FOTOS_DIR = path.join(__dirname, "..", "..", "data", "testes");
  const insert = db.prepare(
    "INSERT INTO testes (codigo,numero_teste,responsible,created_by,created_at,foto_serial,foto_teste) VALUES (?,?,?,NULL,?,?,?)"
  );

  const run = transaction(() => {
    testesIniciais.forEach((t, index) => {
      const numero = index + 1;
      const origem = path.join(FOTOS_SEED, t.codigo);
      const destino = path.join(FOTOS_DIR, t.codigo);
      fs.mkdirSync(destino, { recursive: true });
      fs.copyFileSync(path.join(origem, "serial.jpg"), path.join(destino, "serial.jpg"));
      fs.copyFileSync(path.join(origem, "teste.jpg"), path.join(destino, "teste.jpg"));
      insert.run(t.codigo, numero, t.responsavel, t.createdAt, `${t.codigo}/serial.jpg`, `${t.codigo}/teste.jpg`);
    });
    setMeta("testes_seeded", new Date().toISOString());
  });
  run();

  console.log(`[seed] ${testesIniciais.length} testes (com fotos) da Central de Testes importados.`);
}

function seedAdminUsersIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO users (username,name,password_hash,role,active,must_change_password,created_at) VALUES (?,?,?,?,1,1,?)"
  );

  const initialAdmins = [
    { username: "igor", name: "Igor" },
    { username: "gustavo", name: "Gustavo" },
  ];

  console.log("\n[seed] Nenhum usuário encontrado. Criando contas administrativas iniciais:");
  for (const admin of initialAdmins) {
    const password = randomPassword();
    const hash = bcrypt.hashSync(password, 10);
    insert.run(admin.username, admin.name, hash, "admin", now);
    console.log(`  usuário: ${admin.username}   senha temporária: ${password}`);
  }
  console.log("  (troque a senha no primeiro acesso - o sistema vai pedir automaticamente)\n");
}

function seed() {
  seedInventoryIfEmpty();
  seedTecnicosIfEmpty();
  seedTestesIfEmpty();
  seedAdminUsersIfEmpty();
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
