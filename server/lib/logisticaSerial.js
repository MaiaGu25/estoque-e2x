const { db } = require("../db");
const { nowStamp, coluna: validarColuna } = require("../util");

// Mesmo critério usado em qualquer outro identificador digitado no sistema:
// maiúsculo e sem espaço nas pontas, para "ABC123 " e "abc123" serem
// tratados como o mesmo serial. A coluna valor_normalizado tem índice
// único no banco - a duplicidade nunca depende só desta função.
function normalizarSerial(valor) {
  return String(valor || "").trim().toUpperCase();
}

// Devolve o registro completo do serial (produto, posição atual, pedidos
// relacionados) para montar as 3 respostas que a conferência/separação
// precisam mostrar ao escanear: não encontrado, já cadastrado (mesmo
// produto) ou já pertence a outro produto.
function buscarSerialDetalhado(valor) {
  const normalizado = normalizarSerial(valor);
  if (!normalizado) return null;
  const serial = db
    .prepare(
      `SELECT s.*, p.code AS product_code, p.name AS product_name,
              pos.code AS position_code, pos.name AS position_name
       FROM logistics_serials s
       JOIN logistics_products p ON p.id = s.product_id
       LEFT JOIN logistics_positions pos ON pos.id = s.position_id
       WHERE s.valor_normalizado = ?`
    )
    .get(normalizado);
  if (!serial) return null;

  const historico = db
    .prepare(
      `SELECT id, action, previous_data, new_data, created_at, user_name
       FROM logistics_audit_log
       WHERE entity_type = 'logistics_serials' AND entity_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 20`
    )
    .all(serial.id);

  return { serial, historico };
}

function serialExiste(valorNormalizado) {
  return !!db.prepare("SELECT id FROM logistics_serials WHERE valor_normalizado = ?").get(valorNormalizado);
}

// Cria o registro de serial só no momento em que ele é de fato confirmado
// (nunca antes de uma consulta) - evita "reservar" um valor que o usuário
// só está espiando.
function criarSerial({ valor, productId, status, positionId, pedidoEntradaId, pedidoSaidaId, user, now }) {
  const normalizado = normalizarSerial(valor);
  if (!normalizado) throw new Error("Informe o número de série.");
  if (serialExiste(normalizado)) throw new Error("Esse serial já está cadastrado no sistema.");
  const stamp = now || nowStamp();
  const result = db
    .prepare(
      `INSERT INTO logistics_serials (valor,valor_normalizado,product_id,status,position_id,pedido_entrada_id,pedido_saida_id,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      String(valor || "").trim(),
      normalizado,
      productId,
      status,
      positionId ?? null,
      pedidoEntradaId ?? null,
      pedidoSaidaId ?? null,
      user?.id ?? null,
      stamp,
      user?.id ?? null,
      stamp
    );
  return result.lastInsertRowid;
}

function atualizarSerial(id, campos, now) {
  const fields = [];
  const values = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    fields.push(`${validarColuna(coluna)} = ?`);
    values.push(valor);
  }
  fields.push("updated_at = ?");
  values.push(now || nowStamp());
  values.push(id);
  db.prepare(`UPDATE logistics_serials SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

module.exports = { normalizarSerial, buscarSerialDetalhado, serialExiste, criarSerial, atualizarSerial };
