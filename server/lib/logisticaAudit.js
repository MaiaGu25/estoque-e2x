const { db } = require("../db");
const { nowStamp } = require("../util");

// Registra uma alteração relevante do módulo Logística (produtos, mapa,
// movimentações). Nunca lança erro - auditoria não pode derrubar a
// operação principal por um problema de serialização, por exemplo.
function registrarAuditoria({ action, entityType, entityId, user, previousData, newData }) {
  try {
    db.prepare(
      `INSERT INTO logistics_audit_log (action,entity_type,entity_id,user_id,user_name,previous_data,new_data,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      action,
      entityType,
      entityId ?? null,
      user?.id ?? null,
      user?.name ?? "Sistema",
      previousData ? JSON.stringify(previousData) : "",
      newData ? JSON.stringify(newData) : "",
      nowStamp()
    );
  } catch (error) {
    console.error("Falha ao registrar auditoria da Logística:", error);
  }
}

module.exports = { registrarAuditoria };
