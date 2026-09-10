const { db, nowStamp } = require("./db");

// Mesmo espírito do server/lib/logisticaAudit.js, mas gravando no banco
// isolado da Central de Fotos. Nunca lança erro - auditoria não pode
// derrubar a operação principal por um problema de serialização.
function registrarAuditoria({ acao, entidade, entidadeId, produtoId, sku, user, dadosAnteriores, dadosNovos, resultado }) {
  try {
    db.prepare(
      `INSERT INTO cf_auditoria (acao,entidade,entidade_id,produto_id,sku,usuario_id,usuario_nome,dados_anteriores,dados_novos,resultado,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      acao,
      entidade,
      entidadeId ?? null,
      produtoId ?? null,
      sku || "",
      user?.id ?? null,
      user?.name ?? "Sistema",
      dadosAnteriores ? JSON.stringify(dadosAnteriores) : "",
      dadosNovos ? JSON.stringify(dadosNovos) : "",
      resultado || "sucesso",
      nowStamp()
    );
  } catch (error) {
    console.error("Falha ao registrar auditoria da Central de Fotos:", error);
  }
}

module.exports = { registrarAuditoria };
