const express = require("express");
const { db } = require("../../db");
const { nowStamp } = require("../../util");
const { broadcast } = require("../../realtime");
const { registrarAuditoria } = require("../../lib/marketplace/audit");

const router = express.Router();

router.get("/", (req, res) => {
  const { accountId, marketplace, busca, vinculacao } = req.query;
  const where = [];
  const params = [];
  if (accountId) {
    where.push("l.account_id = ?");
    params.push(Number(accountId));
  }
  if (marketplace) {
    where.push("l.marketplace = ?");
    params.push(String(marketplace));
  }
  if (busca) {
    const like = `%${busca}%`;
    where.push("(l.titulo LIKE ? OR l.sku_recebido LIKE ? OR l.id_anuncio LIKE ?)");
    params.push(like, like, like);
  }

  const listagens = db
    .prepare(
      `SELECT l.*, a.nome_interno AS conta_nome, m.part_id, m.status AS status_mapeamento,
              p.code AS part_code, p.name AS part_name
       FROM marketplace_listings l
       JOIN marketplace_accounts a ON a.id = l.account_id
       LEFT JOIN marketplace_listing_mappings m ON m.listing_id = l.id
       LEFT JOIN parts p ON p.id = m.part_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY l.updated_at DESC LIMIT 500`
    )
    .all(...params);

  const comStatus = listagens.map((l) => ({
    ...l,
    status_vinculacao: l.part_id ? l.status_mapeamento : "nao_vinculado",
  }));
  const filtrados = vinculacao ? comStatus.filter((l) => l.status_vinculacao === vinculacao) : comStatus;

  res.json({ anuncios: filtrados });
});

router.post("/:id/vincular", (req, res) => {
  const listingId = Number(req.params.id);
  const partId = Number((req.body || {}).partId);
  const listing = db.prepare("SELECT * FROM marketplace_listings WHERE id = ?").get(listingId);
  if (!listing) return res.status(404).json({ error: "Anúncio não encontrado." });
  const parte = db.prepare("SELECT id FROM parts WHERE id = ? AND active = 1").get(partId);
  if (!parte) return res.status(400).json({ error: "Peça não encontrada ou inativa no Estoque geral." });

  const now = nowStamp();
  db.prepare(
    `INSERT INTO marketplace_listing_mappings (listing_id,part_id,status,created_by,created_at,updated_by,updated_at)
     VALUES (?,?,'vinculado',?,?,?,?)
     ON CONFLICT(listing_id) DO UPDATE SET part_id = excluded.part_id, status = 'vinculado', updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).run(listingId, partId, req.user.id, now, req.user.id, now);

  registrarAuditoria({ action: "anuncio.vincular", entityType: "marketplace_listings", entityId: listingId, user: req.user, newData: { partId } });
  broadcast("marketplace");
  res.json({ ok: true });
});

router.patch("/:id/divergente", (req, res) => {
  const listingId = Number(req.params.id);
  const mapeamento = db.prepare("SELECT * FROM marketplace_listing_mappings WHERE listing_id = ?").get(listingId);
  if (!mapeamento) return res.status(404).json({ error: "Esse anúncio ainda não tem vínculo para marcar como divergente." });
  db.prepare("UPDATE marketplace_listing_mappings SET status = 'divergente', updated_by = ?, updated_at = ? WHERE listing_id = ?").run(
    req.user.id,
    nowStamp(),
    listingId
  );
  registrarAuditoria({ action: "anuncio.marcar_divergente", entityType: "marketplace_listings", entityId: listingId, user: req.user });
  broadcast("marketplace");
  res.json({ ok: true });
});

module.exports = router;
