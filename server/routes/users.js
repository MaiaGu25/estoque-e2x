const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { requireAuth, requireAdmin, publicUserFields } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE").all();
  res.json({ users: users.map(publicUserFields) });
});

router.post("/", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  const role = req.body?.role === "admin" ? "admin" : "operador";
  if (!username || !name || password.length < 6) {
    return res.status(400).json({ error: "Preencha usuário, nome e uma senha com pelo menos 6 caracteres." });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        "INSERT INTO users (username, name, password_hash, role, active, must_change_password, created_at) VALUES (?,?,?,?,1,1,?)"
      )
      .run(username, name, hash, role, nowStamp());
    const created = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.json({ ok: true, user: publicUserFields(created) });
  } catch (error) {
    res.status(400).json({ error: "Já existe um usuário com esse nome de login." });
  }
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });

  const fields = [];
  const values = [];

  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    fields.push("name = ?");
    values.push(req.body.name.trim());
  }
  if (req.body?.role === "admin" || req.body?.role === "operador") {
    fields.push("role = ?");
    values.push(req.body.role);
  }
  if (typeof req.body?.active === "boolean") {
    if (target.id === req.user.id && !req.body.active) {
      return res.status(400).json({ error: "Você não pode desativar seu próprio usuário." });
    }
    fields.push("active = ?");
    values.push(req.body.active ? 1 : 0);
    fields.push("session_version = session_version + 1");
  }
  if (typeof req.body?.newPassword === "string" && req.body.newPassword) {
    if (req.body.newPassword.length < 6) {
      return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
    }
    fields.push("password_hash = ?");
    values.push(bcrypt.hashSync(req.body.newPassword, 10));
    fields.push("must_change_password = 1");
    fields.push("session_version = session_version + 1");
  }

  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json({ ok: true, user: publicUserFields(updated) });
});

module.exports = router;
