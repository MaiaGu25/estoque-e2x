const { db, transaction } = require("../../db");
const { nowStamp } = require("../../util");
const inventoryService = require("./inventoryService");
const { normalizarStatusExterno } = require("./normalizeStatus");
const { registrarAuditoria } = require("./audit");
const { criarAlerta } = require("./alerts");

function registrarEventoSync({ accountId, marketplace, tipo, idExterno, resultado, detalhe }) {
  db.prepare(
    `INSERT INTO marketplace_sync_events (account_id,marketplace,tipo,id_externo,resultado,detalhe,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(accountId ?? null, marketplace, tipo, idExterno || "", resultado || "sucesso", detalhe || "", nowStamp());
}

function buscarConta(accountId) {
  const conta = db.prepare("SELECT * FROM marketplace_accounts WHERE id = ?").get(accountId);
  if (!conta) throw new Error("Loja não encontrada.");
  return conta;
}

// Procura um pedido já existente por combinação de conta+ID externo (a
// mesma chave da restrição única) ou pelo número visível dentro da
// mesma conta - usado tanto pela idempotência da importação quanto pela
// pesquisa obrigatória antes de um cadastro manual.
function buscarPedidoExistente({ accountId, idExterno, numeroVisivel }) {
  if (idExterno) {
    const porId = db.prepare("SELECT * FROM marketplace_orders WHERE account_id = ? AND id_externo = ?").get(accountId, idExterno);
    if (porId) return porId;
  }
  if (numeroVisivel) {
    const porNumero = db
      .prepare("SELECT * FROM marketplace_orders WHERE account_id = ? AND numero_visivel = ? AND numero_visivel != ''")
      .get(accountId, numeroVisivel);
    if (porNumero) return porNumero;
  }
  return null;
}

function itensDoPedido(orderId) {
  return db
    .prepare(
      `SELECT oi.*, p.code AS part_code, p.name AS part_name, p.unit AS part_unit
       FROM marketplace_order_items oi
       LEFT JOIN parts p ON p.id = oi.part_id
       WHERE oi.order_id = ?
       ORDER BY oi.id`
    )
    .all(orderId);
}

function reservasDoItem(itemId) {
  return db.prepare("SELECT * FROM marketplace_order_reservations WHERE order_item_id = ? ORDER BY id DESC").all(itemId);
}

// Tenta achar a peça do Estoque geral correspondente a um item de pedido:
// 1) vínculo já salvo (anúncio -> peça), reaproveitado das importações
//    anteriores; 2) SKU externo batendo direto com o código da peça
//    (vínculo automático, também salvo para as próximas vezes);
// 3) sem vínculo confiável -> não reserva nada, marca divergência.
function resolverVinculacaoItem(account, item) {
  if (item.partIdManual) {
    const parte = inventoryService.buscarParteAtiva(item.partIdManual);
    return { partId: parte.id, statusVinculacao: "vinculado", listingId: null };
  }

  const idAnuncio = String(item.idAnuncio || "").trim();
  const idVariacao = String(item.idVariacao || "").trim();
  let listing = null;
  if (idAnuncio) {
    listing = db
      .prepare("SELECT * FROM marketplace_listings WHERE account_id = ? AND id_anuncio = ? AND id_variacao = ?")
      .get(account.id, idAnuncio, idVariacao);
  }

  if (listing) {
    const mapeamento = db.prepare("SELECT * FROM marketplace_listing_mappings WHERE listing_id = ?").get(listing.id);
    if (mapeamento) {
      const parte = db.prepare("SELECT * FROM parts WHERE id = ? AND active = 1").get(mapeamento.part_id);
      if (parte) return { partId: parte.id, statusVinculacao: "vinculado", listingId: listing.id };
      return { partId: null, statusVinculacao: "sku_inexistente", listingId: listing.id };
    }
  }

  const skuExterno = String(item.skuExterno || "").trim();
  if (!skuExterno) return { partId: null, statusVinculacao: "nao_vinculado", listingId: listing?.id ?? null };

  const porCodigo = inventoryService.buscarPartePorCodigo(skuExterno);
  if (!porCodigo) return { partId: null, statusVinculacao: "sku_inexistente", listingId: listing?.id ?? null };

  // Vínculo automático encontrado por SKU exato: grava o anúncio (se
  // tiver ID) e o mapeamento, para não precisar resolver de novo na
  // próxima importação do mesmo anúncio.
  const listingId = listing ? listing.id : idAnuncio ? garantirListing(account, item) : null;
  if (listingId) {
    const now = nowStamp();
    db.prepare(
      `INSERT INTO marketplace_listing_mappings (listing_id,part_id,status,created_at,updated_at)
       VALUES (?,?,'vinculado',?,?)
       ON CONFLICT(listing_id) DO UPDATE SET part_id = excluded.part_id, status = 'vinculado', updated_at = excluded.updated_at`
    ).run(listingId, porCodigo.id, now, now);
  }
  return { partId: porCodigo.id, statusVinculacao: "vinculado", listingId };
}

function garantirListing(account, item) {
  const idAnuncio = String(item.idAnuncio || "").trim();
  if (!idAnuncio) return null;
  const idVariacao = String(item.idVariacao || "").trim();
  const now = nowStamp();
  const existente = db
    .prepare("SELECT id FROM marketplace_listings WHERE account_id = ? AND id_anuncio = ? AND id_variacao = ?")
    .get(account.id, idAnuncio, idVariacao);
  if (existente) return existente.id;
  const result = db
    .prepare(
      `INSERT INTO marketplace_listings (account_id,marketplace,id_anuncio,titulo,sku_recebido,variacao_texto,id_variacao,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      account.id,
      account.marketplace,
      idAnuncio,
      String(item.tituloRecebido || "").trim(),
      String(item.skuExterno || "").trim(),
      String(item.variacaoTexto || "").trim(),
      idVariacao,
      now,
      now
    );
  return result.lastInsertRowid;
}

// Cria (ou atualiza, se já existir pela chave conta+ID externo) um
// pedido normalizado. É o único ponto de entrada usado tanto pela
// importação automática (Fase 2/3), quanto pela reconciliação, quanto
// pelo cadastro manual - garantindo que os três caminhos tratem
// idempotência, vinculação e reserva exatamente da mesma forma.
//
// Nunca reserva de novo um item que já tem reserva ativa, e nunca
// duplica pedido nem item - tudo dentro de uma única transação atômica.
const criarOuAtualizarPedidoTx = transaction((dados, user) => {
  const account = buscarConta(dados.accountId);
  const idExterno = String(dados.idExterno || dados.numeroVisivel || "").trim();
  if (!idExterno) throw new Error("Informe o número ou o ID externo do pedido.");
  const itensEntrada = Array.isArray(dados.itens) ? dados.itens : [];
  if (!itensEntrada.length) throw new Error("Adicione pelo menos um item ao pedido.");

  const now = nowStamp();
  const chaveIdempotencia = `${account.marketplace}:${account.id}:${idExterno}`;

  const { statusInterno: statusCalculado } = dados.statusExternoBruto
    ? normalizarStatusExterno(account.marketplace, dados.statusExternoBruto)
    : { statusInterno: dados.statusInternoManual || "pago" };

  const existente = buscarPedidoExistente({ accountId: account.id, idExterno, numeroVisivel: dados.numeroVisivel });
  let orderId;
  let criado = false;
  let origemFinal = dados.origem === "manual" ? "manual" : "automatica";

  if (existente) {
    orderId = existente.id;
    // Pedido manual sendo alcançado pela API de verdade: preserva o
    // histórico do cadastro manual, mas passa a refletir os dados
    // oficiais e marca a reconciliação, sem nunca criar outro registro.
    if (existente.origem === "manual" && dados.origem === "automatica") {
      origemFinal = "manual_reconciliado";
    } else {
      origemFinal = existente.origem;
    }
    db.prepare(
      `UPDATE marketplace_orders SET
         numero_visivel = CASE WHEN ? != '' THEN ? ELSE numero_visivel END,
         status_externo = ?, origem = ?, comprador_nome = CASE WHEN ? != '' THEN ? ELSE comprador_nome END,
         data_aprovacao = COALESCE(?, data_aprovacao), prazo_envio = COALESCE(?, prazo_envio),
         valor_produtos = ?, desconto = ?, frete = ?, valor_total = ?,
         ultima_sincronizacao = ?, payload_minimo = CASE WHEN ? != '' THEN ? ELSE payload_minimo END,
         reconciliado_com_api = CASE WHEN ? = 'manual_reconciliado' THEN 1 ELSE reconciliado_com_api END,
         updated_by = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      dados.numeroVisivel || "",
      dados.numeroVisivel || "",
      dados.statusExternoBruto || existente.status_externo,
      origemFinal,
      dados.compradorNome || "",
      dados.compradorNome || "",
      dados.dataAprovacao || null,
      dados.prazoEnvio || null,
      Number.isFinite(Number(dados.valorProdutos)) && dados.valorProdutos !== undefined ? Number(dados.valorProdutos) : existente.valor_produtos,
      Number.isFinite(Number(dados.desconto)) && dados.desconto !== undefined ? Number(dados.desconto) : existente.desconto,
      Number.isFinite(Number(dados.frete)) && dados.frete !== undefined ? Number(dados.frete) : existente.frete,
      Number.isFinite(Number(dados.valorTotal)) && dados.valorTotal !== undefined ? Number(dados.valorTotal) : existente.valor_total,
      now,
      dados.payloadMinimo || "",
      dados.payloadMinimo || "",
      origemFinal,
      user?.id ?? null,
      now,
      orderId
    );
    registrarEventoSync({
      accountId: account.id,
      marketplace: account.marketplace,
      tipo: dados.origem === "manual" ? "importacao_manual" : "reconciliacao",
      idExterno,
      resultado: "sucesso",
      detalhe: "Pedido já existia - dados atualizados sem duplicar (idempotente).",
    });
  } else {
    criado = true;
    const result = db
      .prepare(
        `INSERT INTO marketplace_orders
          (account_id,marketplace,id_externo,numero_visivel,status_interno,status_externo,origem,
           comprador_nome,comprador_documento,data_compra,data_aprovacao,prazo_envio,
           valor_produtos,desconto,frete,valor_total,moeda,observacao,motivo_manual,
           importado_em,ultima_sincronizacao,payload_minimo,responsavel,criado_manualmente_por,
           chave_idempotencia,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        account.id,
        account.marketplace,
        idExterno,
        dados.numeroVisivel || "",
        statusCalculado,
        dados.statusExternoBruto || "",
        origemFinal,
        dados.compradorNome || "",
        dados.compradorDocumento || "",
        dados.dataCompra || null,
        dados.dataAprovacao || null,
        dados.prazoEnvio || null,
        Number(dados.valorProdutos) || 0,
        Number(dados.desconto) || 0,
        Number(dados.frete) || 0,
        Number(dados.valorTotal) || 0,
        dados.moeda || "BRL",
        dados.observacao || "",
        dados.motivoManual || "",
        now,
        now,
        dados.payloadMinimo || "",
        dados.responsavel || user?.name || "",
        dados.origem === "manual" ? user?.id ?? null : null,
        chaveIdempotencia,
        user?.id ?? null,
        now,
        user?.id ?? null,
        now
      );
    orderId = result.lastInsertRowid;
    registrarEventoSync({
      accountId: account.id,
      marketplace: account.marketplace,
      tipo: dados.origem === "manual" ? "importacao_manual" : "reconciliacao",
      idExterno,
      resultado: "sucesso",
      detalhe: `Pedido criado (${dados.origem}).`,
    });
  }

  let algumaDivergencia = false;
  const itensExistentes = criado ? [] : itensDoPedido(orderId);

  for (const itemEntrada of itensEntrada) {
    const skuExterno = String(itemEntrada.skuExterno || "").trim();
    const idAnuncio = String(itemEntrada.idAnuncio || "").trim();
    const idVariacao = String(itemEntrada.idVariacao || "").trim();
    const quantidade = Number(itemEntrada.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida em um dos itens.");

    // Idempotência por item: se o pedido já existia, tenta casar este
    // item de entrada com um item já salvo (mesma tripla sku/anúncio/
    // variação) para nunca duplicar nem reservar de novo.
    const itemJaExistente = itensExistentes.find(
      (i) => i.sku_externo === skuExterno && i.id_anuncio === idAnuncio && i.id_variacao === idVariacao
    );

    if (itemJaExistente) {
      if (itemJaExistente.status_vinculacao !== "vinculado" || !itemJaExistente.reserva_criada) algumaDivergencia = true;
      continue; // já processado antes - não reserva de novo, não duplica.
    }

    const now2 = nowStamp();
    const itemResult = db
      .prepare(
        `INSERT INTO marketplace_order_items
          (order_id,part_id,sku_externo,sku_interno,id_anuncio,id_variacao,titulo_recebido,variacao_texto,
           quantidade,preco_unitario,desconto,total,status_vinculacao,reserva_criada,quantidade_reservada,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'nao_vinculado',0,0,?,?)`
      )
      .run(
        orderId,
        null,
        skuExterno,
        "",
        idAnuncio,
        idVariacao,
        String(itemEntrada.tituloRecebido || "").trim(),
        String(itemEntrada.variacaoTexto || "").trim(),
        quantidade,
        Number(itemEntrada.precoUnitario) || 0,
        Number(itemEntrada.desconto) || 0,
        Number(itemEntrada.total) || quantidade * (Number(itemEntrada.precoUnitario) || 0),
        now2,
        now2
      );
    const itemId = itemResult.lastInsertRowid;

    const vinculacao = resolverVinculacaoItem(account, { ...itemEntrada, skuExterno, idAnuncio, idVariacao });

    if (!vinculacao.partId) {
      db.prepare("UPDATE marketplace_order_items SET status_vinculacao = ?, updated_at = ? WHERE id = ?").run(
        vinculacao.statusVinculacao,
        now2,
        itemId
      );
      algumaDivergencia = true;
      criarAlerta({
        tipo: "sku_nao_vinculado",
        severidade: "atencao",
        accountId: account.id,
        orderId,
        titulo: `Item sem vínculo de SKU no pedido ${dados.numeroVisivel || idExterno}`,
        descricao: `SKU externo "${skuExterno || "(vazio)"}" não corresponde a nenhuma peça ativa do Estoque geral.`,
      });
      continue;
    }

    db.prepare("UPDATE marketplace_order_items SET part_id = ?, sku_interno = ?, status_vinculacao = 'vinculado', updated_at = ? WHERE id = ?").run(
      vinculacao.partId,
      inventoryService.buscarPartePorId(vinculacao.partId)?.code || "",
      now2,
      itemId
    );

    // Só reserva quando o pedido já está pago (ou além) - pedido ainda
    // aguardando pagamento não compromete estoque.
    if (["pago", "estoque_reservado", "aguardando_separacao", "em_separacao", "separado", "aguardando_expedicao", "enviado", "entregue"].includes(statusCalculado)) {
      const disponivel = inventoryService.saldoDisponivel(vinculacao.partId);
      if (disponivel < quantidade) {
        algumaDivergencia = true;
        criarAlerta({
          tipo: "estoque_insuficiente",
          severidade: "critico",
          accountId: account.id,
          orderId,
          titulo: `Estoque insuficiente no pedido ${dados.numeroVisivel || idExterno}`,
          descricao: `Solicitado: ${quantidade}. Disponível: ${disponivel}.`,
        });
        continue;
      }
      try {
        const resultadoReserva = inventoryService.reservarItens(
          [{ partId: vinculacao.partId, quantity: quantidade }],
          { reason: `Marketplace - pedido ${dados.numeroVisivel || idExterno}`, responsible: dados.responsavel || user?.name },
          user
        );
        const now3 = nowStamp();
        db.prepare(
          "UPDATE marketplace_order_items SET reserva_criada = 1, quantidade_reservada = ?, updated_at = ? WHERE id = ?"
        ).run(quantidade, now3, itemId);
        db.prepare(
          `INSERT INTO marketplace_order_reservations (order_item_id,part_id,quantidade,status,reserved_movement_id,created_by,created_at,updated_at)
           VALUES (?,?,?,'reservado',?,?,?,?)`
        ).run(itemId, vinculacao.partId, quantidade, resultadoReserva[0]?.movementId ?? null, user?.id ?? null, now3, now3);
      } catch (error) {
        algumaDivergencia = true;
        criarAlerta({
          tipo: "estoque_insuficiente",
          severidade: "critico",
          accountId: account.id,
          orderId,
          titulo: `Não foi possível reservar estoque no pedido ${dados.numeroVisivel || idExterno}`,
          descricao: error instanceof Error ? error.message : "Erro desconhecido ao reservar.",
        });
      }
    }
  }

  let statusFinal = statusCalculado;
  if (algumaDivergencia) {
    statusFinal = "com_divergencia";
  } else if (statusCalculado === "pago") {
    statusFinal = "aguardando_separacao";
  }
  db.prepare("UPDATE marketplace_orders SET status_interno = ?, updated_at = ? WHERE id = ?").run(statusFinal, nowStamp(), orderId);

  registrarAuditoria({
    action: criado ? (dados.origem === "manual" ? "pedido.criado_manual" : "pedido.importado") : "pedido.reconciliado",
    entityType: "marketplace_orders",
    entityId: orderId,
    user,
    newData: { idExterno, statusFinal, origemFinal },
  });

  return { id: orderId, criado, statusInterno: statusFinal, origem: origemFinal };
});

// Cancela um pedido, liberando as reservas ainda não convertidas em
// baixa. Se o pedido já tiver sido separado/expedido, nunca corrige
// silenciosamente - só cria um alerta para revisão administrativa.
const cancelarPedidoTx = transaction((orderId, { motivo, forcar }, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (["cancelado", "devolvido"].includes(pedido.status_interno)) throw new Error("Esse pedido já está encerrado.");

  const jaAvancado = ["separado", "aguardando_expedicao", "enviado", "entregue"].includes(pedido.status_interno);
  if (jaAvancado && !forcar) {
    criarAlerta({
      tipo: "cancelamento_apos_separacao",
      severidade: "critico",
      accountId: pedido.account_id,
      orderId,
      titulo: `Cancelamento recebido após separação - pedido ${pedido.numero_visivel || pedido.id_externo}`,
      descricao: motivo || "Motivo não informado.",
    });
    registrarAuditoria({
      action: "pedido.cancelamento_sinalizado",
      entityType: "marketplace_orders",
      entityId: orderId,
      user,
      newData: { motivo },
      resultado: "alerta_criado",
    });
    return { alertaCriado: true, cancelado: false };
  }

  const itens = itensDoPedido(orderId);
  const now = nowStamp();
  for (const item of itens) {
    const reservasAtivas = reservasDoItem(item.id).filter((r) => r.status === "reservado");
    for (const reserva of reservasAtivas) {
      const resultadoLiberacao = inventoryService.liberarItens(
        [{ partId: reserva.part_id, quantity: reserva.quantidade }],
        { reason: `Cancelamento pedido ${pedido.numero_visivel || pedido.id_externo}`, responsible: user.name },
        user
      );
      db.prepare("UPDATE marketplace_order_reservations SET status = 'liberado', liberado_movement_id = ?, updated_at = ? WHERE id = ?").run(
        resultadoLiberacao[0]?.movementId ?? null,
        now,
        reserva.id
      );
    }
    if (reservasAtivas.length) {
      db.prepare("UPDATE marketplace_order_items SET reserva_criada = 0, quantidade_reservada = 0, updated_at = ? WHERE id = ?").run(now, item.id);
    }
  }

  db.prepare(
    "UPDATE marketplace_orders SET status_interno = 'cancelado', cancelado_em = ?, motivo_cancelamento = ?, updated_by = ?, updated_at = ? WHERE id = ?"
  ).run(now, motivo || "", user.id, now, orderId);

  registrarAuditoria({ action: "pedido.cancelado", entityType: "marketplace_orders", entityId: orderId, user, newData: { motivo } });
  return { alertaCriado: false, cancelado: true };
});

const iniciarSeparacaoTx = transaction((orderId, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status_interno !== "aguardando_separacao") throw new Error("Esse pedido não está aguardando separação.");
  const now = nowStamp();
  db.prepare("UPDATE marketplace_orders SET status_interno = 'em_separacao', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, orderId);
  registrarAuditoria({ action: "pedido.separacao_iniciada", entityType: "marketplace_orders", entityId: orderId, user });
});

const marcarItemSeparadoTx = transaction((orderId, itemId, quantidade, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (!["em_separacao", "aguardando_separacao"].includes(pedido.status_interno)) throw new Error("Esse pedido não está em separação.");
  const item = db.prepare("SELECT * FROM marketplace_order_items WHERE id = ? AND order_id = ?").get(itemId, orderId);
  if (!item) throw new Error("Item não encontrado nesse pedido.");
  const qtd = Number(quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) throw new Error("Quantidade inválida.");
  const pendente = item.quantidade - item.quantidade_separada;
  if (qtd > pendente) throw new Error(`Só restam ${pendente} unidade(s) pendente(s) desse item.`);

  const now = nowStamp();
  const novaQuantidade = item.quantidade_separada + qtd;
  db.prepare("UPDATE marketplace_order_items SET quantidade_separada = ?, updated_at = ? WHERE id = ?").run(novaQuantidade, now, itemId);

  const todosItens = itensDoPedido(orderId);
  const tudoSeparado = todosItens.every((i) => (i.id === itemId ? novaQuantidade : i.quantidade_separada) >= i.quantidade);
  const novoStatus = tudoSeparado ? "separado" : "em_separacao";
  db.prepare("UPDATE marketplace_orders SET status_interno = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoStatus, user.id, now, orderId);
  registrarAuditoria({
    action: "pedido.item_separado",
    entityType: "marketplace_order_items",
    entityId: itemId,
    user,
    newData: { quantidade: qtd },
  });
  return { status: novoStatus };
});

const encaminharExpedicaoTx = transaction((orderId, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status_interno !== "separado") throw new Error("Só pedidos totalmente separados podem ser encaminhados para expedição.");
  const now = nowStamp();
  db.prepare("UPDATE marketplace_orders SET status_interno = 'aguardando_expedicao', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, orderId);
  registrarAuditoria({ action: "pedido.encaminhado_expedicao", entityType: "marketplace_orders", entityId: orderId, user });
});

// Converte as reservas ativas em baixa efetiva (SAIDA de verdade em
// `parts`) - único ponto que decrementa o saldo físico. Reservas já
// baixadas são ignoradas, então rodar duas vezes nunca dá baixa dupla.
const expedirPedidoTx = transaction((orderId, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (!["aguardando_expedicao", "separado"].includes(pedido.status_interno)) throw new Error("Esse pedido não está pronto para expedição.");

  const itens = itensDoPedido(orderId);
  const now = nowStamp();
  let alguma = false;
  for (const item of itens) {
    const reservasAtivas = reservasDoItem(item.id).filter((r) => r.status === "reservado");
    for (const reserva of reservasAtivas) {
      alguma = true;
      const resultadoBaixa = inventoryService.baixarItens(
        [{ partId: reserva.part_id, quantity: reserva.quantidade }],
        { reason: `Expedição pedido ${pedido.numero_visivel || pedido.id_externo}`, responsible: user.name },
        user
      );
      db.prepare("UPDATE marketplace_order_reservations SET status = 'baixado', baixa_movement_id = ?, updated_at = ? WHERE id = ?").run(
        resultadoBaixa[0]?.movementId ?? null,
        now,
        reserva.id
      );
    }
  }
  if (!alguma) throw new Error("Não há reservas ativas para expedir nesse pedido.");

  db.prepare("UPDATE marketplace_orders SET status_interno = 'enviado', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, orderId);
  registrarAuditoria({ action: "pedido.expedido", entityType: "marketplace_orders", entityId: orderId, user });
});

const marcarEntregueTx = transaction((orderId, user) => {
  const pedido = db.prepare("SELECT * FROM marketplace_orders WHERE id = ?").get(orderId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status_interno !== "enviado") throw new Error("Só pedidos enviados podem ser marcados como entregues.");
  const now = nowStamp();
  db.prepare("UPDATE marketplace_orders SET status_interno = 'entregue', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, orderId);
  registrarAuditoria({ action: "pedido.entregue", entityType: "marketplace_orders", entityId: orderId, user });
});

// Situação de prazo (para a fila de pedidos e os alertas de atraso) -
// função pura, sem acesso a banco, calculada em cima de campos já
// carregados.
function calcularSituacaoPrazo(pedido, agora = new Date()) {
  const concluido = ["enviado", "entregue", "cancelado", "devolvido"].includes(pedido.status_interno);
  if (concluido || !pedido.prazo_envio) return { situacao: "sem_prazo", horasRestantes: null };
  const prazo = new Date(pedido.prazo_envio.replace(" ", "T") + "Z");
  const horas = (prazo.getTime() - agora.getTime()) / 3_600_000;
  if (horas < 0) return { situacao: "atrasado", horasRestantes: horas };
  if (horas <= 24) return { situacao: "proximo", horasRestantes: horas };
  return { situacao: "no_prazo", horasRestantes: horas };
}

module.exports = {
  buscarConta,
  buscarPedidoExistente,
  itensDoPedido,
  reservasDoItem,
  criarOuAtualizarPedidoTx,
  cancelarPedidoTx,
  iniciarSeparacaoTx,
  marcarItemSeparadoTx,
  encaminharExpedicaoTx,
  expedirPedidoTx,
  marcarEntregueTx,
  calcularSituacaoPrazo,
  registrarEventoSync,
};
