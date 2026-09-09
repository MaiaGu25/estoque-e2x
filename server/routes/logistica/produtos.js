const express = require("express");
const { db } = require("../../db");
const { requireAdmin } = require("../../auth");
const { nowStamp } = require("../../util");
const { broadcast } = require("../../realtime");
const { registrarAuditoria } = require("../../lib/logisticaAudit");
const { registrarEntradaTx, buscarPosicaoDeRecebimento } = require("../../lib/logisticaMovimentos");

const router = express.Router();

function situacao(p) {
  if (!p.active) return "inativo";
  if (p.saldo_total <= 0) return "sem_estoque";
  if (p.saldo_total <= p.minimum_stock) return "baixo";
  return "disponivel";
}

const SALDO_SUBQUERY = `COALESCE((SELECT SUM(quantity) FROM logistics_position_stock WHERE product_id = p.id), 0)`;

router.get("/", (req, res) => {
  const { busca, categoria, status } = req.query;
  const where = [];
  const params = [];
  if (status === "ativo") where.push("p.active = 1");
  else if (status === "inativo") where.push("p.active = 0");
  if (categoria) {
    where.push("p.category = ?");
    params.push(String(categoria));
  }
  if (busca) {
    where.push("(p.code LIKE ? OR p.name LIKE ? OR p.category LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like);
  }
  const sql = `
    SELECT p.*, ${SALDO_SUBQUERY} AS saldo_total
    FROM logistics_products p
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.name COLLATE NOCASE LIMIT 1000`;
  const produtos = db.prepare(sql).all(...params).map((p) => ({ ...p, situacao: situacao(p) }));
  res.json({ produtos });
});

router.get("/categorias", (req, res) => {
  const categorias = db
    .prepare("SELECT DISTINCT category FROM logistics_products WHERE category != '' ORDER BY category COLLATE NOCASE")
    .all()
    .map((r) => r.category);
  res.json({ categorias });
});

// Autocomplete rápido para os seletores de produto (movimentações, ajuste,
// busca do mapa). Prioriza: código exato > começa com > contém. Sem termo
// nenhum (campo só clicado, ainda vazio), devolve uma lista padrão pra
// aparecer como lista suspensa em vez de ficar em branco.
router.get("/busca", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    const produtos = db
      .prepare(`SELECT p.*, ${SALDO_SUBQUERY} AS saldo_total FROM logistics_products p WHERE p.active = 1 ORDER BY p.name COLLATE NOCASE LIMIT 20`)
      .all()
      .map((p) => ({ ...p, situacao: situacao(p) }));
    return res.json({ produtos });
  }
  const like = `%${q}%`;
  const startsWith = `${q}%`;
  const produtos = db
    .prepare(
      `SELECT p.*, ${SALDO_SUBQUERY} AS saldo_total
       FROM logistics_products p
       WHERE p.active = 1 AND (p.code LIKE ? OR p.name LIKE ? OR p.category LIKE ?)
       ORDER BY
         CASE WHEN p.code = ? THEN 0
              WHEN p.code LIKE ? THEN 1
              WHEN p.name LIKE ? THEN 2
              ELSE 3 END,
         p.name COLLATE NOCASE
       LIMIT 20`
    )
    .all(like, like, like, q, startsWith, startsWith)
    .map((p) => ({ ...p, situacao: situacao(p) }));
  res.json({ produtos });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const produto = db.prepare(`SELECT p.*, ${SALDO_SUBQUERY} AS saldo_total FROM logistics_products p WHERE p.id = ?`).get(id);
  if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

  const posicoes = db
    .prepare(
      `SELECT ps.quantity, pos.id AS position_id, pos.code AS position_code, pos.name AS position_name,
              pos.shelf_number, s.code AS side_code, s.name AS side_name, rk.name AS rack_name
       FROM logistics_position_stock ps
       JOIN logistics_positions pos ON pos.id = ps.position_id
       JOIN logistics_rack_sides s ON s.id = pos.side_id
       JOIN logistics_racks rk ON rk.id = pos.rack_id
       WHERE ps.product_id = ? AND ps.quantity > 0
       ORDER BY pos.code`
    )
    .all(id);

  const movimentacoes = db
    .prepare(
      `SELECT m.*, o.number, o.type, o.reason, o.responsible, o.notes,
              fp.code AS from_position_code, tp.code AS to_position_code
       FROM logistics_movements m
       JOIN logistics_operations o ON o.id = m.operation_id
       LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
       LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
       WHERE m.product_id = ?
       ORDER BY m.created_at DESC, m.id DESC LIMIT 30`
    )
    .all(id);

  res.json({ produto: { ...produto, situacao: situacao(produto) }, posicoes, movimentacoes });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const code = String(b.code || "").trim();
  const name = String(b.name || "").trim();
  if (!code || !name) return res.status(400).json({ error: "Código e nome são obrigatórios." });
  const initialQuantity = Number(b.initialQuantity) || 0;
  if (initialQuantity < 0) return res.status(400).json({ error: "A quantidade inicial não pode ser negativa." });

  const now = nowStamp();
  let productId;
  try {
    const result = db
      .prepare(
        `INSERT INTO logistics_products (code,name,description,category,unit,minimum_stock,notes,active,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`
      )
      .run(
        code,
        name,
        String(b.description || "").trim(),
        String(b.category || "").trim() || "Geral",
        String(b.unit || "").trim() || "UN",
        Number(b.minimumStock) || 0,
        String(b.notes || "").trim(),
        req.user.id,
        now,
        req.user.id,
        now
      );
    productId = result.lastInsertRowid;
    registrarAuditoria({
      action: "produto.criar",
      entityType: "logistics_products",
      entityId: productId,
      user: req.user,
      newData: { code, name },
    });
  } catch (error) {
    return res.status(400).json({ error: "Já existe um produto com esse código." });
  }

  // Quantidade física informada no cadastro entra como uma ENTRADA normal
  // na posição "Estoque não organizado" - o usuário decide depois, com uma
  // transferência, em qual posição real ela vai ficar.
  if (initialQuantity > 0) {
    const recebimento = buscarPosicaoDeRecebimento();
    if (recebimento) {
      try {
        registrarEntradaTx(
          { productId, positionId: recebimento.id, quantity: initialQuantity, reason: "Cadastro inicial de estoque", responsible: req.user.name },
          req.user
        );
      } catch (error) {
        return res.json({
          ok: true,
          id: productId,
          warning: error instanceof Error ? error.message : "Produto criado, mas não foi possível registrar a quantidade inicial.",
        });
      }
    }
  }

  broadcast("logistica");
  res.json({ ok: true, id: productId });
});

router.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const produto = db.prepare("SELECT * FROM logistics_products WHERE id = ?").get(id);
  if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  const antes = {};
  const depois = {};

  for (const [key, column] of Object.entries({
    name: "name",
    description: "description",
    category: "category",
    unit: "unit",
    notes: "notes",
  })) {
    if (typeof b[key] === "string" && b[key].trim() !== produto[column]) {
      antes[column] = produto[column];
      depois[column] = b[key].trim();
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }
  if (b.minimumStock !== undefined && Number(b.minimumStock) !== produto.minimum_stock) {
    antes.minimum_stock = produto.minimum_stock;
    depois.minimum_stock = Number(b.minimumStock);
    fields.push("minimum_stock = ?");
    values.push(Number(b.minimumStock) || 0);
  }
  if (typeof b.active === "boolean" && (b.active ? 1 : 0) !== produto.active) {
    antes.active = produto.active;
    depois.active = b.active ? 1 : 0;
    fields.push("active = ?");
    values.push(b.active ? 1 : 0);
  }

  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp());
  values.push(id);

  try {
    db.prepare(`UPDATE logistics_products SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    registrarAuditoria({
      action: depois.active === 0 ? "produto.inativar" : depois.active === 1 ? "produto.ativar" : "produto.editar",
      entityType: "logistics_products",
      entityId: id,
      user: req.user,
      previousData: antes,
      newData: depois,
    });
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Não foi possível atualizar o produto." });
  }
});

module.exports = router;
