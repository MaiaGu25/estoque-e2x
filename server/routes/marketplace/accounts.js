const express = require("express");
const { db } = require("../../db");
const { nowStamp } = require("../../util");
const { broadcast } = require("../../realtime");
const { registrarAuditoria } = require("../../lib/marketplace/audit");

const router = express.Router();

router.get("/", (req, res) => {
  const contas = db.prepare("SELECT * FROM marketplace_accounts ORDER BY marketplace, nome_interno COLLATE NOCASE").all();
  res.json({ contas });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const marketplace = b.marketplace === "shopee" ? "shopee" : b.marketplace === "mercado_livre" ? "mercado_livre" : null;
  const nomeInterno = String(b.nomeInterno || "").trim();
  if (!marketplace || !nomeInterno) return res.status(400).json({ error: "Marketplace e nome interno são obrigatórios." });
  const now = nowStamp();
  try {
    const result = db
      .prepare(
        `INSERT INTO marketplace_accounts (marketplace,nome_interno,apelido,identificador_externo,credencial_ref,status_conexao,ativa,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,'nao_configurada',1,?,?,?,?)`
      )
      .run(
        marketplace,
        nomeInterno,
        String(b.apelido || "").trim(),
        String(b.identificadorExterno || "").trim() || null,
        String(b.credencialRef || "").trim(),
        req.user.id,
        now,
        req.user.id,
        now
      );
    registrarAuditoria({ action: "loja.criar", entityType: "marketplace_accounts", entityId: result.lastInsertRowid, user: req.user, newData: { marketplace, nomeInterno } });
    broadcast("marketplace");
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: "Já existe uma loja desse marketplace com esse identificador externo." });
  }
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const conta = db.prepare("SELECT * FROM marketplace_accounts WHERE id = ?").get(id);
  if (!conta) return res.status(404).json({ error: "Loja não encontrada." });
  const b = req.body || {};
  const fields = [];
  const values = [];
  for (const [chave, coluna] of Object.entries({
    apelido: "apelido",
    identificadorExterno: "identificador_externo",
    credencialRef: "credencial_ref",
    nomeInterno: "nome_interno",
  })) {
    if (typeof b[chave] === "string") {
      fields.push(`${coluna} = ?`);
      const valor = b[chave].trim();
      values.push(chave === "identificadorExterno" ? valor || null : valor);
    }
  }
  if (typeof b.ativa === "boolean") {
    fields.push("ativa = ?");
    values.push(b.ativa ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });
  fields.push("updated_by = ?", "updated_at = ?");
  values.push(req.user.id, nowStamp(), id);
  db.prepare(`UPDATE marketplace_accounts SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  registrarAuditoria({ action: "loja.editar", entityType: "marketplace_accounts", entityId: id, user: req.user, previousData: conta, newData: b });
  broadcast("marketplace");
  res.json({ ok: true });
});

module.exports = router;
