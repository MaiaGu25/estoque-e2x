const express = require("express");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth);

const STATUS_LABEL = {
  aguardando_envio: "Aguardando envio",
  aguardando_fornecedor: "Aguardando fornecedor",
  trocada: "Trocada",
  recusada: "Recusada pelo fornecedor",
};

function registrarEvento(pecaId, texto, user) {
  db.prepare(
    "INSERT INTO pecas_fornecedor_eventos (peca_id,texto,responsible,created_by,created_at) VALUES (?,?,?,?,?)"
  ).run(pecaId, texto, user.name, user.id, nowStamp());
}

// ---- Fornecedores ----

router.get("/fornecedores", (req, res) => {
  const fornecedores = db.prepare("SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
  res.json({ fornecedores });
});

router.post("/fornecedores", (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Digite o nome do fornecedor." });
  try {
    const result = db
      .prepare("INSERT INTO fornecedores (nome,identificacao,contato) VALUES (?,?,?)")
      .run(nome, String(b.identificacao || "").trim(), String(b.contato || "").trim());
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Já existe um fornecedor com esse nome." });
  }
});

router.patch("/fornecedores/:id", (req, res) => {
  const id = Number(req.params.id);
  const fornecedor = db.prepare("SELECT * FROM fornecedores WHERE id = ?").get(id);
  if (!fornecedor) return res.status(404).json({ error: "Fornecedor não encontrado." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  for (const key of ["nome", "identificacao", "contato"]) {
    if (typeof b[key] === "string") {
      fields.push(`${key} = ?`);
      values.push(b[key].trim());
    }
  }
  if (typeof b.ativo === "boolean") {
    fields.push("ativo = ?");
    values.push(b.ativo ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  values.push(id);
  try {
    db.prepare(`UPDATE fornecedores SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Já existe um fornecedor com esse nome." });
  }
});

// ---- Peças ----

router.get("/pecas", (req, res) => {
  const { status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push("p.status = ?"); params.push(String(status)); }
  if (fornecedorId) { where.push("p.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (busca) {
    where.push("(p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like);
  }
  const sql = `
    SELECT p.*, f.nome AS fornecedor_nome
    FROM pecas_fornecedor p
    JOIN fornecedores f ON f.id = p.fornecedor_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.id DESC LIMIT 500`;
  const pecas = db.prepare(sql).all(...params);
  res.json({ pecas });
});

router.get("/stats", (req, res) => {
  const porStatus = db.prepare("SELECT status, COUNT(*) AS n FROM pecas_fornecedor GROUP BY status").all();
  const hojeInicio = nowStamp().slice(0, 10);
  const registradasHoje = db.prepare("SELECT COUNT(*) AS n FROM pecas_fornecedor WHERE created_at >= ?").get(hojeInicio).n;
  const porFornecedor = db
    .prepare(
      `SELECT f.nome AS fornecedor, COUNT(*) AS n
       FROM pecas_fornecedor p JOIN fornecedores f ON f.id = p.fornecedor_id
       GROUP BY f.nome ORDER BY n DESC LIMIT 10`
    )
    .all();
  res.json({ porStatus, registradasHoje, porFornecedor });
});

router.post("/pecas", (req, res) => {
  const b = req.body || {};
  const fornecedorId = Number(b.fornecedorId);
  const descricao = String(b.descricao || "").trim();
  if (!fornecedorId) return res.status(400).json({ error: "Selecione o fornecedor." });
  if (!descricao) return res.status(400).json({ error: "Descreva a peça." });

  const fornecedor = db.prepare("SELECT id FROM fornecedores WHERE id = ? AND ativo = 1").get(fornecedorId);
  if (!fornecedor) return res.status(400).json({ error: "Fornecedor inválido." });

  const run = transaction(() => {
    const now = nowStamp();
    const result = db
      .prepare(
        `INSERT INTO pecas_fornecedor
         (codigo,serial,descricao,ean,marca,defeito,fornecedor_id,status,rma_relacionado,observacoes,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,?,?,'aguardando_envio',?,?,?,?,?,?)`
      )
      .run(
        String(b.codigo || "").trim(),
        String(b.serial || "").trim(),
        descricao,
        String(b.ean || "").trim(),
        String(b.marca || "").trim(),
        String(b.defeito || "").trim(),
        fornecedorId,
        String(b.rmaRelacionado || "").trim(),
        String(b.observacoes || "").trim(),
        req.user.id,
        now,
        req.user.id,
        now
      );
    const id = result.lastInsertRowid;
    registrarEvento(id, "Peça cadastrada, aguardando envio ao fornecedor.", req.user);
    return id;
  });

  try {
    const id = run();
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar a peça." });
  }
});

router.get("/pecas/:id", (req, res) => {
  const id = Number(req.params.id);
  const peca = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome FROM pecas_fornecedor p JOIN fornecedores f ON f.id = p.fornecedor_id WHERE p.id = ?`
    )
    .get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });
  const eventos = db.prepare("SELECT * FROM pecas_fornecedor_eventos WHERE peca_id = ? ORDER BY id ASC").all(id);
  res.json({ peca, eventos });
});

router.patch("/pecas/:id", (req, res) => {
  const id = Number(req.params.id);
  const peca = db.prepare("SELECT * FROM pecas_fornecedor WHERE id = ?").get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  const eventos = [];

  for (const [key, column] of Object.entries({
    codigo: "codigo",
    serial: "serial",
    descricao: "descricao",
    ean: "ean",
    marca: "marca",
    defeito: "defeito",
    rmaRelacionado: "rma_relacionado",
    observacoes: "observacoes",
  })) {
    if (typeof b[key] === "string" && b[key] !== peca[column]) {
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }

  if (b.status && b.status !== peca.status) {
    if (!STATUS_LABEL[b.status]) return res.status(400).json({ error: "Status inválido." });
    fields.push("status = ?");
    values.push(b.status);
    eventos.push(`Status alterado para "${STATUS_LABEL[b.status]}".`);
  }

  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  const run = transaction(() => {
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(req.user.id, nowStamp());
    values.push(id);
    db.prepare(`UPDATE pecas_fornecedor SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    for (const texto of eventos) registrarEvento(id, texto, req.user);
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a peça." });
  }
});

router.post("/pecas/:id/eventos", (req, res) => {
  const id = Number(req.params.id);
  const peca = db.prepare("SELECT id FROM pecas_fornecedor WHERE id = ?").get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });

  const texto = String((req.body || {}).texto || "").trim();
  if (!texto) return res.status(400).json({ error: "Escreva um comentário." });

  registrarEvento(id, texto, req.user);
  db.prepare("UPDATE pecas_fornecedor SET updated_at = ? WHERE id = ?").run(nowStamp(), id);
  res.json({ ok: true });
});

module.exports = router;
