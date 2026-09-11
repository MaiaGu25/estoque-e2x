const { db } = require("../../db");
const { nowStamp } = require("../../util");

const TIPOS_ALERTA = [
  "api_desconectada",
  "token_expirado",
  "webhook_parado",
  "sincronizacao_atrasada",
  "pedido_nao_importado",
  "pedido_duplicado",
  "estoque_insuficiente",
  "sku_nao_vinculado",
  "divergencia_quantidade",
  "pedido_atrasado",
  "cancelamento_apos_separacao",
  "falha_permanente",
];

function criarAlerta({ tipo, severidade, accountId, orderId, titulo, descricao }) {
  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO marketplace_alerts (tipo,severidade,account_id,order_id,titulo,descricao,status,created_at)
       VALUES (?,?,?,?,?,?,'aberto',?)`
    )
    .run(tipo, severidade || "atencao", accountId ?? null, orderId ?? null, titulo, descricao || "", now);
  return result.lastInsertRowid;
}

function marcarAlertaVisto(id) {
  db.prepare("UPDATE marketplace_alerts SET status = 'visto' WHERE id = ? AND status = 'aberto'").run(id);
}

function resolverAlerta(id, user) {
  const now = nowStamp();
  db.prepare("UPDATE marketplace_alerts SET status = 'resolvido', resolvido_por = ?, resolvido_em = ? WHERE id = ?").run(user.id, now, id);
}

module.exports = { TIPOS_ALERTA, criarAlerta, marcarAlertaVisto, resolverAlerta };
