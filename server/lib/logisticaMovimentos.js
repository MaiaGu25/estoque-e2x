const { db, transaction } = require("../db");
const { nowStamp } = require("../util");

function gerarNumeroOperacao(tipo) {
  const prefixo = { ENTRADA: "ENT", SAIDA: "SAI", TRANSFERENCIA: "TRF", AJUSTE: "AJU" }[tipo] || "LOG";
  const now = nowStamp();
  return `LOG-${prefixo}-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

function saldoTotalProduto(productId) {
  return db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM logistics_position_stock WHERE product_id = ?").get(productId).n;
}

function lerSaldoPosicao(positionId, productId) {
  const row = db
    .prepare("SELECT quantity FROM logistics_position_stock WHERE position_id = ? AND product_id = ?")
    .get(positionId, productId);
  return row ? row.quantity : 0;
}

// Grava o novo saldo de um produto numa posição usando trava otimista
// (compara com o valor que a gente leu por último): se outra operação
// mexeu nesse saldo no meio do caminho, a transação falha e desfaz tudo,
// em vez de sobrescrever silenciosamente com um número desatualizado.
function definirSaldoPosicao(positionId, productId, saldoAnteriorEsperado, novoSaldo, now) {
  if (novoSaldo < 0) throw new Error("O saldo da posição não pode ficar negativo.");
  const existente = db
    .prepare("SELECT id, quantity FROM logistics_position_stock WHERE position_id = ? AND product_id = ?")
    .get(positionId, productId);
  if (!existente) {
    if (saldoAnteriorEsperado !== 0) throw new Error("O saldo da posição mudou durante a operação. Tente novamente.");
    db.prepare("INSERT INTO logistics_position_stock (position_id,product_id,quantity,updated_at) VALUES (?,?,?,?)").run(
      positionId,
      productId,
      novoSaldo,
      now
    );
    return;
  }
  const changed = db
    .prepare("UPDATE logistics_position_stock SET quantity = ?, updated_at = ? WHERE id = ? AND quantity = ?")
    .run(novoSaldo, now, existente.id, saldoAnteriorEsperado);
  if (!changed.changes) throw new Error("O saldo da posição mudou durante a operação. Tente novamente.");
}

function buscarProdutoAtivo(id) {
  const produto = db.prepare("SELECT * FROM logistics_products WHERE id = ? AND active = 1").get(id);
  if (!produto) throw new Error("Produto não encontrado ou inativo.");
  return produto;
}

function buscarPosicaoUtilizavel(id) {
  const posicao = db.prepare("SELECT * FROM logistics_positions WHERE id = ? AND active = 1").get(id);
  if (!posicao) throw new Error("Posição não encontrada ou inativa.");
  if (posicao.blocked) throw new Error("Essa posição está bloqueada para movimentações.");
  return posicao;
}

function validarComum(b) {
  const reason = String(b.reason || "").trim();
  const responsible = String(b.responsible || "").trim();
  if (!reason) throw new Error("Informe o motivo.");
  if (!responsible) throw new Error("Informe o responsável.");
  return { reason, responsible, notes: String(b.notes || "").trim() };
}

const registrarEntradaTx = transaction((b, user) => {
  const { reason, responsible, notes } = validarComum(b);
  const quantity = Number(b.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
  const produto = buscarProdutoAtivo(b.productId);
  const posicao = buscarPosicaoUtilizavel(b.positionId);

  const now = nowStamp();
  const number = gerarNumeroOperacao("ENTRADA");
  const op = db
    .prepare("INSERT INTO logistics_operations (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,'ENTRADA',?,?,?,?,?)")
    .run(number, reason, responsible, notes, user.id, now);

  const totalAntes = saldoTotalProduto(produto.id);
  const saldoAntes = lerSaldoPosicao(posicao.id, produto.id);
  const saldoDepois = saldoAntes + quantity;
  definirSaldoPosicao(posicao.id, produto.id, saldoAntes, saldoDepois, now);

  db.prepare(
    `INSERT INTO logistics_movements (operation_id,product_id,quantity,from_position_id,to_position_id,previous_from_quantity,new_from_quantity,previous_to_quantity,new_to_quantity,previous_total_quantity,new_total_quantity,created_at)
     VALUES (?,?,?,NULL,?,NULL,NULL,?,?,?,?,?)`
  ).run(op.lastInsertRowid, produto.id, quantity, posicao.id, saldoAntes, saldoDepois, totalAntes, totalAntes + quantity, now);

  return number;
});

const registrarSaidaTx = transaction((b, user) => {
  const { reason, responsible, notes } = validarComum(b);
  const quantity = Number(b.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
  const produto = buscarProdutoAtivo(b.productId);
  const posicao = buscarPosicaoUtilizavel(b.positionId);

  const now = nowStamp();
  const number = gerarNumeroOperacao("SAIDA");
  const op = db
    .prepare("INSERT INTO logistics_operations (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,'SAIDA',?,?,?,?,?)")
    .run(number, reason, responsible, notes, user.id, now);

  const totalAntes = saldoTotalProduto(produto.id);
  const saldoAntes = lerSaldoPosicao(posicao.id, produto.id);
  const saldoDepois = saldoAntes - quantity;
  if (saldoDepois < 0) throw new Error("Não há saldo suficiente nessa posição.");
  definirSaldoPosicao(posicao.id, produto.id, saldoAntes, saldoDepois, now);

  db.prepare(
    `INSERT INTO logistics_movements (operation_id,product_id,quantity,from_position_id,to_position_id,previous_from_quantity,new_from_quantity,previous_to_quantity,new_to_quantity,previous_total_quantity,new_total_quantity,created_at)
     VALUES (?,?,?,?,NULL,?,?,NULL,NULL,?,?,?)`
  ).run(op.lastInsertRowid, produto.id, quantity, posicao.id, saldoAntes, saldoDepois, totalAntes, totalAntes - quantity, now);

  return number;
});

const registrarTransferenciaTx = transaction((b, user) => {
  const { reason, responsible, notes } = validarComum(b);
  const quantity = Number(b.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantidade inválida.");
  if (Number(b.fromPositionId) === Number(b.toPositionId)) throw new Error("Origem e destino não podem ser iguais.");
  const produto = buscarProdutoAtivo(b.productId);
  const origem = buscarPosicaoUtilizavel(b.fromPositionId);
  const destino = buscarPosicaoUtilizavel(b.toPositionId);

  const now = nowStamp();
  const number = gerarNumeroOperacao("TRANSFERENCIA");
  const op = db
    .prepare("INSERT INTO logistics_operations (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,'TRANSFERENCIA',?,?,?,?,?)")
    .run(number, reason, responsible, notes, user.id, now);

  const totalAntes = saldoTotalProduto(produto.id);
  const saldoOrigemAntes = lerSaldoPosicao(origem.id, produto.id);
  const saldoOrigemDepois = saldoOrigemAntes - quantity;
  if (saldoOrigemDepois < 0) throw new Error("Não há saldo suficiente na posição de origem.");
  const saldoDestinoAntes = lerSaldoPosicao(destino.id, produto.id);
  const saldoDestinoDepois = saldoDestinoAntes + quantity;

  definirSaldoPosicao(origem.id, produto.id, saldoOrigemAntes, saldoOrigemDepois, now);
  definirSaldoPosicao(destino.id, produto.id, saldoDestinoAntes, saldoDestinoDepois, now);

  db.prepare(
    `INSERT INTO logistics_movements (operation_id,product_id,quantity,from_position_id,to_position_id,previous_from_quantity,new_from_quantity,previous_to_quantity,new_to_quantity,previous_total_quantity,new_total_quantity,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    op.lastInsertRowid,
    produto.id,
    quantity,
    origem.id,
    destino.id,
    saldoOrigemAntes,
    saldoOrigemDepois,
    saldoDestinoAntes,
    saldoDestinoDepois,
    totalAntes,
    totalAntes,
    now
  );

  return number;
});

const registrarAjusteTx = transaction((b, user) => {
  const { reason, responsible, notes } = validarComum(b);
  const quantidadeFisica = Number(b.quantidadeFisica);
  if (!Number.isFinite(quantidadeFisica) || quantidadeFisica < 0) throw new Error("Informe a quantidade física encontrada (0 ou mais).");
  const produto = buscarProdutoAtivo(b.productId);
  const posicao = buscarPosicaoUtilizavel(b.positionId);

  const now = nowStamp();
  const saldoRegistrado = lerSaldoPosicao(posicao.id, produto.id);
  const diferenca = quantidadeFisica - saldoRegistrado;
  if (diferenca === 0) throw new Error("A quantidade informada é igual à registrada. Não há o que ajustar.");

  const number = gerarNumeroOperacao("AJUSTE");
  const op = db
    .prepare("INSERT INTO logistics_operations (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,'AJUSTE',?,?,?,?,?)")
    .run(number, reason, responsible, notes, user.id, now);

  const totalAntes = saldoTotalProduto(produto.id);
  definirSaldoPosicao(posicao.id, produto.id, saldoRegistrado, quantidadeFisica, now);

  db.prepare(
    `INSERT INTO logistics_movements (operation_id,product_id,quantity,from_position_id,to_position_id,previous_from_quantity,new_from_quantity,previous_to_quantity,new_to_quantity,previous_total_quantity,new_total_quantity,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    op.lastInsertRowid,
    produto.id,
    diferenca,
    posicao.id,
    posicao.id,
    saldoRegistrado,
    quantidadeFisica,
    saldoRegistrado,
    quantidadeFisica,
    totalAntes,
    totalAntes + diferenca,
    now
  );

  return { number, diferenca };
});

// Posição especial "Estoque não organizado" usada pelo cadastro de produto
// com quantidade inicial (server/routes/logistica/produtos.js): o produto
// recém-criado entra ali como uma ENTRADA normal, e o usuário organiza
// depois com uma transferência de verdade.
function buscarPosicaoDeRecebimento() {
  return db
    .prepare(
      `SELECT pos.id FROM logistics_positions pos
       JOIN logistics_racks rk ON rk.id = pos.rack_id
       WHERE rk.is_holding_area = 1
       LIMIT 1`
    )
    .get();
}

module.exports = {
  gerarNumeroOperacao,
  saldoTotalProduto,
  lerSaldoPosicao,
  definirSaldoPosicao,
  buscarProdutoAtivo,
  buscarPosicaoUtilizavel,
  validarComum,
  registrarEntradaTx,
  registrarSaidaTx,
  registrarTransferenciaTx,
  registrarAjusteTx,
  buscarPosicaoDeRecebimento,
};
