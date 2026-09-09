const express = require("express");
const { db, transaction } = require("../../db");
const { requireAdmin } = require("../../auth");
const { nowStamp } = require("../../util");
const { broadcast } = require("../../realtime");
const { registrarAuditoria } = require("../../lib/logisticaAudit");
const { codigoPosicao } = require("../../lib/logisticaCodigos");

const router = express.Router();

function groupBy(rows, key) {
  const out = {};
  for (const row of rows) {
    (out[row[key]] ??= []).push(row);
  }
  return out;
}

// ---- Árvore completa do mapa ----

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM logistics_rows ORDER BY display_order, code").all();
  const aisles = db.prepare("SELECT * FROM logistics_aisles ORDER BY display_order, code").all();
  const racks = db.prepare("SELECT * FROM logistics_racks ORDER BY display_order, code").all();
  const positions = db
    .prepare(
      `SELECT pos.*,
        COALESCE((SELECT COUNT(*) FROM logistics_position_stock WHERE position_id = pos.id AND quantity > 0), 0) AS product_count,
        COALESCE((SELECT SUM(quantity) FROM logistics_position_stock WHERE position_id = pos.id), 0) AS total_quantity
       FROM logistics_positions pos
       ORDER BY level_number`
    )
    .all();

  const positionsByRack = groupBy(positions, "rack_id");
  const racksByAisle = groupBy(racks, "aisle_id");
  const aislesByRow = groupBy(aisles, "row_id");

  const tree = rows.map((row) => ({
    ...row,
    aisles: (aislesByRow[row.id] || []).map((aisle) => ({
      ...aisle,
      racks: (racksByAisle[aisle.id] || []).map((rack) => ({
        ...rack,
        positions: positionsByRack[rack.id] || [],
      })),
    })),
  }));

  res.json({ rows: tree });
});

// Busca por produto (destaca posições onde ele está guardado) ou por
// código/nome de posição direto.
router.get("/buscar", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ porProduto: [], posicoes: [] });
  const like = `%${q}%`;

  const porProduto = db
    .prepare(
      `SELECT ps.position_id, ps.quantity, pos.code AS position_code, p.id AS product_id, p.code AS product_code, p.name AS product_name
       FROM logistics_position_stock ps
       JOIN logistics_positions pos ON pos.id = ps.position_id
       JOIN logistics_products p ON p.id = ps.product_id
       WHERE ps.quantity > 0 AND (p.code LIKE ? OR p.name LIKE ?)
       ORDER BY pos.code`
    )
    .all(like, like);

  const posicoes = db
    .prepare(`SELECT id, code, name FROM logistics_positions WHERE code LIKE ? OR name LIKE ? ORDER BY code LIMIT 20`)
    .all(like, like);

  res.json({ porProduto, posicoes });
});

router.get("/posicoes/:id", (req, res) => {
  const id = Number(req.params.id);
  const posicao = db
    .prepare(
      `SELECT pos.*, rk.code AS rack_code, rk.name AS rack_name, a.code AS aisle_code, a.name AS aisle_name,
              r.code AS row_code, r.name AS row_name
       FROM logistics_positions pos
       JOIN logistics_racks rk ON rk.id = pos.rack_id
       JOIN logistics_aisles a ON a.id = rk.aisle_id
       JOIN logistics_rows r ON r.id = a.row_id
       WHERE pos.id = ?`
    )
    .get(id);
  if (!posicao) return res.status(404).json({ error: "Posição não encontrada." });

  const produtos = db
    .prepare(
      `SELECT ps.quantity, p.id, p.code, p.name, p.unit
       FROM logistics_position_stock ps
       JOIN logistics_products p ON p.id = ps.product_id
       WHERE ps.position_id = ? AND ps.quantity > 0
       ORDER BY p.name COLLATE NOCASE`
    )
    .all(id);

  const movimentacoes = db
    .prepare(
      `SELECT m.*, o.number, o.type, o.reason, o.responsible,
              p.code AS product_code, p.name AS product_name,
              fp.code AS from_position_code, tp.code AS to_position_code
       FROM logistics_movements m
       JOIN logistics_operations o ON o.id = m.operation_id
       JOIN logistics_products p ON p.id = m.product_id
       LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
       LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
       WHERE m.from_position_id = ? OR m.to_position_id = ?
       ORDER BY m.created_at DESC, m.id DESC LIMIT 20`
    )
    .all(id, id);

  res.json({ posicao, produtos, movimentacoes });
});

// ---- Fileiras ----

router.post("/fileiras", requireAdmin, (req, res) => {
  const b = req.body || {};
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  if (!code || !name) return res.status(400).json({ error: "Código e nome são obrigatórios." });
  const now = nowStamp();
  try {
    const result = db
      .prepare(
        `INSERT INTO logistics_rows (code,name,color,display_order,active,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,1,?,?,?,?)`
      )
      .run(code, name, String(b.color || "").trim(), Number(b.displayOrder) || 0, req.user.id, now, req.user.id, now);
    registrarAuditoria({ action: "fileira.criar", entityType: "logistics_rows", entityId: result.lastInsertRowid, user: req.user, newData: { code, name } });
    broadcast("logistica");
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Já existe uma fileira com esse código." });
  }
});

router.patch("/fileiras/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM logistics_rows WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Fileira não encontrada." });
  const b = req.body || {};
  const fields = [];
  const values = [];
  for (const key of ["name", "color"]) {
    if (typeof b[key] === "string") {
      fields.push(`${key} = ?`);
      values.push(b[key].trim());
    }
  }
  if (typeof b.active === "boolean") {
    fields.push("active = ?");
    values.push(b.active ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp(), id);
  db.prepare(`UPDATE logistics_rows SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  registrarAuditoria({ action: "fileira.editar", entityType: "logistics_rows", entityId: id, user: req.user, previousData: row, newData: b });
  broadcast("logistica");
  res.json({ ok: true });
});

router.delete("/fileiras/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM logistics_rows WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Fileira não encontrada." });
  if (temUso("row", id)) {
    return res.status(400).json({ error: "Essa fileira já tem posições com estoque ou histórico. Inative em vez de excluir." });
  }
  try {
    excluirRowCascata(id);
    registrarAuditoria({ action: "fileira.excluir", entityType: "logistics_rows", entityId: id, user: req.user, previousData: row });
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Não foi possível excluir a fileira." });
  }
});

// ---- Corredores ----

router.post("/corredores", requireAdmin, (req, res) => {
  const b = req.body || {};
  const rowId = Number(b.rowId);
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  if (!rowId || !code || !name) return res.status(400).json({ error: "Fileira, código e nome são obrigatórios." });
  const row = db.prepare("SELECT id FROM logistics_rows WHERE id = ?").get(rowId);
  if (!row) return res.status(400).json({ error: "Fileira inválida." });
  const now = nowStamp();
  try {
    const result = db
      .prepare(
        `INSERT INTO logistics_aisles (row_id,code,name,display_order,active,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,1,?,?,?,?)`
      )
      .run(rowId, code, name, Number(b.displayOrder) || 0, req.user.id, now, req.user.id, now);
    registrarAuditoria({ action: "corredor.criar", entityType: "logistics_aisles", entityId: result.lastInsertRowid, user: req.user, newData: { rowId, code, name } });
    broadcast("logistica");
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Já existe um corredor com esse código nessa fileira." });
  }
});

router.patch("/corredores/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const aisle = db.prepare("SELECT * FROM logistics_aisles WHERE id = ?").get(id);
  if (!aisle) return res.status(404).json({ error: "Corredor não encontrado." });
  const b = req.body || {};
  const fields = [];
  const values = [];
  if (typeof b.name === "string") {
    fields.push("name = ?");
    values.push(b.name.trim());
  }
  if (typeof b.active === "boolean") {
    fields.push("active = ?");
    values.push(b.active ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp(), id);
  db.prepare(`UPDATE logistics_aisles SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  registrarAuditoria({ action: "corredor.editar", entityType: "logistics_aisles", entityId: id, user: req.user, previousData: aisle, newData: b });
  broadcast("logistica");
  res.json({ ok: true });
});

router.delete("/corredores/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const aisle = db.prepare("SELECT * FROM logistics_aisles WHERE id = ?").get(id);
  if (!aisle) return res.status(404).json({ error: "Corredor não encontrado." });
  if (temUso("aisle", id)) {
    return res.status(400).json({ error: "Esse corredor já tem posições com estoque ou histórico. Inative em vez de excluir." });
  }
  excluirAisleCascata(id);
  registrarAuditoria({ action: "corredor.excluir", entityType: "logistics_aisles", entityId: id, user: req.user, previousData: aisle });
  broadcast("logistica");
  res.json({ ok: true });
});

// ---- Montantes ----

const criarMontanteTx = transaction((b, user) => {
  const aisle = db
    .prepare("SELECT a.*, r.code AS row_code FROM logistics_aisles a JOIN logistics_rows r ON r.id = a.row_id WHERE a.id = ?")
    .get(b.aisleId);
  if (!aisle) throw new Error("Corredor não encontrado.");
  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO logistics_racks (aisle_id,code,name,levels_count,color,display_order,active,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,1,?,?,?,?)`
    )
    .run(aisle.id, b.code, b.name, b.levelsCount, b.color, b.displayOrder || 0, user.id, now, user.id, now);
  const rackId = result.lastInsertRowid;
  for (let level = 1; level <= b.levelsCount; level++) {
    const code = codigoPosicao(aisle.row_code, aisle.code, b.code, level);
    db.prepare(
      `INSERT INTO logistics_positions (rack_id,level_number,code,name,active,blocked,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,1,0,?,?,?,?)`
    ).run(rackId, level, code, "", user.id, now, user.id, now);
  }
  return rackId;
});

router.post("/montantes", requireAdmin, (req, res) => {
  const b = req.body || {};
  const aisleId = Number(b.aisleId);
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  const levelsCount = Number(b.levelsCount);
  if (!aisleId || !code || !name) return res.status(400).json({ error: "Corredor, código e nome são obrigatórios." });
  if (!Number.isInteger(levelsCount) || levelsCount < 1 || levelsCount > 20) {
    return res.status(400).json({ error: "A quantidade de níveis precisa ser um número entre 1 e 20." });
  }
  try {
    const id = criarMontanteTx({ aisleId, code, name, levelsCount, color: String(b.color || "").trim(), displayOrder: Number(b.displayOrder) || 0 }, req.user);
    registrarAuditoria({ action: "montante.criar", entityType: "logistics_racks", entityId: id, user: req.user, newData: { aisleId, code, name, levelsCount } });
    broadcast("logistica");
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Já existe um montante com esse código nesse corredor." });
  }
});

const alterarNiveisTx = transaction((rack, novoTotal, user) => {
  const atual = rack.levels_count;
  if (novoTotal > atual) {
    const aisle = db
      .prepare("SELECT a.*, r.code AS row_code FROM logistics_aisles a JOIN logistics_rows r ON r.id = a.row_id WHERE a.id = ?")
      .get(rack.aisle_id);
    const now = nowStamp();
    for (let level = atual + 1; level <= novoTotal; level++) {
      const code = codigoPosicao(aisle.row_code, aisle.code, rack.code, level);
      db.prepare(
        `INSERT INTO logistics_positions (rack_id,level_number,code,name,active,blocked,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,1,0,?,?,?,?)`
      ).run(rack.id, level, code, "", user.id, now, user.id, now);
    }
  } else if (novoTotal < atual) {
    const removendo = db
      .prepare("SELECT id FROM logistics_positions WHERE rack_id = ? AND level_number > ?")
      .all(rack.id, novoTotal)
      .map((r) => r.id);
    for (const positionId of removendo) {
      if (posicaoTemUso(positionId)) {
        throw new Error("Um dos níveis que seriam removidos já tem estoque ou histórico. Esvazie ou inative em vez de diminuir.");
      }
    }
    for (const positionId of removendo) {
      db.prepare("DELETE FROM logistics_positions WHERE id = ?").run(positionId);
    }
  }
  db.prepare("UPDATE logistics_racks SET levels_count = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoTotal, user.id, nowStamp(), rack.id);
});

router.patch("/montantes/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const rack = db.prepare("SELECT * FROM logistics_racks WHERE id = ?").get(id);
  if (!rack) return res.status(404).json({ error: "Montante não encontrado." });
  const b = req.body || {};

  try {
    if (b.levelsCount !== undefined && Number(b.levelsCount) !== rack.levels_count) {
      const novoTotal = Number(b.levelsCount);
      if (!Number.isInteger(novoTotal) || novoTotal < 1 || novoTotal > 20) {
        return res.status(400).json({ error: "A quantidade de níveis precisa ser um número entre 1 e 20." });
      }
      alterarNiveisTx(rack, novoTotal, req.user);
      registrarAuditoria({ action: "montante.alterar_niveis", entityType: "logistics_racks", entityId: id, user: req.user, previousData: { levels_count: rack.levels_count }, newData: { levels_count: novoTotal } });
    }

    const fields = [];
    const values = [];
    if (typeof b.name === "string") {
      fields.push("name = ?");
      values.push(b.name.trim());
    }
    if (typeof b.color === "string") {
      fields.push("color = ?");
      values.push(b.color.trim());
    }
    if (typeof b.active === "boolean") {
      fields.push("active = ?");
      values.push(b.active ? 1 : 0);
    }
    if (fields.length) {
      fields.push("updated_by = ?", "updated_at = ?");
      values.push(req.user.id, nowStamp(), id);
      db.prepare(`UPDATE logistics_racks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      registrarAuditoria({ action: "montante.editar", entityType: "logistics_racks", entityId: id, user: req.user, previousData: rack, newData: b });
    }

    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o montante." });
  }
});

router.delete("/montantes/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const rack = db.prepare("SELECT * FROM logistics_racks WHERE id = ?").get(id);
  if (!rack) return res.status(404).json({ error: "Montante não encontrado." });
  if (temUso("rack", id)) {
    return res.status(400).json({ error: "Esse montante já tem posições com estoque ou histórico. Inative em vez de excluir." });
  }
  excluirRackCascata(id);
  registrarAuditoria({ action: "montante.excluir", entityType: "logistics_racks", entityId: id, user: req.user, previousData: rack });
  broadcast("logistica");
  res.json({ ok: true });
});

// ---- Posições ----

router.patch("/posicoes/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const posicao = db.prepare("SELECT * FROM logistics_positions WHERE id = ?").get(id);
  if (!posicao) return res.status(404).json({ error: "Posição não encontrada." });
  const b = req.body || {};
  const fields = [];
  const values = [];
  if (typeof b.name === "string") {
    fields.push("name = ?");
    values.push(b.name.trim());
  }
  if (typeof b.active === "boolean") {
    fields.push("active = ?");
    values.push(b.active ? 1 : 0);
  }
  if (typeof b.blocked === "boolean") {
    fields.push("blocked = ?");
    values.push(b.blocked ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp(), id);
  db.prepare(`UPDATE logistics_positions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  registrarAuditoria({ action: "posicao.editar", entityType: "logistics_positions", entityId: id, user: req.user, previousData: posicao, newData: b });
  broadcast("logistica");
  res.json({ ok: true });
});

// ---- Helpers de uso/exclusão em cascata ----

function posicaoTemUso(positionId) {
  const saldo = db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM logistics_position_stock WHERE position_id = ?").get(positionId).n;
  if (saldo > 0) return true;
  const mov = db
    .prepare("SELECT COUNT(*) AS n FROM logistics_movements WHERE from_position_id = ? OR to_position_id = ?")
    .get(positionId, positionId).n;
  return mov > 0;
}

function temUso(nivel, id) {
  let positionIds = [];
  if (nivel === "row") {
    positionIds = db
      .prepare(
        `SELECT pos.id FROM logistics_positions pos
         JOIN logistics_racks rk ON rk.id = pos.rack_id
         JOIN logistics_aisles a ON a.id = rk.aisle_id
         WHERE a.row_id = ?`
      )
      .all(id)
      .map((r) => r.id);
  } else if (nivel === "aisle") {
    positionIds = db
      .prepare(`SELECT pos.id FROM logistics_positions pos JOIN logistics_racks rk ON rk.id = pos.rack_id WHERE rk.aisle_id = ?`)
      .all(id)
      .map((r) => r.id);
  } else if (nivel === "rack") {
    positionIds = db.prepare("SELECT id FROM logistics_positions WHERE rack_id = ?").all(id).map((r) => r.id);
  }
  return positionIds.some(posicaoTemUso);
}

const excluirRackCascata = transaction((rackId) => {
  db.prepare("DELETE FROM logistics_positions WHERE rack_id = ?").run(rackId);
  db.prepare("DELETE FROM logistics_racks WHERE id = ?").run(rackId);
});

const excluirAisleCascata = transaction((aisleId) => {
  const racks = db.prepare("SELECT id FROM logistics_racks WHERE aisle_id = ?").all(aisleId).map((r) => r.id);
  for (const rackId of racks) {
    db.prepare("DELETE FROM logistics_positions WHERE rack_id = ?").run(rackId);
  }
  db.prepare("DELETE FROM logistics_racks WHERE aisle_id = ?").run(aisleId);
  db.prepare("DELETE FROM logistics_aisles WHERE id = ?").run(aisleId);
});

const excluirRowCascata = transaction((rowId) => {
  const aisles = db.prepare("SELECT id FROM logistics_aisles WHERE row_id = ?").all(rowId).map((r) => r.id);
  for (const aisleId of aisles) {
    const racks = db.prepare("SELECT id FROM logistics_racks WHERE aisle_id = ?").all(aisleId).map((r) => r.id);
    for (const rackId of racks) {
      db.prepare("DELETE FROM logistics_positions WHERE rack_id = ?").run(rackId);
    }
    db.prepare("DELETE FROM logistics_racks WHERE aisle_id = ?").run(aisleId);
  }
  db.prepare("DELETE FROM logistics_aisles WHERE row_id = ?").run(rowId);
  db.prepare("DELETE FROM logistics_rows WHERE id = ?").run(rowId);
});

module.exports = router;
