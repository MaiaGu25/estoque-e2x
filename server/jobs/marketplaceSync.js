const { db } = require("../db");
const { reprocessarFalha, sincronizarAgora } = require("../lib/marketplace/sync");
const { excluirCapturasExpiradas } = require("../lib/marketplace/capture/service");

// Não existe nenhum agendador de tarefas no projeto hoje (o único
// setInterval do backend é o heartbeat do WebSocket) - este é o
// primeiro job periódico de negócio do sistema, então optei pelo
// mecanismo mais simples possível (setInterval simples, sem dependência
// nova) em vez de introduzir uma lib de cron só para isto.
//
// Garante que mesmo sem nenhum webhook chegar, os pedidos das lojas
// conectadas continuam sendo buscados periodicamente (reconciliação) e
// que a fila de falhas é reprocessada sozinha, com atraso progressivo,
// sem nunca tentar para sempre.
const SISTEMA = { id: null, name: "Sincronização automática" };

let intervalo = null;

async function processarFilaDeFalhas() {
  const agora = new Date().toISOString().slice(0, 19).replace("T", " ");
  const pendentes = db
    .prepare("SELECT id FROM marketplace_sync_failures WHERE status = 'pendente' AND (proxima_tentativa IS NULL OR proxima_tentativa <= ?)")
    .all(agora);
  for (const { id } of pendentes) {
    try {
      await reprocessarFalha(id, SISTEMA);
    } catch (error) {
      console.error(`[marketplace] falha ao reprocessar evento #${id}:`, error instanceof Error ? error.message : error);
    }
  }
}

async function reconciliarContasConectadas() {
  const contas = db.prepare("SELECT id FROM marketplace_accounts WHERE ativa = 1 AND status_conexao = 'conectada'").all();
  for (const { id } of contas) {
    try {
      await sincronizarAgora(id, SISTEMA);
    } catch (error) {
      console.error(`[marketplace] falha ao reconciliar loja #${id}:`, error instanceof Error ? error.message : error);
    }
  }
}

async function executarCiclo() {
  await processarFilaDeFalhas();
  await reconciliarContasConectadas();
  try {
    excluirCapturasExpiradas();
  } catch (error) {
    console.error("[marketplace] falha ao limpar capturas expiradas:", error instanceof Error ? error.message : error);
  }
}

function iniciar() {
  if (intervalo) return;
  const ms = Number(process.env.MARKETPLACE_SYNC_INTERVAL_MS) || 5 * 60 * 1000;
  intervalo = setInterval(() => {
    executarCiclo().catch((error) => console.error("[marketplace] erro no ciclo de sincronização:", error));
  }, ms);
  intervalo.unref?.();
  console.log(`[marketplace] sincronização periódica ativa a cada ${Math.round(ms / 1000)}s.`);
}

function parar() {
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
}

module.exports = { iniciar, parar, executarCiclo };
