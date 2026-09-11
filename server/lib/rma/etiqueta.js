const { db, transaction } = require("../../db");
const { nowStamp, normalizarNumero } = require("../../util");
const historico = require("./auditoria");

// Camada isolada de identificação de protocolo por etiqueta (lida com
// leitor de código de barras ou digitada). Hoje só sabe comparar contra
// os números já cadastrados manualmente (envio/reversa/rastreio/pedido/
// sistema); é aqui, e só aqui, que entraria futuramente a interpretação
// de um formato de etiqueta/importação do Mercado Livre (ex.: extrair o
// número da reversa de um QR code próprio da plataforma) - bastaria um
// pré-processamento de "texto lido" -> "número normalizado" antes da
// consulta abaixo, sem mexer em mais nada do módulo.
const CAMPOS_BUSCA = [
  { coluna: "numero_pedido_normalizado", nome: "numero_pedido", rotulo: "Número do pedido" },
  { coluna: "numero_sistema_normalizado", nome: "numero_sistema", rotulo: "Número do sistema" },
  { coluna: "numero_envio_normalizado", nome: "numero_envio", rotulo: "Número do envio" },
  { coluna: "numero_reversa_normalizado", nome: "numero_reversa", rotulo: "Número da reversa" },
  { coluna: "numero_rastreio_normalizado", nome: "numero_rastreio", rotulo: "Número de rastreio" },
];

// Registra a consulta (mesmo sem achar nada) - fica sempre dentro da
// própria camada de identificação (não depende da rota lembrar de
// chamar), então toda consulta feita por etiqueta, aqui ou por qualquer
// chamador futuro, fica no log de recebimentos/conferências.
function registrarConsultaCore({ numeroPesquisado, resultado, protocoloId, campoCorrespondido, acaoRealizada, user }) {
  db.prepare(
    `INSERT INTO rma_recebimentos (protocolo_id,numero_pesquisado,campo_correspondido,resultado,acao_realizada,responsavel_id,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(protocoloId ?? null, String(numeroPesquisado || ""), campoCorrespondido || "", resultado, acaoRealizada || "", user?.id ?? null, nowStamp());
}
const registrarConsulta = transaction(registrarConsultaCore);

// Nunca toca em estoque - só lê protocolos. Devolve todo protocolo cujo
// algum dos 5 números bate com o valor pesquisado (normalizado), já com
// qual campo específico correspondeu, e sempre deixa rastro da consulta
// em rma_recebimentos (mesmo quando não encontra nada).
const buscar = transaction((numeroDigitado, user) => {
  const normalizado = normalizarNumero(numeroDigitado);
  if (!normalizado) {
    registrarConsultaCore({ numeroPesquisado: numeroDigitado, resultado: "nao_encontrado", user });
    return { normalizado: "", resultado: "nao_encontrado", correspondencias: [] };
  }

  const correspondencias = [];
  for (const campo of CAMPOS_BUSCA) {
    const linhas = db
      .prepare(
        `SELECT p.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj
         FROM rma_protocolos p JOIN rma_clientes c ON c.id = p.cliente_id
         WHERE p.${campo.coluna} = ?`
      )
      .all(normalizado);
    for (const protocolo of linhas) {
      if (!correspondencias.some((m) => m.protocolo.id === protocolo.id)) {
        correspondencias.push({ protocolo, campo: campo.nome, campoRotulo: campo.rotulo });
      }
    }
  }

  const resultado = correspondencias.length === 0 ? "nao_encontrado" : correspondencias.length === 1 ? "encontrado_unico" : "encontrado_multiplo";
  registrarConsultaCore({
    numeroPesquisado: numeroDigitado,
    resultado,
    protocoloId: correspondencias.length === 1 ? correspondencias[0].protocolo.id : null,
    campoCorrespondido: correspondencias.length === 1 ? correspondencias[0].campo : "",
    user,
  });
  return { normalizado, resultado, correspondencias };
});

// Marca o protocolo como recebido/em conferência a partir da leitura da
// etiqueta, registrando o responsável no histórico e no log de
// recebimentos. Só muda status - não mexe em nenhum produto nem estoque.
const marcarRecebido = transaction(({ protocoloId, novoStatus, numeroPesquisado, campoCorrespondido, user }) => {
  const protocolo = db.prepare("SELECT * FROM rma_protocolos WHERE id = ?").get(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const now = nowStamp();
  const primeiroRecebimento = !protocolo.data_recebimento;
  db.prepare(
    `UPDATE rma_protocolos SET status = ?, data_recebimento = COALESCE(data_recebimento, ?),
       responsavel_recebimento_id = COALESCE(responsavel_recebimento_id, ?), updated_by = ?, updated_at = ?
     WHERE id = ?`
  ).run(novoStatus, now, user?.id ?? null, user?.id ?? null, now, protocoloId);

  historico.registrarDiferencas({
    protocoloId,
    acao: "etiqueta.recebimento",
    anterior: { status: protocolo.status },
    novo: { status: novoStatus },
    user,
  });
  if (primeiroRecebimento) {
    historico.registrar({ protocoloId, acao: "etiqueta.recebimento", campo: "data_recebimento", valorAnterior: null, valorNovo: now, user });
  }
  registrarConsultaCore({
    numeroPesquisado: numeroPesquisado || "",
    resultado: "encontrado_unico",
    protocoloId,
    campoCorrespondido: campoCorrespondido || "",
    acaoRealizada: `status -> ${novoStatus}`,
    user,
  });

  return db.prepare("SELECT * FROM rma_protocolos WHERE id = ?").get(protocoloId);
});

module.exports = { buscar, registrarConsulta, marcarRecebido };
