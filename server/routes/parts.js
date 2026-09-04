const express = require("express");
const { db } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth);

router.post("/", (req, res) => {
  const b = req.body || {};
  const code = String(b.code || "").trim();
  const name = String(b.name || "").trim();
  if (!code || !name) return res.status(400).json({ error: "Código e nome são obrigatórios." });
  const now = nowStamp();
  try {
    const result = db
      .prepare(
        "INSERT INTO parts (code,name,category,unit,location,quantity,minimum_stock,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)"
      )
      .run(
        code,
        name,
        String(b.category || "").trim() || "Geral",
        String(b.unit || "").trim() || "UN",
        String(b.location || "").trim(),
        Number(b.quantity) || 0,
        Number(b.minimumStock) || 0,
        String(b.notes || "").trim(),
        now,
        now
      );
    const initialQty = Number(b.quantity) || 0;
    if (initialQty > 0) {
      db.prepare(
        "INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at) VALUES (?,NULL,'ENTRADA',?,0,?,'Estoque inicial',?,'Cadastro da peça',?,?)"
      ).run(result.lastInsertRowid, initialQty, initialQty, req.user.name, req.user.id, now);
    }
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Código já existe ou os dados são inválidos." });
  }
});

router.patch("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const part = db.prepare("SELECT * FROM parts WHERE id = ?").get(id);
  if (!part) return res.status(404).json({ error: "Peça não encontrada." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  const map = {
    name: "name",
    category: "category",
    unit: "unit",
    location: "location",
    notes: "notes",
  };
  for (const [key, column] of Object.entries(map)) {
    if (typeof b[key] === "string") {
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }
  if (b.minimumStock !== undefined) {
    fields.push("minimum_stock = ?");
    values.push(Number(b.minimumStock) || 0);
  }
  if (typeof b.active === "boolean") {
    fields.push("active = ?");
    values.push(b.active ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  fields.push("updated_at = ?");
  values.push(nowStamp());
  values.push(id);
  db.prepare(`UPDATE parts SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

module.exports = router;
