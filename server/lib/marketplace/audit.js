const { db } = require("../../db");
const { nowStamp } = require("../../util");

// Mesmo padrão de server/lib/logisticaAudit.js: nunca lança erro -
// auditoria não pode derrubar a operação principal.
function registrarAuditoria({ action, entityType, entityId, user, previousData, newData, resultado }) {
  try {
    db.prepare(
      `INSERT INTO marketplace_audit_logs (action,entity_type,entity_id,user_id,user_name,previous_data,new_data,resultado,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      action,
      entityType,
      entityId ?? null,
      user?.id ?? null,
      user?.name ?? "Sistema",
      previousData ? JSON.stringify(previousData) : "",
      newData ? JSON.stringify(newData) : "",
      resultado || "sucesso",
      nowStamp()
    );
  } catch (error) {
    console.error("Falha ao registrar auditoria do Marketplace:", error);
  }
}

module.exports = { registrarAuditoria };
