const crypto = require("crypto");
const { db, getOrCreateSessionSecret } = require("./db");

const COOKIE_NAME = "estoque_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const SECRET = getOrCreateSessionSecret();

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function issueSession(res, user) {
  const token = sign({ uid: user.id, v: user.session_version });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE_MS,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

const publicUserFields = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  active: !!u.active,
  mustChangePassword: !!u.must_change_password,
});

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const session = verify(token);
  if (!session) return res.status(401).json({ error: "Faça login para continuar." });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.uid);
  if (!user || !user.active || user.session_version !== session.v) {
    clearSession(res);
    return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem fazer isso." });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  issueSession,
  clearSession,
  requireAuth,
  requireAdmin,
  publicUserFields,
};
