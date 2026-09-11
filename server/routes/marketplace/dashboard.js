const express = require("express");
const { db } = require("../../db");
const { calcularSituacaoPrazo } = require("../../lib/marketplace/orders");

const router = express.Router();

function formatarData(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function calcularIntervalo(periodo, dataInicioCustom, dataFimCustom) {
  const agora = new Date();
  const fimPadrao = formatarData(agora);
  const inicioHoje = new Date(agora);
  inicioHoje.setHours(0, 0, 0, 0);

  if (periodo === "hoje") return { inicio: formatarData(inicioHoje), fim: fimPadrao };
  if (periodo === "ontem") {
    const inicioOntem = new Date(inicioHoje);
    inicioOntem.setDate(inicioOntem.getDate() - 1);
    return { inicio: formatarData(inicioOntem), fim: formatarData(inicioHoje) };
  }
  if (periodo === "30d") {
    const inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - 30);
    return { inicio: formatarData(inicio), fim: fimPadrao };
  }
  if (periodo === "custom") {
    return { inicio: dataInicioCustom || "2000-01-01 00:00:00", fim: dataFimCustom || fimPadrao };
  }
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - 7);
  return { inicio: formatarData(inicio), fim: fimPadrao };
}

function montarFiltroConta(marketplace, accountId, alias = "o") {
  const where = [];
  const params = [];
  if (marketplace) {
    where.push(`${alias}.marketplace = ?`);
    params.push(String(marketplace));
  }
  if (accountId) {
    where.push(`${alias}.account_id = ?`);
    params.push(Number(accountId));
  }
  return { where, params };
}

function contarPedidos(inicio, fim, filtroExtra) {
  const { where, params } = montarFiltroConta(filtroExtra.marketplace, filtroExtra.accountId);
  where.unshift("o.importado_em BETWEEN ? AND ?");
  params.unshift(inicio, fim);
  return db.prepare(`SELECT COUNT(*) AS n FROM marketplace_orders o WHERE ${where.join(" AND ")}`).get(...params).n;
}

router.get("/", (req, res) => {
  const { periodo = "7d", dataInicio, dataFim, marketplace, accountId } = req.query;
  const { inicio, fim } = calcularIntervalo(String(periodo), dataInicio, dataFim);
  const filtro = { marketplace, accountId };
  const { where: whereConta, params: paramsConta } = montarFiltroConta(marketplace, accountId);
  const whereContaSql = whereConta.length ? "AND " + whereConta.join(" AND ") : "";

  // Âncoras fixas (sempre hoje/últimos 7 dias, independente do período
  // escolhido no seletor).
  const agora = new Date();
  const inicioHoje = new Date(agora);
  inicioHoje.setHours(0, 0, 0, 0);
  const inicio7d = new Date(agora);
  inicio7d.setDate(inicio7d.getDate() - 7);
  const pedidosHoje = contarPedidos(formatarData(inicioHoje), formatarData(agora), filtro);
  const pedidosSemana = contarPedidos(formatarData(inicio7d), formatarData(agora), filtro);

  // Resumo do período escolhido.
  const porStatusRows = db
    .prepare(`SELECT status_interno, COUNT(*) AS n FROM marketplace_orders o WHERE importado_em BETWEEN ? AND ? ${whereContaSql} GROUP BY status_interno`)
    .all(inicio, fim, ...paramsConta);
  const porStatus = Object.fromEntries(porStatusRows.map((r) => [r.status_interno, r.n]));

  const unidadesVendidas =
    db
      .prepare(
        `SELECT COALESCE(SUM(oi.quantidade),0) AS n
         FROM marketplace_order_items oi JOIN marketplace_orders o ON o.id = oi.order_id
         WHERE o.importado_em BETWEEN ? AND ? AND o.status_interno NOT IN ('cancelado','devolvido') ${whereContaSql}`
      )
      .get(inicio, fim, ...paramsConta).n || 0;

  const porOrigemRows = db
    .prepare(`SELECT origem, COUNT(*) AS n FROM marketplace_orders o WHERE importado_em BETWEEN ? AND ? ${whereContaSql} GROUP BY origem`)
    .all(inicio, fim, ...paramsConta);
  const porOrigem = Object.fromEntries(porOrigemRows.map((r) => [r.origem, r.n]));

  const produtosMaisVendidos = db
    .prepare(
      `SELECT COALESCE(oi.sku_interno, oi.sku_externo) AS sku, p.name AS nome, SUM(oi.quantidade) AS unidades, COUNT(DISTINCT oi.order_id) AS pedidos
       FROM marketplace_order_items oi
       JOIN marketplace_orders o ON o.id = oi.order_id
       LEFT JOIN parts p ON p.id = oi.part_id
       WHERE o.importado_em BETWEEN ? AND ? AND o.status_interno NOT IN ('cancelado','devolvido') ${whereContaSql}
       GROUP BY COALESCE(oi.sku_interno, oi.sku_externo)
       ORDER BY unidades DESC LIMIT 10`
    )
    .all(inicio, fim, ...paramsConta);

  // Estado atual (não depende do período escolhido) - atraso, falhas,
  // última sincronização por loja.
  const pedidosAbertos = db
    .prepare(
      `SELECT o.id, o.prazo_envio, o.status_interno FROM marketplace_orders o WHERE o.status_interno NOT IN ('enviado','entregue','cancelado','devolvido') ${whereContaSql}`
    )
    .all(...paramsConta);
  let atrasados = 0;
  let proximos = 0;
  for (const pedido of pedidosAbertos) {
    const { situacao } = calcularSituacaoPrazo(pedido, agora);
    if (situacao === "atrasado") atrasados++;
    else if (situacao === "proximo") proximos++;
  }

  const falhasSincronizacao = db.prepare("SELECT COUNT(*) AS n FROM marketplace_sync_failures WHERE status = 'pendente'").get().n;
  const ultimaSincronizacaoPorLoja = db
    .prepare("SELECT id, marketplace, nome_interno, apelido, status_conexao, ultima_sincronizacao, ultimo_erro FROM marketplace_accounts ORDER BY marketplace, nome_interno")
    .all();

  res.json({
    periodo: { tipo: periodo, inicio, fim },
    pedidosHoje,
    pedidosSemana,
    unidadesVendidas,
    porStatus,
    porOrigem,
    produtosMaisVendidos,
    pedidosAtrasados: atrasados,
    pedidosProximosDoPrazo: proximos,
    falhasSincronizacao,
    ultimaSincronizacaoPorLoja,
  });
});

// Comparação lado a lado entre lojas (todas, só ML, só Shopee, ou uma
// seleção específica de contas) - mesmo período para todas.
router.get("/comparacao", (req, res) => {
  const { periodo = "7d", dataInicio, dataFim, marketplace, accountIds } = req.query;
  const { inicio, fim } = calcularIntervalo(String(periodo), dataInicio, dataFim);

  const where = ["1=1"];
  const params = [];
  if (marketplace) {
    where.push("a.marketplace = ?");
    params.push(String(marketplace));
  }
  if (accountIds) {
    const ids = String(accountIds)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Boolean);
    if (ids.length) {
      where.push(`a.id IN (${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    }
  }

  const contas = db.prepare(`SELECT * FROM marketplace_accounts a WHERE ${where.join(" AND ")} ORDER BY a.marketplace, a.nome_interno`).all(...params);

  const comparacao = contas.map((conta) => {
    const pedidos = db
      .prepare("SELECT COUNT(*) AS n FROM marketplace_orders WHERE account_id = ? AND importado_em BETWEEN ? AND ?")
      .get(conta.id, inicio, fim).n;
    const unidades =
      db
        .prepare(
          `SELECT COALESCE(SUM(oi.quantidade),0) AS n FROM marketplace_order_items oi
           JOIN marketplace_orders o ON o.id = oi.order_id
           WHERE o.account_id = ? AND o.importado_em BETWEEN ? AND ? AND o.status_interno NOT IN ('cancelado','devolvido')`
        )
        .get(conta.id, inicio, fim).n || 0;
    const pendentes = db
      .prepare(
        `SELECT COUNT(*) AS n FROM marketplace_orders WHERE account_id = ? AND importado_em BETWEEN ? AND ?
         AND status_interno IN ('novo','aguardando_pagamento','pago','estoque_reservado','aguardando_separacao','em_separacao')`
      )
      .get(conta.id, inicio, fim).n;
    const cancelamentos = db
      .prepare("SELECT COUNT(*) AS n FROM marketplace_orders WHERE account_id = ? AND importado_em BETWEEN ? AND ? AND status_interno = 'cancelado'")
      .get(conta.id, inicio, fim).n;
    const abertos = db
      .prepare("SELECT id, prazo_envio, status_interno FROM marketplace_orders WHERE account_id = ? AND status_interno NOT IN ('enviado','entregue','cancelado','devolvido')")
      .all(conta.id);
    const atrasados = abertos.filter((p) => calcularSituacaoPrazo(p).situacao === "atrasado").length;
    const falhas = db.prepare("SELECT COUNT(*) AS n FROM marketplace_sync_failures WHERE account_id = ? AND status = 'pendente'").get(conta.id).n;
    const maisVendidos = db
      .prepare(
        `SELECT COALESCE(oi.sku_interno, oi.sku_externo) AS sku, SUM(oi.quantidade) AS unidades
         FROM marketplace_order_items oi JOIN marketplace_orders o ON o.id = oi.order_id
         WHERE o.account_id = ? AND o.importado_em BETWEEN ? AND ? AND o.status_interno NOT IN ('cancelado','devolvido')
         GROUP BY COALESCE(oi.sku_interno, oi.sku_externo) ORDER BY unidades DESC LIMIT 3`
      )
      .all(conta.id, inicio, fim);

    return {
      accountId: conta.id,
      marketplace: conta.marketplace,
      nomeInterno: conta.nome_interno,
      apelido: conta.apelido,
      pedidos,
      unidades,
      pendentes,
      atrasados,
      cancelamentos,
      falhasSincronizacao: falhas,
      maisVendidos,
    };
  });

  res.json({ periodo: { tipo: periodo, inicio, fim }, comparacao });
});

module.exports = router;
