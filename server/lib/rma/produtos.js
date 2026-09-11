const { db, transaction } = require("../../db");
const { nowStamp } = require("../../util");
const opcoes = require("./opcoes");
const historico = require("./auditoria");

// Vincular um produto ao protocolo é puramente descritivo - NUNCA cria
// entrada/saída, reserva ou desconta quantidade em "parts" nem em
// nenhum outro catálogo. Esta busca é só leitura, pra sugerir
// descrição/SKU já cadastrados no Estoque geral (autocompletar), sem
// nenhum vínculo (FK) nem efeito colateral.
function buscarReferenciaEstoque(termo) {
  const busca = `%${String(termo || "").trim()}%`;
  if (busca === "%%") return [];
  return db
    .prepare("SELECT code, name FROM parts WHERE active = 1 AND (code LIKE ? OR name LIKE ?) ORDER BY name LIMIT 20")
    .all(busca, busca);
}

function listar(protocoloId) {
  return db.prepare("SELECT * FROM rma_produtos WHERE protocolo_id = ? ORDER BY id").all(protocoloId);
}

function validarOpcoesProduto(dados) {
  if (dados.motivo && !opcoes.ativaExiste("motivo_produto", dados.motivo)) {
    throw new Error(`Motivo inválido: "${dados.motivo}" não é uma opção ativa.`);
  }
  if (dados.estadoEmbalagem && !opcoes.ativaExiste("estado_embalagem", dados.estadoEmbalagem)) {
    throw new Error(`Estado da embalagem inválido: "${dados.estadoEmbalagem}" não é uma opção ativa.`);
  }
}

const adicionar = transaction(({ protocoloId, dados, user }) => {
  const protocolo = db.prepare("SELECT id FROM rma_protocolos WHERE id = ?").get(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const descricao = String(dados.descricao || "").trim();
  if (!descricao) throw new Error("Informe a descrição do produto.");
  validarOpcoesProduto(dados);

  const quantidade = Number(dados.quantidade) > 0 ? Number(dados.quantidade) : 1;
  const valorUnitario = dados.valorUnitario === undefined || dados.valorUnitario === "" ? null : Number(dados.valorUnitario);
  const valorTotal = dados.valorTotal !== undefined && dados.valorTotal !== "" ? Number(dados.valorTotal) : valorUnitario !== null ? valorUnitario * quantidade : null;
  const now = nowStamp();

  const result = db
    .prepare(
      `INSERT INTO rma_produtos
         (protocolo_id,codigo_sku,descricao,quantidade,valor_unitario,valor_total,motivo,estado_embalagem,
          defeito_relatado,defeito_confirmado,numero_serial,observacao,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      protocoloId,
      String(dados.codigoSku || "").trim(),
      descricao,
      quantidade,
      valorUnitario,
      valorTotal,
      String(dados.motivo || "").trim(),
      String(dados.estadoEmbalagem || "").trim(),
      String(dados.defeitoRelatado || "").trim(),
      String(dados.defeitoConfirmado || "").trim(),
      String(dados.numeroSerial || "").trim(),
      String(dados.observacao || "").trim(),
      user?.id ?? null,
      now,
      now
    );
  historico.registrar({ protocoloId, acao: "produto.adicionar", valorNovo: descricao, user });
  return db.prepare("SELECT * FROM rma_produtos WHERE id = ?").get(result.lastInsertRowid);
});

const editar = transaction(({ id, dados, user }) => {
  const atual = db.prepare("SELECT * FROM rma_produtos WHERE id = ?").get(id);
  if (!atual) throw new Error("Produto não encontrado.");
  validarOpcoesProduto(dados);

  const campos = {
    codigo_sku: dados.codigoSku,
    descricao: dados.descricao,
    quantidade: dados.quantidade,
    valor_unitario: dados.valorUnitario,
    valor_total: dados.valorTotal,
    motivo: dados.motivo,
    estado_embalagem: dados.estadoEmbalagem,
    defeito_relatado: dados.defeitoRelatado,
    defeito_confirmado: dados.defeitoConfirmado,
    numero_serial: dados.numeroSerial,
    observacao: dados.observacao,
  };
  const setClauses = [];
  const valores = [];
  for (const [coluna, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    setClauses.push(`${coluna} = ?`);
    valores.push(typeof valor === "number" || coluna === "quantidade" || coluna.startsWith("valor_") ? Number(valor) || null : String(valor || "").trim());
  }
  if (!setClauses.length) throw new Error("Nada para atualizar.");
  setClauses.push("updated_at = ?");
  valores.push(nowStamp(), id);

  db.prepare(`UPDATE rma_produtos SET ${setClauses.join(", ")} WHERE id = ?`).run(...valores);
  historico.registrar({ protocoloId: atual.protocolo_id, acao: "produto.editar", valorAnterior: atual.descricao, valorNovo: dados.descricao ?? atual.descricao, user });
  return db.prepare("SELECT * FROM rma_produtos WHERE id = ?").get(id);
});

const remover = transaction(({ id, user }) => {
  const atual = db.prepare("SELECT * FROM rma_produtos WHERE id = ?").get(id);
  if (!atual) throw new Error("Produto não encontrado.");
  db.prepare("DELETE FROM rma_produtos WHERE id = ?").run(id);
  historico.registrar({ protocoloId: atual.protocolo_id, acao: "produto.remover", valorAnterior: atual.descricao, user });
});

module.exports = { listar, adicionar, editar, remover, buscarReferenciaEstoque };
