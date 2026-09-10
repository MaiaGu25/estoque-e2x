const express = require("express");
const { db, transaction } = require("../../db");
const { requireAdmin } = require("../../auth");
const { nowStamp } = require("../../util");
const { broadcast } = require("../../realtime");
const {
  gerarNumeroOperacao,
  saldoTotalProduto,
  lerSaldoPosicao,
  definirSaldoPosicao,
  buscarProdutoAtivo,
  buscarPosicaoUtilizavel,
} = require("../../lib/logisticaMovimentos");

const router = express.Router();

// Desconto acima disso trava o orçamento em "aguardando_aprovacao" até um
// admin liberar - o vendedor continua livre pra montar o orçamento, só não
// fecha a venda sozinho quando passa desse limite.
const DESCONTO_LIMITE_SEM_APROVACAO = 10;

function gerarNumeroOrcamento() {
  const now = nowStamp();
  return `ORC-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

// Monta e valida os itens vindos do corpo da requisição, buscando o preço
// de venda atual de cada produto (nunca confia num preço mandado pelo
// cliente) e calculando os totais e se algum item passou do limite de
// desconto.
function prepararItens(itensBrutos) {
  const itens = Array.isArray(itensBrutos) ? itensBrutos : [];
  if (!itens.length) throw new Error("Adicione ao menos um item ao orçamento.");

  let subtotal = 0;
  let discountTotal = 0;
  let maiorDesconto = 0;
  const preparados = itens.map((item, index) => {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Item ${index + 1}: quantidade inválida.`);
    const discountPct = Number(item?.discountPct) || 0;
    if (discountPct < 0 || discountPct > 100) throw new Error(`Item ${index + 1}: desconto inválido.`);
    const produto = buscarProdutoAtivo(Number(item?.productId));
    const unitPrice = produto.sale_price;
    const lineSubtotal = quantity * unitPrice;
    const lineDiscount = (lineSubtotal * discountPct) / 100;
    const lineTotal = lineSubtotal - lineDiscount;
    subtotal += lineSubtotal;
    discountTotal += lineDiscount;
    maiorDesconto = Math.max(maiorDesconto, discountPct);
    return { productId: produto.id, quantity, unitPrice, discountPct, lineTotal };
  });

  return {
    itens: preparados,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    status: maiorDesconto > DESCONTO_LIMITE_SEM_APROVACAO ? "aguardando_aprovacao" : "aberto",
  };
}

router.get("/", (req, res) => {
  const { status, busca } = req.query;
  const where = [];
  const params = [];
  if (status) {
    where.push("status = ?");
    params.push(String(status));
  }
  if (busca) {
    where.push("(numero LIKE ? OR customer_name LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like);
  }
  const sql = `SELECT * FROM sales_quotes ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 500`;
  const orcamentos = db.prepare(sql).all(...params);
  res.json({ orcamentos, descontoLimiteSemAprovacao: DESCONTO_LIMITE_SEM_APROVACAO });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const orcamento = db.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });

  const itens = db
    .prepare(
      `SELECT qi.*, p.code AS product_code, p.name AS product_name, p.unit AS product_unit, p.notes AS product_notes
       FROM sales_quote_items qi
       JOIN logistics_products p ON p.id = qi.product_id
       WHERE qi.quote_id = ?
       ORDER BY qi.id`
    )
    .all(id);

  res.json({ orcamento, itens });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  let preparo;
  try {
    preparo = prepararItens(b.itens);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Itens inválidos." });
  }

  const responsible = String(b.responsible || req.user.name).trim();
  const now = nowStamp();
  const numero = gerarNumeroOrcamento();

  const run = transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO sales_quotes (numero,customer_name,customer_contact,status,subtotal,discount_total,total,notes,responsible,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        numero,
        String(b.customerName || "").trim(),
        String(b.customerContact || "").trim(),
        preparo.status,
        preparo.subtotal,
        preparo.discountTotal,
        preparo.total,
        String(b.notes || "").trim(),
        responsible,
        req.user.id,
        now,
        req.user.id,
        now
      );
    const quoteId = result.lastInsertRowid;
    for (const item of preparo.itens) {
      db.prepare(
        `INSERT INTO sales_quote_items (quote_id,product_id,quantity,unit_price,discount_pct,line_total,created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(quoteId, item.productId, item.quantity, item.unitPrice, item.discountPct, item.lineTotal, now);
    }
    return quoteId;
  });

  try {
    const id = run();
    broadcast("logistica");
    res.json({ ok: true, id, numero, status: preparo.status });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar o orçamento." });
  }
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const orcamento = db.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (orcamento.status !== "aberto" && orcamento.status !== "aguardando_aprovacao") {
    return res.status(400).json({ error: "Esse orçamento já foi fechado ou cancelado e não pode mais ser editado." });
  }

  const b = req.body || {};
  let preparo;
  try {
    preparo = prepararItens(b.itens);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Itens inválidos." });
  }

  const responsible = String(b.responsible || orcamento.responsible).trim();
  const now = nowStamp();

  const run = transaction(() => {
    db.prepare(
      `UPDATE sales_quotes SET customer_name=?, customer_contact=?, status=?, subtotal=?, discount_total=?, total=?, notes=?, responsible=?, updated_by=?, updated_at=? WHERE id=?`
    ).run(
      String(b.customerName || "").trim(),
      String(b.customerContact || "").trim(),
      preparo.status,
      preparo.subtotal,
      preparo.discountTotal,
      preparo.total,
      String(b.notes || "").trim(),
      responsible,
      req.user.id,
      now,
      id
    );
    db.prepare("DELETE FROM sales_quote_items WHERE quote_id = ?").run(id);
    for (const item of preparo.itens) {
      db.prepare(
        `INSERT INTO sales_quote_items (quote_id,product_id,quantity,unit_price,discount_pct,line_total,created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(id, item.productId, item.quantity, item.unitPrice, item.discountPct, item.lineTotal, now);
    }
  });

  try {
    run();
    broadcast("logistica");
    res.json({ ok: true, status: preparo.status });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar o orçamento." });
  }
});

router.post("/:id/aprovar", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const orcamento = db.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (orcamento.status !== "aguardando_aprovacao") {
    return res.status(400).json({ error: "Esse orçamento não está aguardando aprovação." });
  }
  const now = nowStamp();
  db.prepare("UPDATE sales_quotes SET status='aberto', approved_by=?, approved_at=?, updated_by=?, updated_at=? WHERE id=?").run(
    req.user.id,
    now,
    req.user.id,
    now,
    id
  );
  broadcast("logistica");
  res.json({ ok: true });
});

router.post("/:id/cancelar", (req, res) => {
  const id = Number(req.params.id);
  const orcamento = db.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (orcamento.status !== "aberto" && orcamento.status !== "aguardando_aprovacao") {
    return res.status(400).json({ error: "Esse orçamento já foi fechado ou cancelado." });
  }
  const now = nowStamp();
  db.prepare("UPDATE sales_quotes SET status='cancelado', updated_by=?, updated_at=? WHERE id=?").run(req.user.id, now, id);
  broadcast("logistica");
  res.json({ ok: true });
});

// Fecha o orçamento de verdade: dá baixa no estoque de cada item, na
// posição que o vendedor escolheu (ou que já veio sozinha, quando o
// produto só existe num lugar). Tudo numa transação só - ou fecha certo,
// ou não fecha nada.
const fecharOrcamentoTx = transaction((orcamento, itensParaBaixa, userId) => {
  const now = nowStamp();
  for (const item of itensParaBaixa) {
    const produto = buscarProdutoAtivo(item.productId);
    const posicao = buscarPosicaoUtilizavel(item.positionId);

    const numeroOperacao = gerarNumeroOperacao("SAIDA");
    const op = db
      .prepare("INSERT INTO logistics_operations (number,type,reason,responsible,notes,created_by,created_at) VALUES (?,'SAIDA',?,?,?,?,?)")
      .run(numeroOperacao, `Venda - Orçamento ${orcamento.numero}`, orcamento.responsible, `Cliente: ${orcamento.customer_name || "-"}`, userId, now);

    const totalAntes = saldoTotalProduto(produto.id);
    const saldoAntes = lerSaldoPosicao(posicao.id, produto.id);
    const saldoDepois = saldoAntes - item.quantity;
    if (saldoDepois < 0) throw new Error(`Saldo insuficiente de "${produto.name}" na posição escolhida.`);
    definirSaldoPosicao(posicao.id, produto.id, saldoAntes, saldoDepois, now);

    db.prepare(
      `INSERT INTO logistics_movements (operation_id,product_id,quantity,from_position_id,to_position_id,previous_from_quantity,new_from_quantity,previous_to_quantity,new_to_quantity,previous_total_quantity,new_total_quantity,created_at)
       VALUES (?,?,?,?,NULL,?,?,NULL,NULL,?,?,?)`
    ).run(op.lastInsertRowid, produto.id, item.quantity, posicao.id, saldoAntes, saldoDepois, totalAntes, totalAntes - item.quantity, now);
  }
  db.prepare("UPDATE sales_quotes SET status='fechado', closed_at=?, updated_by=?, updated_at=? WHERE id=?").run(now, userId, now, orcamento.id);
});

router.post("/:id/fechar", (req, res) => {
  const id = Number(req.params.id);
  const orcamento = db.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (orcamento.status === "aguardando_aprovacao") {
    return res.status(400).json({ error: "Esse orçamento tem desconto acima do limite e precisa ser aprovado por um administrador antes de fechar." });
  }
  if (orcamento.status !== "aberto") {
    return res.status(400).json({ error: "Esse orçamento já foi fechado ou cancelado." });
  }

  const itensDoOrcamento = db.prepare("SELECT * FROM sales_quote_items WHERE quote_id = ?").all(id);
  const posicoesPorItem = new Map((Array.isArray(req.body?.itens) ? req.body.itens : []).map((i) => [Number(i.itemId), Number(i.positionId)]));

  const itensParaBaixa = [];
  for (const item of itensDoOrcamento) {
    const positionId = posicoesPorItem.get(item.id);
    if (!positionId) return res.status(400).json({ error: "Escolha a posição de origem de todos os itens antes de fechar." });
    itensParaBaixa.push({ productId: item.product_id, quantity: item.quantity, positionId });
  }

  try {
    fecharOrcamentoTx(orcamento, itensParaBaixa, req.user.id);
    broadcast("logistica");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível fechar o orçamento." });
  }
});

module.exports = router;
