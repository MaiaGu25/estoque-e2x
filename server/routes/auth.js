const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { db } = require("../db");
const { issueSession, clearSession, requireAuth, publicUserFields } = require("../auth");

const router = express.Router();

// Hash de um valor fixo, só pra gastar o mesmo tempo de bcrypt mesmo
// quando o usuário nem existe - sem isso, um login com usuário inexistente
// responde quase na hora enquanto um com usuário real (senha errada) demora
// o tempo do bcrypt, e essa diferença de tempo dá pra usar pra descobrir
// quais nomes de usuário existem no sistema.
const HASH_FICTICIO = bcrypt.hashSync("valor-fixo-so-para-igualar-tempo-de-resposta", 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
});

router.post("/login", loginLimiter, (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Informe usuário e senha." });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  const senhaConfere = bcrypt.compareSync(password, user ? user.password_hash : HASH_FICTICIO);
  if (!user || !user.active || !senhaConfere) {
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
  if (next.length < 8) {
    return res.status(400).json({ error: "A nova senha precisa ter pelo menos 8 caracteres." });
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
