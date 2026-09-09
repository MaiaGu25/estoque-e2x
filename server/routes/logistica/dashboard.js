const express = require("express");
const { db } = require("../../db");
const { nowStamp } = require("../../util");

const router = express.Router();

router.get("/", (req, res) => {
  const produtosAtivos = db.prepare("SELECT id, minimum_stock FROM logistics_products WHERE active = 1").all();
  const saldosPorProduto = db
    .prepare("SELECT product_id, COALESCE(SUM(quantity),0) AS total FROM logistics_position_stock GROUP BY product_id")
    .all();
  const saldoMap = new Map(saldosPorProduto.map((r) => [r.product_id, r.total]));

  let unidadesTotais = 0;
  let estoqueBaixo = 0;
  let semEstoque = 0;
  for (const p of produtosAtivos) {
    const saldo = saldoMap.get(p.id) || 0;
    unidadesTotais += saldo;
    if (saldo <= 0) semEstoque++;
    else if (saldo <= p.minimum_stock) estoqueBaixo++;
  }

  const posicoesTotais = db.prepare("SELECT COUNT(*) AS n FROM logistics_positions WHERE active = 1").get().n;
  const posicoesOcupadas = db
    .prepare(
      `SELECT COUNT(DISTINCT position_id) AS n FROM logistics_position_stock ps
       JOIN logistics_positions pos ON pos.id = ps.position_id
       WHERE ps.quantity > 0 AND pos.active = 1`
    )
    .get().n;

  const hojeInicio = nowStamp().slice(0, 10);
  const registradasHoje = db.prepare("SELECT COUNT(*) AS n FROM logistics_operations WHERE created_at >= ?").get(hojeInicio).n;

  const recentesPorTipo = (tipo) =>
    db
      .prepare(
        `SELECT m.id, m.created_at, m.quantity, o.number, o.type, o.reason, o.responsible,
                p.code AS product_code, p.name AS product_name,
                fp.code AS from_position_code, tp.code AS to_position_code
         FROM logistics_movements m
         JOIN logistics_operations o ON o.id = m.operation_id
         JOIN logistics_products p ON p.id = m.product_id
         LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
         LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
         WHERE o.type = ?
         ORDER BY m.created_at DESC, m.id DESC LIMIT 5`
      )
      .all(tipo);

  const ultimasMovimentacoes = db
    .prepare(
      `SELECT m.id, m.created_at, m.quantity, o.number, o.type, o.reason, o.responsible,
              p.code AS product_code, p.name AS product_name,
              fp.code AS from_position_code, tp.code AS to_position_code
       FROM logistics_movements m
       JOIN logistics_operations o ON o.id = m.operation_id
       JOIN logistics_products p ON p.id = m.product_id
       LEFT JOIN logistics_positions fp ON fp.id = m.from_position_id
       LEFT JOIN logistics_positions tp ON tp.id = m.to_position_id
       ORDER BY m.created_at DESC, m.id DESC LIMIT 10`
    )
    .all();

  res.json({
    produtosCadastrados: produtosAtivos.length,
    unidadesTotais,
    estoqueBaixo,
    semEstoque,
    registradasHoje,
    posicoesTotais,
    posicoesOcupadas,
    posicoesVazias: posicoesTotais - posicoesOcupadas,
    entradasRecentes: recentesPorTipo("ENTRADA"),
    saidasRecentes: recentesPorTipo("SAIDA"),
    transferenciasRecentes: recentesPorTipo("TRANSFERENCIA"),
    ajustesRecentes: recentesPorTipo("AJUSTE"),
    ultimasMovimentacoes,
  });
});

module.exports = router;
