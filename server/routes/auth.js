const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { issueSession, clearSession, requireAuth, publicUserFields } = require("../auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuário e senha." });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Usuário ou senha inválidos." });
  }
  issueSession(res, user);
  res.json({ ok: true, user: publicUserFields(user) });
});

router.post("/logout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUserFields(req.user) });
});

router.post("/change-password", requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword || "");
  const next = String(req.body?.newPassword || "");
  if (next.length < 6) {
    return res.status(400).json({ error: "A nova senha precisa ter pelo menos 6 caracteres." });
  }
  if (!bcrypt.compareSync(current, req.user.password_hash)) {
    return res.status(400).json({ error: "Senha atual incorreta." });
  }
  const hash = bcrypt.hashSync(next, 10);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, session_version = session_version + 1 WHERE id = ?"
  ).run(hash, req.user.id);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  issueSession(res, updated);
  res.json({ ok: true, user: publicUserFields(updated) });
});

module.exports = router;
