const { db } = require("../../db");
const { nowStamp } = require("../../util");

// Histórico/auditoria do protocolo: gerado só pelo backend (nunca confia
// em "quem fez" vindo do frontend - sempre usa req.user da sessão),
// granular por campo (mostra pelo menos usuário, ação, campo alterado,
// valor anterior e novo) e imutável - não existe UPDATE nem DELETE para
// esta tabela em nenhuma rota. Nunca lança erro: uma falha ao registrar
// histórico não pode derrubar a operação principal do protocolo.
function registrar({ protocoloId, acao, campo, valorAnterior, valorNovo, user }) {
  try {
    db.prepare(
      `INSERT INTO rma_historico (protocolo_id,acao,campo,valor_anterior,valor_novo,user_id,user_name,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      protocoloId,
      acao,
      campo ?? null,
      valorAnterior === undefined || valorAnterior === null ? null : String(valorAnterior),
      valorNovo === undefined || valorNovo === null ? null : String(valorNovo),
      user?.id ?? null,
      user?.name ?? "Sistema",
      nowStamp()
    );
  } catch (error) {
    console.error("Falha ao registrar histórico do RMA/SAC:", error);
  }
}

// Compara dois objetos "campo -> valor" e registra uma entrada de
// histórico para cada campo que realmente mudou - usado ao salvar cada
// etapa do wizard, para o histórico mostrar exatamente o que mudou em vez
// de um diff genérico em JSON.
function registrarDiferencas({ protocoloId, acao, anterior, novo, user }) {
  for (const campo of Object.keys(novo)) {
    const valorAnterior = anterior ? anterior[campo] : undefined;
    const valorNovo = novo[campo];
    if (String(valorAnterior ?? "") === String(valorNovo ?? "")) continue;
    registrar({ protocoloId, acao, campo, valorAnterior, valorNovo, user });
  }
}

function listarPorProtocolo(protocoloId) {
  return db
    .prepare("SELECT * FROM rma_historico WHERE protocolo_id = ? ORDER BY created_at DESC, id DESC")
    .all(protocoloId);
}

module.exports = { registrar, registrarDiferencas, listarPorProtocolo };
