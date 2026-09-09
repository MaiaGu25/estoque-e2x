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
// Fileira > Corredor > Montante > Lado > Prateleira (posição final).

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM logistics_rows ORDER BY display_order, code").all();
  const aisles = db.prepare("SELECT * FROM logistics_aisles ORDER BY display_order, code").all();
  const racks = db.prepare("SELECT * FROM logistics_racks ORDER BY display_order, code").all();
  const sides = db.prepare("SELECT * FROM logistics_rack_sides ORDER BY display_order, code").all();
  const positions = db
    .prepare(
      `SELECT pos.*,
        COALESCE((SELECT COUNT(*) FROM logistics_position_stock WHERE position_id = pos.id AND quantity > 0), 0) AS product_count,
        COALESCE((SELECT SUM(quantity) FROM logistics_position_stock WHERE position_id = pos.id), 0) AS total_quantity
       FROM logistics_positions pos
       ORDER BY shelf_number`
    )
    .all();

  const positionsBySide = groupBy(positions, "side_id");
  const sidesByRack = groupBy(sides, "rack_id");
  const racksByAisle = groupBy(racks, "aisle_id");
  const aislesByRow = groupBy(aisles, "row_id");

  const tree = rows.map((row) => ({
    ...row,
    aisles: (aislesByRow[row.id] || []).map((aisle) => ({
      ...aisle,
      racks: (racksByAisle[aisle.id] || []).map((rack) => ({
        ...rack,
        sides: (sidesByRack[rack.id] || []).map((side) => ({
          ...side,
          positions: positionsBySide[side.id] || [],
        })),
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
      `SELECT pos.*, s.code AS side_code, s.name AS side_name,
              rk.code AS rack_code, rk.name AS rack_name, a.code AS aisle_code, a.name AS aisle_name,
              r.code AS row_code, r.name AS row_name
       FROM logistics_positions pos
       JOIN logistics_rack_sides s ON s.id = pos.side_id
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
// A partir de agora o montante em si só guarda identificação/aparência;
// a estrutura de armazenagem (lados e prateleiras) vive em
// logistics_rack_sides / logistics_positions, criada à parte.

router.post("/montantes", requireAdmin, (req, res) => {
  const b = req.body || {};
  const aisleId = Number(b.aisleId);
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  if (!aisleId || !code || !name) return res.status(400).json({ error: "Corredor, código e nome são obrigatórios." });
  const aisle = db.prepare("SELECT id FROM logistics_aisles WHERE id = ?").get(aisleId);
  if (!aisle) return res.status(400).json({ error: "Corredor inválido." });
  const now = nowStamp();
  try {
    const result = db
      .prepare(
        `INSERT INTO logistics_racks (aisle_id,code,name,color,display_order,active,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,1,?,?,?,?)`
      )
      .run(aisleId, code, name, String(b.color || "").trim(), Number(b.displayOrder) || 0, req.user.id, now, req.user.id, now);
    registrarAuditoria({ action: "montante.criar", entityType: "logistics_racks", entityId: result.lastInsertRowid, user: req.user, newData: { aisleId, code, name } });
    broadcast("logistica");
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Já existe um montante com esse código nesse corredor." });
  }
});

router.patch("/montantes/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const rack = db.prepare("SELECT * FROM logistics_racks WHERE id = ?").get(id);
  if (!rack) return res.status(404).json({ error: "Montante não encontrado." });
  const b = req.body || {};
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
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp(), id);
  db.prepare(`UPDATE logistics_racks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  registrarAuditoria({ action: "montante.editar", entityType: "logistics_racks", entityId: id, user: req.user, previousData: rack, newData: b });
  broadcast("logistica");
  res.json({ ok: true });
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

// ---- Lados do montante ----
// Cada lado tem sua própria quantidade de prateleiras: um montante comprido
// pode ter só 1 lado com 70 prateleiras, outro pode ter 2 lados com 8 cada.

const criarLadoTx = transaction((b, user) => {
  const rack = db
    .prepare(
      `SELECT rk.*, a.code AS aisle_code, r.code AS row_code
       FROM logistics_racks rk
       JOIN logistics_aisles a ON a.id = rk.aisle_id
       JOIN logistics_rows r ON r.id = a.row_id
       WHERE rk.id = ?`
    )
    .get(b.rackId);
  if (!rack) throw new Error("Montante não encontrado.");
  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO logistics_rack_sides (rack_id,code,name,shelves_count,display_order,active,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,1,?,?,?,?)`
    )
    .run(rack.id, b.code, b.name, b.shelvesCount, b.displayOrder || 0, user.id, now, user.id, now);
  const sideId = result.lastInsertRowid;
  for (let shelf = 1; shelf <= b.shelvesCount; shelf++) {
    const code = codigoPosicao(rack.row_code, rack.aisle_code, rack.code, b.code, shelf);
    db.prepare(
      `INSERT INTO logistics_positions (rack_id,side_id,shelf_number,code,name,active,blocked,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,1,0,?,?,?,?)`
    ).run(rack.id, sideId, shelf, code, "", user.id, now, user.id, now);
  }
  return sideId;
});

router.post("/lados", requireAdmin, (req, res) => {
  const b = req.body || {};
  const rackId = Number(b.rackId);
  const code = String(b.code || "").trim().toUpperCase();
  const name = String(b.name || "").trim();
  const shelvesCount = Number(b.shelvesCount);
  if (!rackId || !code || !name) return res.status(400).json({ error: "Montante, código e nome são obrigatórios." });
  if (!Number.isInteger(shelvesCount) || shelvesCount < 1 || shelvesCount > 300) {
    return res.status(400).json({ error: "A quantidade de prateleiras precisa ser um número entre 1 e 300." });
  }
  try {
    const id = criarLadoTx({ rackId, code, name, shelvesCount }, req.user);
    registrarAuditoria({ action: "lado.criar", entityType: "logistics_rack_sides", entityId: id, user: req.user, newData: { rackId, code, name, shelvesCount } });
    broadcast("logistica");
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Já existe um lado com esse código nesse montante." });
  }
});

const alterarPrateleirasTx = transaction((side, novoTotal, user) => {
  const atual = side.shelves_count;
  if (novoTotal > atual) {
    const rack = db
      .prepare(
        `SELECT rk.code AS rack_code, a.code AS aisle_code, r.code AS row_code
         FROM logistics_racks rk
         JOIN logistics_aisles a ON a.id = rk.aisle_id
         JOIN logistics_rows r ON r.id = a.row_id
         WHERE rk.id = ?`
      )
      .get(side.rack_id);
    const now = nowStamp();
    for (let shelf = atual + 1; shelf <= novoTotal; shelf++) {
      const code = codigoPosicao(rack.row_code, rack.aisle_code, rack.rack_code, side.code, shelf);
      db.prepare(
        `INSERT INTO logistics_positions (rack_id,side_id,shelf_number,code,name,active,blocked,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,1,0,?,?,?,?)`
      ).run(side.rack_id, side.id, shelf, code, "", user.id, now, user.id, now);
    }
  } else if (novoTotal < atual) {
    const removendo = db
      .prepare("SELECT id FROM logistics_positions WHERE side_id = ? AND shelf_number > ?")
      .all(side.id, novoTotal)
      .map((r) => r.id);
    for (const positionId of removendo) {
      if (posicaoTemUso(positionId)) {
        throw new Error("Uma das prateleiras que seriam removidas já tem estoque ou histórico. Esvazie ou inative em vez de diminuir.");
      }
    }
    for (const positionId of removendo) {
      db.prepare("DELETE FROM logistics_positions WHERE id = ?").run(positionId);
    }
  }
  db.prepare("UPDATE logistics_rack_sides SET shelves_count = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoTotal, user.id, nowStamp(), side.id);
});

router.patch("/lados/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const side = db.prepare("SELECT * FROM logistics_rack_sides WHERE id = ?").get(id);
  if (!side) return res.status(404).json({ error: "Lado não encontrado." });
  const b = req.body || {};

  try {
    if (b.shelvesCount !== undefined && Number(b.shelvesCount) !== side.shelves_count) {
      const novoTotal = Number(b.shelvesCount);
      if (!Number.isInteger(novoTotal) || novoTotal < 1 || novoTotal > 300) {
        return res.status(400).json({ error: "A quantidade de prateleiras precisa ser um número entre 1 e 300." });
      }
      alterarPrateleirasTx(side, novoTotal, req.user);
      registrarAuditoria({
        action: "lado.alterar_prateleiras",
        entityType: "logistics_rack_sides",
        entityId: id,
        user: req.user,
        previousData: { shelves_count: side.shelves_count },
        newData: { shelves_count: novoTotal },
      });
    }

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
    if (fields.length) {
      fields.push("updated_by = ?", "updated_at = ?");
      values.push(req.user.id, nowStamp(), id);
      db.prepare(`UPDATE logistics_rack_sides SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      registrarAuditoria({ action: "lado.editar", entityType: "logistics_rack_sides", entityId: id, user: req.user, previousData: side, newData: b });
    }

    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o lado." });
  }
});

router.delete("/lados/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const side = db.prepare("SELECT * FROM logistics_rack_sides WHERE id = ?").get(id);
  if (!side) return res.status(404).json({ error: "Lado não encontrado." });
  if (temUso("side", id)) {
    return res.status(400).json({ error: "Esse lado já tem posições com estoque ou histórico. Inative em vez de excluir." });
  }
  excluirLadoCascata(id);
  registrarAuditoria({ action: "lado.excluir", entityType: "logistics_rack_sides", entityId: id, user: req.user, previousData: side });
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
  } else if (nivel === "side") {
    positionIds = db.prepare("SELECT id FROM logistics_positions WHERE side_id = ?").all(id).map((r) => r.id);
  }
  return positionIds.some(posicaoTemUso);
}

const excluirLadoCascata = transaction((sideId) => {
  db.prepare("DELETE FROM logistics_positions WHERE side_id = ?").run(sideId);
  db.prepare("DELETE FROM logistics_rack_sides WHERE id = ?").run(sideId);
});

const excluirRackCascata = transaction((rackId) => {
  db.prepare("DELETE FROM logistics_positions WHERE rack_id = ?").run(rackId);
  db.prepare("DELETE FROM logistics_rack_sides WHERE rack_id = ?").run(rackId);
  db.prepare("DELETE FROM logistics_racks WHERE id = ?").run(rackId);
});

const excluirAisleCascata = transaction((aisleId) => {
  const racks = db.prepare("SELECT id FROM logistics_racks WHERE aisle_id = ?").all(aisleId).map((r) => r.id);
  for (const rackId of racks) {
    db.prepare("DELETE FROM logistics_positions WHERE rack_id = ?").run(rackId);
    db.prepare("DELETE FROM logistics_rack_sides WHERE rack_id = ?").run(rackId);
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
      db.prepare("DELETE FROM logistics_rack_sides WHERE rack_id = ?").run(rackId);
    }
    db.prepare("DELETE FROM logistics_racks WHERE aisle_id = ?").run(aisleId);
  }
  db.prepare("DELETE FROM logistics_aisles WHERE row_id = ?").run(rowId);
  db.prepare("DELETE FROM logistics_rows WHERE id = ?").run(rowId);
});

module.exports = router;
