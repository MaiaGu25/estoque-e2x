const { db } = require("../../db");
const { nowStamp } = require("../../util");
const { obterProvider } = require("./providers");
const { registrarAuditoria } = require("./audit");
const { criarAlerta } = require("./alerts");
const { registrarEventoSync, buscarConta, criarOuAtualizarPedidoTx } = require("./orders");

const LIMITE_TENTATIVAS = 8;
const BASE_ATRASO_MS = 5 * 60 * 1000; // 5 minutos
const ATRASO_MAXIMO_MS = 6 * 60 * 60 * 1000; // 6 horas

function calcularProximaTentativa(tentativas) {
  const atraso = Math.min(ATRASO_MAXIMO_MS, BASE_ATRASO_MS * 2 ** tentativas);
  return new Date(Date.now() + atraso).toISOString().slice(0, 19).replace("T", " ");
}

// Registra (ou atualiza, se já houver uma pendente igual) uma falha na
// fila de retry. Nunca tenta de novo indefinidamente: depois do limite
// de tentativas vira 'falha_permanente' e só volta com ação manual.
function registrarFalha({ accountId, marketplace, tipoEvento, idExterno, erroResumo }) {
  const now = nowStamp();
  const existente = db
    .prepare(
      `SELECT * FROM marketplace_sync_failures
       WHERE account_id IS ? AND tipo_evento = ? AND id_externo = ? AND status = 'pendente'`
    )
    .get(accountId ?? null, tipoEvento, idExterno || "");

  if (existente) {
    const tentativas = existente.tentativas + 1;
    const status = tentativas >= LIMITE_TENTATIVAS ? "falha_permanente" : "pendente";
    db.prepare(
      "UPDATE marketplace_sync_failures SET tentativas = ?, proxima_tentativa = ?, erro_resumo = ?, status = ?, ultima_tentativa_em = ?, updated_at = ? WHERE id = ?"
    ).run(tentativas, status === "pendente" ? calcularProximaTentativa(tentativas) : null, erroResumo, status, now, now, existente.id);
    if (status === "falha_permanente") {
      criarAlerta({
        tipo: "falha_permanente",
        severidade: "critico",
        accountId,
        titulo: `Falha permanente em ${tipoEvento} (${marketplace})`,
        descricao: `Depois de ${tentativas} tentativas: ${erroResumo}`,
      });
    }
    return existente.id;
  }

  const result = db
    .prepare(
      `INSERT INTO marketplace_sync_failures (account_id,marketplace,tipo_evento,id_externo,tentativas,proxima_tentativa,erro_resumo,status,primeira_falha_em,ultima_tentativa_em,created_at,updated_at)
       VALUES (?,?,?,?,1,?,?,'pendente',?,?,?,?)`
    )
    .run(accountId ?? null, marketplace, tipoEvento, idExterno || "", calcularProximaTentativa(1), erroResumo, now, now, now, now);
  return result.lastInsertRowid;
}

function resolverFalha(failureId) {
  db.prepare("UPDATE marketplace_sync_failures SET status = 'resolvida', updated_at = ? WHERE id = ?").run(nowStamp(), failureId);
}

// A chamada ao provider é assíncrona (rede) - não pode ficar dentro de
// uma transaction() do node:sqlite (que é síncrona). Por isso o padrão
// aqui é: buscar/validar a conta, chamar a rede fora de qualquer
// transação, e só depois persistir o resultado com updates diretos
// (sem múltiplas tabelas dependentes entre si, então não precisa de
// atomicidade de transação aqui).
async function testarConexao(accountId, user) {
  const account = buscarConta(accountId);
  const provider = obterProvider(account.marketplace);
  const now = nowStamp();
  try {
    const resultado = await provider.testarConexao(account);
    const statusConexao = resultado.ok ? "conectada" : "desconectada";
    db.prepare("UPDATE marketplace_accounts SET status_conexao = ?, ultimo_erro = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      statusConexao,
      resultado.ok ? "" : resultado.mensagem,
      user.id,
      now,
      accountId
    );
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "teste_conexao", resultado: resultado.ok ? "sucesso" : "falha", detalhe: resultado.mensagem });
    registrarAuditoria({ action: "loja.testar_conexao", entityType: "marketplace_accounts", entityId: accountId, user, newData: resultado, resultado: resultado.ok ? "sucesso" : "falha" });
    return resultado;
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    db.prepare("UPDATE marketplace_accounts SET status_conexao = 'erro', ultimo_erro = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      mensagem,
      user.id,
      now,
      accountId
    );
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "teste_conexao", resultado: "falha", detalhe: mensagem });
    return { ok: false, mensagem };
  }
}

async function sincronizarAgora(accountId, user) {
  const account = buscarConta(accountId);
  const provider = obterProvider(account.marketplace);
  const now = nowStamp();
  try {
    const pedidos = await provider.listarPedidosRecentes(account, account.ultima_sincronizacao);
    let importados = 0;
    for (const pedidoNormalizado of pedidos) {
      criarOuAtualizarPedidoTx({ ...pedidoNormalizado, accountId, origem: "automatica" }, user);
      importados++;
    }
    db.prepare("UPDATE marketplace_accounts SET ultima_sincronizacao = ?, ultima_reconciliacao = ?, ultimo_erro = '', updated_at = ? WHERE id = ?").run(
      now,
      now,
      now,
      accountId
    );
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "reconciliacao", resultado: "sucesso", detalhe: `${importados} pedido(s) sincronizado(s).` });
    registrarAuditoria({ action: "loja.sincronizar_agora", entityType: "marketplace_accounts", entityId: accountId, user, newData: { importados } });
    return { ok: true, importados };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    db.prepare("UPDATE marketplace_accounts SET ultimo_erro = ?, updated_at = ? WHERE id = ?").run(mensagem, now, accountId);
    registrarFalha({ accountId, marketplace: account.marketplace, tipoEvento: "reconciliacao", idExterno: "", erroResumo: mensagem });
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "reconciliacao", resultado: "falha", detalhe: mensagem });
    criarAlerta({
      tipo: "sincronizacao_atrasada",
      severidade: "atencao",
      accountId,
      titulo: `Não foi possível sincronizar a loja ${account.nome_interno}`,
      descricao: mensagem,
    });
    return { ok: false, mensagem };
  }
}

async function buscarPedidoNaApi(accountId, idExterno, user) {
  const account = buscarConta(accountId);
  const provider = obterProvider(account.marketplace);
  try {
    const pedidoNormalizado = await provider.buscarPedido(account, idExterno);
    const resultado = criarOuAtualizarPedidoTx({ ...pedidoNormalizado, accountId, origem: "automatica" }, user);
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "busca_manual", idExterno, resultado: "sucesso" });
    registrarAuditoria({ action: "pedido.buscar_na_api", entityType: "marketplace_orders", entityId: resultado?.id ?? null, user, newData: { idExterno } });
    return { ok: true, resultado };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    registrarFalha({ accountId, marketplace: account.marketplace, tipoEvento: "busca_manual", idExterno, erroResumo: mensagem });
    registrarEventoSync({ accountId, marketplace: account.marketplace, tipo: "busca_manual", idExterno, resultado: "falha", detalhe: mensagem });
    return { ok: false, mensagem };
  }
}

async function reprocessarFalha(failureId, user) {
  const falha = db.prepare("SELECT * FROM marketplace_sync_failures WHERE id = ?").get(failureId);
  if (!falha) throw new Error("Falha não encontrada na fila.");
  if (falha.status !== "pendente") throw new Error("Essa falha não está mais pendente.");

  registrarAuditoria({ action: "falha.reprocessar", entityType: "marketplace_sync_failures", entityId: failureId, user });

  if (falha.tipo_evento === "busca_manual" && falha.id_externo) {
    const resultado = await buscarPedidoNaApi(falha.account_id, falha.id_externo, user);
    if (resultado.ok) resolverFalha(failureId);
    return resultado;
  }
  if (falha.tipo_evento === "reconciliacao") {
    const resultado = await sincronizarAgora(falha.account_id, user);
    if (resultado.ok) resolverFalha(failureId);
    return resultado;
  }
  throw new Error("Tipo de evento não sabe ser reprocessado automaticamente ainda.");
}

module.exports = {
  LIMITE_TENTATIVAS,
  registrarFalha,
  resolverFalha,
  testarConexao,
  sincronizarAgora,
  buscarPedidoNaApi,
  reprocessarFalha,
};
