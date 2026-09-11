const { db } = require("../db");
const { nowStamp } = require("../util");

// Núcleo sem transação própria (usado tanto pela rota /api/reservados,
// embrulhada em transaction() abaixo, quanto por qualquer outro módulo -
// como o Marketplace - que precise reservar/liberar/dar baixa dentro da
// PRÓPRIA transação maior, já que node:sqlite não suporta BEGIN aninhado).
// Mesma trava otimista (compare-and-swap em reserved_quantity/quantity) já
// usada em toda reserva do Estoque geral.
function reservaCore(b, user) {
  const now = nowStamp();
  const resultados = [];

  for (const item of b.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");

    const part = db
      .prepare("SELECT id, quantity, reserved_quantity FROM parts WHERE id = ? AND active = 1")
      .get(Number(item.partId));
    if (!part) throw new Error("Peça não encontrada.");

    if (b.type === "RESERVAR") {
      const nextReserved = part.reserved_quantity + qty;
      if (nextReserved > part.quantity) throw new Error("Saldo insuficiente para reservar essa quantidade.");

      const changed = db
        .prepare("UPDATE parts SET reserved_quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ?")
        .run(nextReserved, now, part.id, part.reserved_quantity);
      if (!changed.changes) throw new Error("A reserva mudou durante a operação. Tente novamente.");

      const inserted = db
        .prepare(
          `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
           VALUES (?,'RESERVAR',?,?,?,?,?,?,?,?)`
        )
        .run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes || "", user.id, now);
      resultados.push({ partId: part.id, quantity: qty, type: "RESERVAR", movementId: inserted.lastInsertRowid });
    } else if (b.type === "LIBERAR") {
      const nextReserved = part.reserved_quantity - qty;
      if (nextReserved < 0) throw new Error("Não há reserva suficiente para liberar essa quantidade.");

      const changed = db
        .prepare("UPDATE parts SET reserved_quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ?")
        .run(nextReserved, now, part.id, part.reserved_quantity);
      if (!changed.changes) throw new Error("A reserva mudou durante a operação. Tente novamente.");

      const inserted = db
        .prepare(
          `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
           VALUES (?,'LIBERAR',?,?,?,?,?,?,?,?)`
        )
        .run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes || "", user.id, now);
      resultados.push({ partId: part.id, quantity: qty, type: "LIBERAR", movementId: inserted.lastInsertRowid });
    } else if (b.type === "BAIXA") {
      const nextReserved = part.reserved_quantity - qty;
      if (nextReserved < 0) throw new Error("Não há reserva suficiente para dar baixa nessa quantidade.");
      const nextQuantity = part.quantity - qty;
      if (nextQuantity < 0) throw new Error("Saldo insuficiente para dar baixa nessa quantidade.");

      const changed = db
        .prepare(
          "UPDATE parts SET reserved_quantity = ?, quantity = ?, updated_at = ? WHERE id = ? AND reserved_quantity = ? AND quantity = ?"
        )
        .run(nextReserved, nextQuantity, now, part.id, part.reserved_quantity, part.quantity);
      if (!changed.changes) throw new Error("O saldo mudou durante a operação. Tente novamente.");

      const inserted = db
        .prepare(
          `INSERT INTO reserved_movements (part_id,type,quantity,previous_reserved,new_reserved,reason,responsible,notes,created_by,created_at)
           VALUES (?,'BAIXA',?,?,?,?,?,?,?,?)`
        )
        .run(part.id, qty, part.reserved_quantity, nextReserved, b.reason, user.name, b.notes || "", user.id, now);

      // Reason fixo ("Reservados") para agrupar certinho nos Relatórios por
      // motivo, junto com RMA e as outras saídas; o motivo digitado pela
      // pessoa vai para a observação, sem se perder.
      const notaBaixa = [b.reason, b.notes].filter(Boolean).join(" · ");
      db.prepare(
        `INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at)
         VALUES (?,NULL,'SAIDA',?,?,?,'Reservados',?,?,?,?)`
      ).run(part.id, qty, part.quantity, nextQuantity, user.name, notaBaixa, user.id, now);
      resultados.push({ partId: part.id, quantity: qty, type: "BAIXA", movementId: inserted.lastInsertRowid });
    } else {
      throw new Error("Tipo inválido.");
    }
  }

  return resultados;
}

function buscarParteAtiva(partId) {
  const part = db.prepare("SELECT * FROM parts WHERE id = ? AND active = 1").get(partId);
  if (!part) throw new Error("Peça não encontrada ou inativa.");
  return part;
}

function saldoDisponivel(partId) {
  const part = db.prepare("SELECT quantity, reserved_quantity FROM parts WHERE id = ?").get(partId);
  if (!part) return 0;
  return part.quantity - part.reserved_quantity;
}

module.exports = { reservaCore, buscarParteAtiva, saldoDisponivel };
