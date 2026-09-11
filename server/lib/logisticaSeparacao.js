const { db, transaction } = require("../db");
const { nowStamp } = require("../util");
const {
  buscarProdutoAtivo,
  buscarPosicaoUtilizavel,
  transferenciaCore,
  saidaCore,
  buscarPosicaoDeSeparacao,
} = require("./logisticaMovimentos");
const { normalizarSerial, buscarSerialDetalhado, atualizarSerial } = require("./logisticaSerial");

const CANAIS = ["manual", "vendedor", "mercado_livre", "shopee", "outro"];
const PRIORIDADES = ["baixa", "normal", "alta", "urgente"];

function gerarNumeroPedidoSaida() {
  const now = nowStamp();
  return `SEP-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

function registrarEvento(pedidoId, tipo, descricao, dados, user, now) {
  db.prepare(
    `INSERT INTO logistics_separacao_eventos (pedido_id,tipo,descricao,dados,user_id,user_name,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(pedidoId, tipo, descricao, dados ? JSON.stringify(dados) : "", user?.id ?? null, user?.name ?? "Sistema", now || nowStamp());
}

function buscarPedido(id) {
  const pedido = db.prepare("SELECT * FROM logistics_pedidos_saida WHERE id = ?").get(id);
  if (!pedido) throw new Error("Pedido de separação não encontrado.");
  return pedido;
}

function itensDoPedido(pedidoId) {
  return db
    .prepare(
      `SELECT pi.*, p.code AS product_code, p.name AS product_name, p.unit AS product_unit
       FROM logistics_pedido_saida_itens pi
       JOIN logistics_products p ON p.id = pi.product_id
       WHERE pi.pedido_id = ?
       ORDER BY pi.id`
    )
    .all(pedidoId);
}

function divergenciasDoPedido(pedidoId) {
  return db
    .prepare(
      `SELECT d.*, p.code AS product_code, p.name AS product_name
       FROM logistics_separacao_divergencias d
       LEFT JOIN logistics_pedido_saida_itens pi ON pi.id = d.item_id
       LEFT JOIN logistics_products p ON p.id = pi.product_id
       WHERE d.pedido_id = ?
       ORDER BY d.created_at DESC, d.id DESC`
    )
    .all(pedidoId);
}

function alocacoesDoItem(itemId) {
  return db
    .prepare(
      `SELECT a.*, pos.code AS position_code, pos.name AS position_name, s.valor AS serial_valor
       FROM logistics_separacao_alocacoes a
       JOIN logistics_positions pos ON pos.id = a.position_id
       LEFT JOIN logistics_serials s ON s.id = a.serial_id
       WHERE a.pedido_item_id = ?
       ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(itemId);
}

function possuiDivergenciaAberta(pedidoId) {
  return !!db.prepare("SELECT id FROM logistics_separacao_divergencias WHERE pedido_id = ? AND status = 'aberta' LIMIT 1").get(pedidoId);
}

// Ranking de sugestão de posições para retirar `quantidadeNecessaria`
// unidades de um produto: prioriza quem sozinho já cobre tudo (menos
// posições visitadas), depois o maior saldo primeiro. Não sugere a
// "Área de separação"/"Estoque não organizado" - só posições organizadas
// de verdade.
function sugerirPosicoes(productId, quantidadeNecessaria) {
  const linhas = db
    .prepare(
      `SELECT ps.position_id, ps.quantity, pos.code AS position_code, pos.name AS position_name,
              s.code AS side_code, s.name AS side_name, rk.name AS rack_name
       FROM logistics_position_stock ps
       JOIN logistics_positions pos ON pos.id = ps.position_id
       JOIN logistics_rack_sides s ON s.id = pos.side_id
       JOIN logistics_racks rk ON rk.id = pos.rack_id
       WHERE ps.product_id = ? AND ps.quantity > 0 AND pos.active = 1 AND pos.blocked = 0
             AND rk.is_holding_area = 0 AND rk.is_separation_area = 0
       ORDER BY ps.quantity DESC, pos.code`
    )
    .all(productId);

  return linhas.map((l) => ({ ...l, cobreSozinha: l.quantity >= quantidadeNecessaria }));
}

const criarPedidoSaidaTx = transaction((b, user) => {
  const canal = CANAIS.includes(b.canal) ? b.canal : "manual";
  const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : "normal";
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) throw new Error("Adicione pelo menos um item para separar.");

  const now = nowStamp();
  const numero = gerarNumeroPedidoSaida();
  let pedidoId;
  try {
    const result = db
      .prepare(
        `INSERT INTO logistics_pedidos_saida
          (numero,canal,canal_conta,id_externo,numero_visivel,data_pedido,cliente_nome,vendedor,status_externo,payload_origem,ultima_sincronizacao,
           status,prioridade,responsavel,observacao,created_by,created_at,updated_by,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'aguardando_separacao',?,?,?,?,?,?,?)`
      )
      .run(
        numero,
        canal,
        String(b.canalConta || "").trim(),
        b.idExterno ? String(b.idExterno).trim() : null,
        String(b.numeroVisivel || "").trim(),
        b.dataPedido || null,
        String(b.clienteNome || "").trim(),
        String(b.vendedor || "").trim(),
        String(b.statusExterno || "").trim(),
        b.payloadOrigem ? JSON.stringify(b.payloadOrigem) : "",
        b.ultimaSincronizacao || null,
        prioridade,
        String(b.responsavel || user.name || "").trim(),
        String(b.observacao || "").trim(),
        user.id,
        now,
        user.id,
        now
      );
    pedidoId = result.lastInsertRowid;
  } catch (error) {
    throw new Error("Já existe um pedido importado com esse mesmo canal/conta/ID externo.");
  }

  for (const item of itens) {
    const produto = buscarProdutoAtivo(item.productId);
    const quantidadeSolicitada = Number(item.quantidadeSolicitada);
    if (!Number.isFinite(quantidadeSolicitada) || quantidadeSolicitada <= 0) {
      throw new Error(`Quantidade solicitada inválida para o produto ${produto.code}.`);
    }
    db.prepare(
      `INSERT INTO logistics_pedido_saida_itens (pedido_id,product_id,variacao,quantidade_solicitada,quantidade_separada,exige_serial,observacao,created_at,updated_at)
       VALUES (?,?,?,?,0,?,?,?,?)`
    ).run(pedidoId, produto.id, String(item.variacao || "").trim(), quantidadeSolicitada, item.exigeSerial ? 1 : 0, String(item.observacao || "").trim(), now, now);
  }

  registrarEvento(pedidoId, "criado", `Pedido ${numero} criado com ${itens.length} item(ns).`, { canal }, user, now);
  return { id: pedidoId, numero };
});

const iniciarSeparacaoTx = transaction((pedidoId, user) => {
  const pedido = buscarPedido(pedidoId);
  if (pedido.status !== "aguardando_separacao") throw new Error("Esse pedido já foi iniciado.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_pedidos_saida SET status = 'em_separacao', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(pedidoId, "iniciado", "Separação iniciada.", null, user, now);
});

const pausarSeparacaoTx = transaction((pedidoId, user) => {
  const pedido = buscarPedido(pedidoId);
  if (pedido.status !== "em_separacao") throw new Error("Só é possível pausar uma separação em andamento.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_pedidos_saida SET status = 'separado_parcialmente', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(pedidoId, "pausado", "Separação pausada com progresso salvo.", null, user, now);
});

// Confirma a retirada de `quantidade` unidades de um item, de uma posição
// específica. Move o saldo para a "Área de separação" (reserva) através de
// uma transferência normal - nunca decrementa saldo duas vezes, porque a
// expedição depois só consome o que já está reservado ali, nunca a
// posição de origem de novo.
const registrarPickTx = transaction((pedidoId, itemId, b, user) => {
  const pedido = buscarPedido(pedidoId);
  if (!["aguardando_separacao", "em_separacao", "separado_parcialmente", "com_divergencia"].includes(pedido.status)) {
    throw new Error("Esse pedido não pode mais ser separado.");
  }
  const item = db.prepare("SELECT * FROM logistics_pedido_saida_itens WHERE id = ? AND pedido_id = ?").get(itemId, pedidoId);
  if (!item) throw new Error("Item não encontrado nesse pedido.");

  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");
  const pendente = item.quantidade_solicitada - item.quantidade_separada;
  if (quantidade > pendente) throw new Error(`Só restam ${pendente} unidade(s) pendente(s) desse item.`);

  const produto = buscarProdutoAtivo(item.product_id);
  const origem = buscarPosicaoUtilizavel(b.positionId);
  const areaSeparacao = buscarPosicaoDeSeparacao();
  if (!areaSeparacao) throw new Error("Área de separação não configurada.");
  const now = nowStamp();

  let serialId = null;
  if (item.exige_serial) {
    const valor = normalizarSerial(b.serial);
    if (!valor) throw new Error("Esse item exige número de série.");
    const encontrado = buscarSerialDetalhado(valor);
    if (!encontrado) throw new Error(`Serial ${valor} não localizado no sistema.`);
    const serial = encontrado.serial;
    if (serial.product_id !== produto.id) {
      throw new Error(`Esse serial pertence ao produto ${serial.product_code}, não a ${produto.code}.`);
    }
    if (serial.position_id !== origem.id) {
      throw new Error(`Esse serial está na posição ${serial.position_code || "desconhecida"}, não em ${origem.code}. Vá até lá ou corrija a posição.`);
    }
    if (serial.status !== "disponivel") {
      const mensagens = {
        reservado: "já está reservado para outra separação",
        em_separacao: "já está sendo separado em outro pedido",
        expedido: "já foi expedido",
        avariado: "está marcado como avariado",
        bloqueado: "está bloqueado",
        devolvido: "está com status de devolvido",
        estoque_nao_organizado: "ainda está no estoque não organizado - organize antes de separar",
      };
      throw new Error(`Esse serial não pode ser separado: ${mensagens[serial.status] || serial.status}.`);
    }
    serialId = serial.id;
  }

  const numeroOperacao = transferenciaCore(
    {
      productId: produto.id,
      fromPositionId: origem.id,
      toPositionId: areaSeparacao.id,
      quantity: quantidade,
      reason: `Separação pedido ${pedido.numero} - ${produto.code}`,
      responsible: user.name,
    },
    user
  );

  if (serialId) {
    atualizarSerial(serialId, { status: "em_separacao", position_id: areaSeparacao.id, pedido_saida_id: pedidoId }, now);
  }

  db.prepare(
    `INSERT INTO logistics_separacao_alocacoes (pedido_item_id,product_id,position_id,quantidade,serial_id,created_by,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(itemId, produto.id, origem.id, quantidade, serialId, user.id, now);

  const novaQuantidadeSeparada = item.quantidade_separada + quantidade;
  db.prepare("UPDATE logistics_pedido_saida_itens SET quantidade_separada = ?, updated_at = ? WHERE id = ?").run(novaQuantidadeSeparada, now, itemId);

  const novoStatus = possuiDivergenciaAberta(pedidoId) ? "com_divergencia" : "em_separacao";
  db.prepare("UPDATE logistics_pedidos_saida SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoStatus, user.id, now, pedidoId);

  registrarEvento(
    pedidoId,
    "item_separado",
    `${quantidade} unidade(s) de ${produto.code} separada(s) de ${origem.code}.`,
    { itemId, quantidade, positionId: origem.id, operacao: numeroOperacao, serialId },
    user,
    now
  );

  return { numeroOperacao, quantidadeSeparada: novaQuantidadeSeparada };
});

// Desfaz uma alocação específica antes da expedição: devolve a quantidade
// para a posição de origem original.
const estornarAlocacaoTx = transaction((alocacaoId, user) => {
  const alocacao = db.prepare("SELECT * FROM logistics_separacao_alocacoes WHERE id = ?").get(alocacaoId);
  if (!alocacao) throw new Error("Alocação não encontrada.");
  if (alocacao.estornado) throw new Error("Essa alocação já foi estornada.");
  if (alocacao.expedido) throw new Error("Essa alocação já foi expedida e não pode mais ser desfeita.");
  const item = db.prepare("SELECT * FROM logistics_pedido_saida_itens WHERE id = ?").get(alocacao.pedido_item_id);
  const pedido = buscarPedido(item.pedido_id);
  const areaSeparacao = buscarPosicaoDeSeparacao();

  const now = nowStamp();
  transferenciaCore(
    {
      productId: alocacao.product_id,
      fromPositionId: areaSeparacao.id,
      toPositionId: alocacao.position_id,
      quantity: alocacao.quantidade,
      reason: `Desfazer separação pedido ${pedido.numero}`,
      responsible: user.name,
    },
    user
  );

  if (alocacao.serial_id) {
    atualizarSerial(alocacao.serial_id, { status: "disponivel", position_id: alocacao.position_id, pedido_saida_id: null }, now);
  }

  db.prepare("UPDATE logistics_separacao_alocacoes SET estornado = 1, estornado_por = ?, estornado_em = ? WHERE id = ?").run(user.id, now, alocacaoId);
  db.prepare("UPDATE logistics_pedido_saida_itens SET quantidade_separada = quantidade_separada - ?, updated_at = ? WHERE id = ?").run(
    alocacao.quantidade,
    now,
    item.id
  );
  db.prepare("UPDATE logistics_pedidos_saida SET status = 'em_separacao', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, item.pedido_id);
  registrarEvento(item.pedido_id, "alocacao_estornada", `Separação de ${alocacao.quantidade} unidade(s) desfeita.`, { alocacaoId }, user, now);
});

const registrarDivergenciaSeparacaoTx = transaction((pedidoId, b, user) => {
  const pedido = buscarPedido(pedidoId);
  if (["expedido", "cancelado"].includes(pedido.status)) throw new Error("Esse pedido já foi encerrado.");
  const tiposValidos = [
    "nao_encontrado",
    "saldo_insuficiente",
    "localizacao_errada",
    "avariado",
    "serial_invalido",
    "foto_divergente",
    "quantidade_divergente",
    "sku_errado",
    "outro",
  ];
  const tipo = String(b.tipo || "").trim();
  if (!tiposValidos.includes(tipo)) throw new Error("Tipo de divergência inválido.");
  const descricao = String(b.descricao || "").trim();
  if (!descricao) throw new Error("Descreva a divergência.");

  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO logistics_separacao_divergencias (pedido_id,item_id,tipo,descricao,status,created_by,created_at)
       VALUES (?,?,?,?,'aberta',?,?)`
    )
    .run(pedidoId, b.itemId || null, tipo, descricao, user.id, now);

  db.prepare("UPDATE logistics_pedidos_saida SET status = 'com_divergencia', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(pedidoId, "divergencia_registrada", descricao, { tipo, itemId: b.itemId }, user, now);
  return { id: result.lastInsertRowid };
});

const resolverDivergenciaSeparacaoTx = transaction((pedidoId, divergenciaId, b, user) => {
  const divergencia = db.prepare("SELECT * FROM logistics_separacao_divergencias WHERE id = ? AND pedido_id = ?").get(divergenciaId, pedidoId);
  if (!divergencia) throw new Error("Divergência não encontrada.");
  if (divergencia.status === "resolvida") throw new Error("Essa divergência já foi resolvida.");
  const resolucao = String(b.resolucao || "").trim();
  if (!resolucao) throw new Error("Descreva como a divergência foi resolvida.");

  const now = nowStamp();
  db.prepare("UPDATE logistics_separacao_divergencias SET status = 'resolvida', resolvido_por = ?, resolvido_em = ?, resolucao = ? WHERE id = ?").run(
    user.id,
    now,
    resolucao,
    divergenciaId
  );

  const novoStatus = possuiDivergenciaAberta(pedidoId) ? "com_divergencia" : "em_separacao";
  db.prepare("UPDATE logistics_pedidos_saida SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoStatus, user.id, now, pedidoId);
  registrarEvento(pedidoId, "divergencia_resolvida", resolucao, { divergenciaId }, user, now);
});

const finalizarSeparacaoTx = transaction((pedidoId, b, user) => {
  const pedido = buscarPedido(pedidoId);
  if (!["em_separacao", "separado_parcialmente", "com_divergencia"].includes(pedido.status)) {
    throw new Error("Esse pedido não está pronto para ser finalizado.");
  }
  if (possuiDivergenciaAberta(pedidoId)) throw new Error("Resolva todas as divergências antes de finalizar.");

  const itens = itensDoPedido(pedidoId);
  const pendentes = itens.filter((i) => i.quantidade_separada < i.quantidade_solicitada);
  if (pendentes.length && !b.permitirPendencias) {
    throw new Error(`Ainda há ${pendentes.length} item(ns) com quantidade pendente. Confirme explicitamente para finalizar mesmo assim.`);
  }

  const now = nowStamp();
  db.prepare("UPDATE logistics_pedidos_saida SET status = 'separado', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(
    pedidoId,
    "finalizado",
    pendentes.length ? `Separação finalizada com ${pendentes.length} item(ns) pendente(s) (exceção autorizada).` : "Separação finalizada com todos os itens completos.",
    { pendentes: pendentes.map((p) => p.id) },
    user,
    now
  );
});

const encaminharExpedicaoTx = transaction((pedidoId, user) => {
  const pedido = buscarPedido(pedidoId);
  if (pedido.status !== "separado") throw new Error("Só pedidos totalmente separados podem ser encaminhados para expedição.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_pedidos_saida SET status = 'aguardando_expedicao', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(pedidoId, "encaminhado_expedicao", "Pedido encaminhado para expedição.", null, user, now);
});

// Consolida numa única SAIDA por produto (a partir da Área de separação) -
// é o único ponto que de fato tira a mercadoria do estoque; o pick antes
// disso só reserva (transferência), nunca decrementa o saldo total.
const expedirTx = transaction((pedidoId, user) => {
  const pedido = buscarPedido(pedidoId);
  if (!["separado", "aguardando_expedicao"].includes(pedido.status)) throw new Error("Esse pedido não está pronto para expedição.");

  const areaSeparacao = buscarPosicaoDeSeparacao();
  const alocacoes = db
    .prepare(
      `SELECT a.* FROM logistics_separacao_alocacoes a
       JOIN logistics_pedido_saida_itens pi ON pi.id = a.pedido_item_id
       WHERE pi.pedido_id = ? AND a.estornado = 0 AND a.expedido = 0`
    )
    .all(pedidoId);
  if (!alocacoes.length) throw new Error("Não há nada reservado para expedir nesse pedido.");

  const now = nowStamp();
  const porProduto = new Map();
  for (const a of alocacoes) {
    porProduto.set(a.product_id, (porProduto.get(a.product_id) || 0) + a.quantidade);
  }

  for (const [productId, quantidade] of porProduto) {
    saidaCore(
      {
        productId,
        positionId: areaSeparacao.id,
        quantity: quantidade,
        reason: `Expedição pedido ${pedido.numero}`,
        responsible: user.name,
      },
      user
    );
  }

  const idsAlocacoes = alocacoes.map((a) => a.id);
  db.prepare(`UPDATE logistics_separacao_alocacoes SET expedido = 1 WHERE id IN (${idsAlocacoes.map(() => "?").join(",")})`).run(...idsAlocacoes);

  const serialIds = alocacoes.filter((a) => a.serial_id).map((a) => a.serial_id);
  for (const serialId of serialIds) {
    atualizarSerial(serialId, { status: "expedido" }, now);
  }

  db.prepare("UPDATE logistics_pedidos_saida SET status = 'expedido', expedido_em = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
    now,
    user.id,
    now,
    pedidoId
  );
  registrarEvento(pedidoId, "expedido", `Pedido expedido (${porProduto.size} produto(s), ${alocacoes.length} alocação(ões)).`, null, user, now);
});

// Cancela o pedido inteiro, devolvendo tudo que ainda estava reservado
// (não expedido) para as posições de origem.
const cancelarPedidoSaidaTx = transaction((pedidoId, b, user) => {
  const pedido = buscarPedido(pedidoId);
  if (["expedido", "cancelado"].includes(pedido.status)) throw new Error("Esse pedido já foi encerrado.");

  const areaSeparacao = buscarPosicaoDeSeparacao();
  const alocacoes = db
    .prepare(
      `SELECT a.* FROM logistics_separacao_alocacoes a
       JOIN logistics_pedido_saida_itens pi ON pi.id = a.pedido_item_id
       WHERE pi.pedido_id = ? AND a.estornado = 0 AND a.expedido = 0`
    )
    .all(pedidoId);

  const now = nowStamp();
  for (const alocacao of alocacoes) {
    transferenciaCore(
      {
        productId: alocacao.product_id,
        fromPositionId: areaSeparacao.id,
        toPositionId: alocacao.position_id,
        quantity: alocacao.quantidade,
        reason: `Cancelamento pedido ${pedido.numero}`,
        responsible: user.name,
      },
      user
    );
    if (alocacao.serial_id) {
      atualizarSerial(alocacao.serial_id, { status: "disponivel", position_id: alocacao.position_id, pedido_saida_id: null }, now);
    }
    db.prepare("UPDATE logistics_separacao_alocacoes SET estornado = 1, estornado_por = ?, estornado_em = ? WHERE id = ?").run(user.id, now, alocacao.id);
  }

  db.prepare("UPDATE logistics_pedidos_saida SET status = 'cancelado', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, pedidoId);
  registrarEvento(pedidoId, "cancelado", String(b.motivo || "").trim() || "Pedido cancelado.", { alocacoesEstornadas: alocacoes.length }, user, now);
});

module.exports = {
  CANAIS,
  PRIORIDADES,
  gerarNumeroPedidoSaida,
  buscarPedido,
  itensDoPedido,
  divergenciasDoPedido,
  alocacoesDoItem,
  sugerirPosicoes,
  criarPedidoSaidaTx,
  iniciarSeparacaoTx,
  pausarSeparacaoTx,
  registrarPickTx,
  estornarAlocacaoTx,
  registrarDivergenciaSeparacaoTx,
  resolverDivergenciaSeparacaoTx,
  finalizarSeparacaoTx,
  encaminharExpedicaoTx,
  expedirTx,
  cancelarPedidoSaidaTx,
};
