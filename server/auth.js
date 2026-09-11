const crypto = require("crypto");
const { db, getOrCreateSessionSecret } = require("./db");

const COOKIE_NAME = "estoque_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const SECRET = getOrCreateSessionSecret();
// Em rede local (HTTP simples) o cookie precisa funcionar sem HTTPS. Quando
// o sistema for colocado online atrás de HTTPS, define COOKIE_SECURE=1 no
// ambiente para o navegador só enviar esse cookie em conexões seguras.
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

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
    sameSite: "strict",
    secure: COOKIE_SECURE,
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

function userFromToken(token) {
  const session = verify(token);
  if (!session) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.uid);
  if (!user || !user.active || user.session_version !== session.v) return null;
  return user;
}

// Extrai um cookie de um cabeçalho "Cookie" bruto - usado no handshake do
// WebSocket, que não passa pelo cookie-parser do Express.
function parseCookieHeader(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function requireAuth(req, res, next) {
  const user = userFromToken(req.cookies?.[COOKIE_NAME]);
  if (!user) {
    clearSession(res);
    return res.status(401).json({ error: "Faça login para continuar." });
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
  userFromToken,
  parseCookieHeader,
};
