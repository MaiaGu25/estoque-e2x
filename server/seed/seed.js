const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, getMeta, setMeta } = require("../db");
const { initialParts, initialMovements } = require("./initial-data");

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

  const run = db.transaction(() => {
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
  seedAdminUsersIfEmpty();
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
