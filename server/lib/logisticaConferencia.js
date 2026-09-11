const { db, transaction } = require("../db");
const { nowStamp } = require("../util");
const {
  entradaCore,
  buscarProdutoAtivo,
  buscarPosicaoUtilizavel,
  buscarPosicaoDeRecebimento,
} = require("./logisticaMovimentos");
const { normalizarSerial, buscarSerialDetalhado, criarSerial } = require("./logisticaSerial");

function gerarNumeroConferencia() {
  const now = nowStamp();
  return `CNF-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

function registrarEvento(conferenciaId, tipo, descricao, dados, user, now) {
  db.prepare(
    `INSERT INTO logistics_conferencia_eventos (conferencia_id,tipo,descricao,dados,user_id,user_name,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(conferenciaId, tipo, descricao, dados ? JSON.stringify(dados) : "", user?.id ?? null, user?.name ?? "Sistema", now || nowStamp());
}

function buscarConferencia(id) {
  const conferencia = db.prepare("SELECT * FROM logistics_conferencias WHERE id = ?").get(id);
  if (!conferencia) throw new Error("Conferência não encontrada.");
  return conferencia;
}

function itensDaConferencia(conferenciaId) {
  return db
    .prepare(
      `SELECT ci.*, p.code AS product_code, p.name AS product_name, p.unit AS product_unit
       FROM logistics_conferencia_itens ci
       JOIN logistics_products p ON p.id = ci.product_id
       WHERE ci.conferencia_id = ?
       ORDER BY ci.id`
    )
    .all(conferenciaId);
}

function divergenciasDaConferencia(conferenciaId) {
  return db
    .prepare(
      `SELECT d.*, p.code AS product_code, p.name AS product_name
       FROM logistics_conferencia_divergencias d
       LEFT JOIN logistics_conferencia_itens ci ON ci.id = d.item_id
       LEFT JOIN logistics_products p ON p.id = ci.product_id
       WHERE d.conferencia_id = ?
       ORDER BY d.created_at DESC, d.id DESC`
    )
    .all(conferenciaId);
}

function possuiDivergenciaAberta(conferenciaId) {
  return !!db
    .prepare("SELECT id FROM logistics_conferencia_divergencias WHERE conferencia_id = ? AND status = 'aberta' LIMIT 1")
    .get(conferenciaId);
}

const criarConferenciaTx = transaction((b, user) => {
  const fornecedorNome = String(b.fornecedorNome || "").trim();
  if (!fornecedorNome) throw new Error("Informe o fornecedor.");
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) throw new Error("Adicione pelo menos um item esperado.");

  const now = nowStamp();
  const numero = gerarNumeroConferencia();
  const result = db
    .prepare(
      `INSERT INTO logistics_conferencias (numero,fornecedor_nome,fornecedor_contato,status,responsavel,observacao,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,'aguardando_conferencia',?,?,?,?,?,?)`
    )
    .run(
      numero,
      fornecedorNome,
      String(b.fornecedorContato || "").trim(),
      String(b.responsavel || user.name || "").trim(),
      String(b.observacao || "").trim(),
      user.id,
      now,
      user.id,
      now
    );
  const conferenciaId = result.lastInsertRowid;

  for (const item of itens) {
    const produto = buscarProdutoAtivo(item.productId);
    const quantidadeEsperada = Number(item.quantidadeEsperada);
    if (!Number.isFinite(quantidadeEsperada) || quantidadeEsperada <= 0) {
      throw new Error(`Quantidade esperada inválida para o produto ${produto.code}.`);
    }
    db.prepare(
      `INSERT INTO logistics_conferencia_itens (conferencia_id,product_id,quantidade_esperada,quantidade_conferida,exige_serial,observacao,created_at,updated_at)
       VALUES (?,?,?,0,?,?,?,?)`
    ).run(conferenciaId, produto.id, quantidadeEsperada, item.exigeSerial ? 1 : 0, String(item.observacao || "").trim(), now, now);
  }

  registrarEvento(conferenciaId, "criada", `Conferência ${numero} criada com ${itens.length} item(ns).`, null, user, now);
  return { id: conferenciaId, numero };
});

const iniciarConferenciaTx = transaction((conferenciaId, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (conferencia.status !== "aguardando_conferencia") throw new Error("Essa conferência já foi iniciada.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_conferencias SET status = 'em_conferencia', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, conferenciaId);
  registrarEvento(conferenciaId, "iniciada", "Conferência iniciada.", null, user, now);
});

const pausarConferenciaTx = transaction((conferenciaId, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (conferencia.status !== "em_conferencia") throw new Error("Só é possível pausar uma conferência em andamento.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_conferencias SET status = 'conferido_parcialmente', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, conferenciaId);
  registrarEvento(conferenciaId, "pausada", "Conferência pausada com progresso salvo.", null, user, now);
});

// Confirma a chegada de `quantidade` unidades de um item da conferência.
// Cada unidade já entra em estoque de verdade agora (ENTRADA na posição
// informada, ou no "Estoque não organizado" por padrão) - nunca fica
// pendente de um passo de finalização, então pausar e retomar depois nunca
// conta a mesma unidade duas vezes.
const registrarItemConferidoTx = transaction((conferenciaId, itemId, b, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (!["aguardando_conferencia", "em_conferencia", "conferido_parcialmente", "com_divergencia"].includes(conferencia.status)) {
    throw new Error("Essa conferência não pode mais receber itens.");
  }
  const item = db.prepare("SELECT * FROM logistics_conferencia_itens WHERE id = ? AND conferencia_id = ?").get(itemId, conferenciaId);
  if (!item) throw new Error("Item não encontrado nessa conferência.");

  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Quantidade inválida.");

  const pendente = item.quantidade_esperada - item.quantidade_conferida;
  if (quantidade > pendente && !b.permitirExcedente) {
    throw new Error(`Só restam ${pendente} unidade(s) pendente(s) desse item. Marque "permitir excedente" para registrar mais do que o esperado.`);
  }

  const produto = buscarProdutoAtivo(item.product_id);
  const now = nowStamp();
  const destino = b.positionId ? buscarPosicaoUtilizavel(b.positionId) : buscarPosicaoDeRecebimento();
  if (!destino) throw new Error("Nenhuma posição de destino disponível.");
  const statusSerial = b.positionId ? "disponivel" : "estoque_nao_organizado";

  const seriais = Array.isArray(b.seriais) ? b.seriais : [];
  if (item.exige_serial && seriais.length !== quantidade) {
    throw new Error(`Esse item exige número de série: informe exatamente ${quantidade} serial(is).`);
  }

  const serialIds = [];
  for (const entrada of seriais) {
    const valor = typeof entrada === "string" ? entrada : entrada?.valor;
    const ignorarConflito = typeof entrada === "object" && entrada?.ignorarConflito;
    const normalizado = normalizarSerial(valor);
    if (!normalizado) throw new Error("Informe todos os números de série.");
    const existente = buscarSerialDetalhado(normalizado);
    if (existente) {
      if (!ignorarConflito) {
        throw new Error(`O serial ${normalizado} já está cadastrado no sistema. Confirme a divergência para continuar.`);
      }
      const tipo = existente.serial.product_id === produto.id ? "serial_duplicado" : "serial_de_outro_produto";
      db.prepare(
        `INSERT INTO logistics_conferencia_divergencias (conferencia_id,item_id,tipo,descricao,status,created_by,created_at)
         VALUES (?,?,?,?,'aberta',?,?)`
      ).run(
        conferenciaId,
        itemId,
        tipo,
        tipo === "serial_de_outro_produto"
          ? `Serial ${normalizado} já pertence ao produto ${existente.serial.product_code}.`
          : `Serial ${normalizado} já estava cadastrado no sistema.`,
        user.id,
        now
      );
      continue;
    }
    const serialId = criarSerial({
      valor: normalizado,
      productId: produto.id,
      status: statusSerial,
      positionId: destino.id,
      pedidoEntradaId: conferenciaId,
      user,
      now,
    });
    serialIds.push(serialId);
  }

  const numeroOperacao = entradaCore(
    {
      productId: produto.id,
      positionId: destino.id,
      quantity: quantidade,
      reason: `Conferência de entrada ${conferencia.numero} - ${produto.code}`,
      responsible: user.name,
    },
    user
  );

  const novaQuantidadeConferida = item.quantidade_conferida + quantidade;
  db.prepare("UPDATE logistics_conferencia_itens SET quantidade_conferida = ?, updated_at = ? WHERE id = ?").run(novaQuantidadeConferida, now, itemId);

  if (novaQuantidadeConferida > item.quantidade_esperada) {
    db.prepare(
      `INSERT INTO logistics_conferencia_divergencias (conferencia_id,item_id,tipo,descricao,status,created_by,created_at)
       VALUES (?,?,'quantidade_divergente',?,'aberta',?,?)`
    ).run(
      conferenciaId,
      itemId,
      `Recebido ${novaQuantidadeConferida} unidade(s) contra ${item.quantidade_esperada} esperada(s).`,
      user.id,
      now
    );
  }

  const novoStatus = possuiDivergenciaAberta(conferenciaId) ? "com_divergencia" : "em_conferencia";
  db.prepare("UPDATE logistics_conferencias SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoStatus, user.id, now, conferenciaId);

  registrarEvento(
    conferenciaId,
    "item_conferido",
    `${quantidade} unidade(s) de ${produto.code} conferida(s) para ${destino.code}.`,
    { itemId, quantidade, positionId: destino.id, operacao: numeroOperacao, serialIds },
    user,
    now
  );

  return { numeroOperacao, quantidadeConferida: novaQuantidadeConferida };
});

const registrarDivergenciaConferenciaTx = transaction((conferenciaId, b, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (["conferido", "cancelado"].includes(conferencia.status)) throw new Error("Essa conferência já foi encerrada.");
  const tipo = String(b.tipo || "").trim();
  const tiposValidos = ["quantidade_divergente", "produto_errado", "serial_duplicado", "serial_de_outro_produto", "avariado", "item_nao_identificado", "outro"];
  if (!tiposValidos.includes(tipo)) throw new Error("Tipo de divergência inválido.");
  const descricao = String(b.descricao || "").trim();
  if (!descricao) throw new Error("Descreva a divergência.");

  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO logistics_conferencia_divergencias (conferencia_id,item_id,tipo,descricao,status,created_by,created_at)
       VALUES (?,?,?,?,'aberta',?,?)`
    )
    .run(conferenciaId, b.itemId || null, tipo, descricao, user.id, now);

  db.prepare("UPDATE logistics_conferencias SET status = 'com_divergencia', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, conferenciaId);
  registrarEvento(conferenciaId, "divergencia_registrada", descricao, { tipo, itemId: b.itemId }, user, now);
  return { id: result.lastInsertRowid };
});

const resolverDivergenciaConferenciaTx = transaction((conferenciaId, divergenciaId, b, user) => {
  const divergencia = db
    .prepare("SELECT * FROM logistics_conferencia_divergencias WHERE id = ? AND conferencia_id = ?")
    .get(divergenciaId, conferenciaId);
  if (!divergencia) throw new Error("Divergência não encontrada.");
  if (divergencia.status === "resolvida") throw new Error("Essa divergência já foi resolvida.");
  const resolucao = String(b.resolucao || "").trim();
  if (!resolucao) throw new Error("Descreva como a divergência foi resolvida.");

  const now = nowStamp();
  db.prepare(
    "UPDATE logistics_conferencia_divergencias SET status = 'resolvida', resolvido_por = ?, resolvido_em = ?, resolucao = ? WHERE id = ?"
  ).run(user.id, now, resolucao, divergenciaId);

  const aindaHaAberta = possuiDivergenciaAberta(conferenciaId);
  const novoStatus = aindaHaAberta ? "com_divergencia" : "em_conferencia";
  db.prepare("UPDATE logistics_conferencias SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(novoStatus, user.id, now, conferenciaId);
  registrarEvento(conferenciaId, "divergencia_resolvida", resolucao, { divergenciaId }, user, now);
});

const finalizarConferenciaTx = transaction((conferenciaId, b, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (["conferido", "cancelado"].includes(conferencia.status)) throw new Error("Essa conferência já foi encerrada.");
  if (possuiDivergenciaAberta(conferenciaId)) throw new Error("Resolva todas as divergências antes de finalizar.");

  const itens = itensDaConferencia(conferenciaId);
  const pendentes = itens.filter((i) => i.quantidade_conferida < i.quantidade_esperada);
  if (pendentes.length && !b.permitirPendencias) {
    throw new Error(`Ainda há ${pendentes.length} item(ns) com quantidade pendente. Confirme explicitamente para finalizar mesmo assim.`);
  }

  const now = nowStamp();
  db.prepare("UPDATE logistics_conferencias SET status = 'conferido', finalizado_em = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
    now,
    user.id,
    now,
    conferenciaId
  );
  registrarEvento(
    conferenciaId,
    "finalizada",
    pendentes.length ? `Conferência finalizada com ${pendentes.length} item(ns) pendente(s) (exceção autorizada).` : "Conferência finalizada com todos os itens conferidos.",
    { pendentes: pendentes.map((p) => p.id) },
    user,
    now
  );
});

const cancelarConferenciaTx = transaction((conferenciaId, b, user) => {
  const conferencia = buscarConferencia(conferenciaId);
  if (["conferido", "cancelado"].includes(conferencia.status)) throw new Error("Essa conferência já foi encerrada.");
  const now = nowStamp();
  db.prepare("UPDATE logistics_conferencias SET status = 'cancelado', updated_by = ?, updated_at = ? WHERE id = ?").run(user.id, now, conferenciaId);
  registrarEvento(conferenciaId, "cancelada", String(b.motivo || "").trim() || "Conferência cancelada.", null, user, now);
});

module.exports = {
  gerarNumeroConferencia,
  buscarConferencia,
  itensDaConferencia,
  divergenciasDaConferencia,
  criarConferenciaTx,
  iniciarConferenciaTx,
  pausarConferenciaTx,
  registrarItemConferidoTx,
  registrarDivergenciaConferenciaTx,
  resolverDivergenciaConferenciaTx,
  finalizarConferenciaTx,
  cancelarConferenciaTx,
};
