// Único ponto de acesso ao Estoque geral (tabela `parts`) usado pelo
// módulo Marketplace - nenhuma outra parte do módulo consulta `parts`
// direto. Reaproveita o mesmo núcleo de reserva (CAS otimista em
// reserved_quantity/quantity) já usado pela rota /api/reservados, então
// o histórico de reservas do Estoque geral continua sendo um só,
// independente de ter vindo do módulo Estoque ou do Marketplace.
//
// Isolar tudo aqui atrás dessa interface é o que permite, no futuro,
// trocar a fonte do saldo (ex.: unificar com outro catálogo) sem precisar
// mexer no resto do módulo Marketplace.
const { db } = require("../../db");
const { reservaCore, saldoDisponivel, buscarParteAtiva } = require("../reservas");

function buscarPartePorCodigo(code) {
  const codigo = String(code || "").trim();
  if (!codigo) return null;
  return db.prepare("SELECT * FROM parts WHERE code = ? AND active = 1").get(codigo) || null;
}

function buscarPartePorId(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM parts WHERE id = ?").get(id) || null;
}

// Reserva um conjunto de itens {partId, quantity} dentro da transação
// CHAMADORA (não abre transação própria) - use dentro de outra função já
// embrulhada em transaction(). Lança erro se qualquer item não tiver
// saldo disponível suficiente (nenhuma reserva parcial é aplicada nesse
// caso, já que reservaCore roda tudo dentro da mesma transação e um erro
// no meio desfaz o restante).
function reservarItens(items, { reason, responsible, notes }, user) {
  return reservaCore({ type: "RESERVAR", reason, notes, items }, { name: responsible || user.name, id: user.id });
}

function liberarItens(items, { reason, responsible, notes }, user) {
  return reservaCore({ type: "LIBERAR", reason, notes, items }, { name: responsible || user.name, id: user.id });
}

function baixarItens(items, { reason, responsible, notes }, user) {
  return reservaCore({ type: "BAIXA", reason, notes, items }, { name: responsible || user.name, id: user.id });
}

module.exports = {
  buscarPartePorCodigo,
  buscarPartePorId,
  buscarParteAtiva,
  saldoDisponivel,
  reservarItens,
  liberarItens,
  baixarItens,
};
