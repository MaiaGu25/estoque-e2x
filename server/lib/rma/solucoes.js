const { db, transaction } = require("../../db");
const { nowStamp } = require("../../util");
const opcoes = require("./opcoes");
const historico = require("./auditoria");

// Registrar a solução (troca, reparo, envio de peça, reembolso,
// devolução ou reclamação recusada) é só um registro descritivo do
// desfecho do protocolo - em NENHUM caso movimenta, reserva ou desconta
// estoque, mesmo troca/envio de peça/devolução.
function buscar(protocoloId) {
  return db.prepare("SELECT * FROM rma_solucoes WHERE protocolo_id = ?").get(protocoloId);
}

const salvar = transaction(({ protocoloId, dados, user }) => {
  const protocolo = db.prepare("SELECT id FROM rma_protocolos WHERE id = ?").get(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const tipoSolucao = String(dados.tipoSolucao || "").trim();
  if (!tipoSolucao) throw new Error("Selecione o tipo de solução.");
  if (!opcoes.ativaExiste("tipo_solucao", tipoSolucao)) {
    throw new Error(`Tipo de solução inválido: "${tipoSolucao}" não é uma opção ativa.`);
  }

  const existente = buscar(protocoloId);
  const now = nowStamp();
  const valorReembolso = dados.valorReembolso === undefined || dados.valorReembolso === "" ? null : Number(dados.valorReembolso);

  if (existente) {
    db.prepare(
      `UPDATE rma_solucoes SET tipo_solucao=?,descricao=?,valor_reembolso=?,peca_enviada=?,updated_by=?,updated_at=?
       WHERE protocolo_id = ?`
    ).run(tipoSolucao, String(dados.descricao || "").trim(), valorReembolso, String(dados.pecaEnviada || "").trim(), user?.id ?? null, now, protocoloId);
  } else {
    db.prepare(
      `INSERT INTO rma_solucoes (protocolo_id,tipo_solucao,descricao,valor_reembolso,peca_enviada,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(protocoloId, tipoSolucao, String(dados.descricao || "").trim(), valorReembolso, String(dados.pecaEnviada || "").trim(), user?.id ?? null, now, user?.id ?? null, now);
  }

  historico.registrarDiferencas({
    protocoloId,
    acao: "solucao.registrar",
    anterior: existente || {},
    novo: { tipo_solucao: tipoSolucao, descricao: dados.descricao, valor_reembolso: valorReembolso, peca_enviada: dados.pecaEnviada },
    user,
  });

  return buscar(protocoloId);
});

module.exports = { buscar, salvar };
