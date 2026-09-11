const ExcelJS = require("exceljs");
const { transaction } = require("../../db");
const { gerarPlanilha } = require("../../xlsx");
const opcoes = require("./opcoes");
const protocolos = require("./protocolos");

// Colunas compartilhadas pelo export, pelo modelo de importação e pelo
// parser de importação - um único lugar decide "o que é uma coluna de
// protocolo do RMA/SAC" nos três casos.
const COLUNAS_EXPORT = [
  { key: "numero_protocolo", header: "Nº do protocolo", minWidth: 16 },
  { key: "status_label", header: "Status" },
  { key: "cliente_nome", header: "Cliente", wrap: true },
  { key: "cliente_cpf_cnpj", header: "CPF/CNPJ" },
  { key: "canal_compra_label", header: "Canal de compra" },
  { key: "numero_pedido", header: "Nº do pedido" },
  { key: "numero_sistema", header: "Nº do sistema" },
  { key: "numero_envio", header: "Nº do envio" },
  { key: "numero_reversa", header: "Nº da reversa" },
  { key: "numero_rastreio", header: "Nº de rastreio" },
  { key: "descricao_reclamacao", header: "Reclamação", wrap: true, maxWidth: 44 },
  { key: "data_abertura", header: "Aberto em", type: "date" },
  { key: "data_recebimento", header: "Recebido em", type: "date" },
  { key: "data_encerramento", header: "Encerrado em", type: "date" },
];

async function exportarProtocolos(filtros, geradoPor) {
  const { linhas } = protocolos.listar({ ...filtros, pagina: 1, porPagina: 5000 });
  const linhasFormatadas = linhas.map((l) => ({
    ...l,
    status_label: opcoes.rotuloDe("status", l.status),
    canal_compra_label: opcoes.rotuloDe("canal_compra", l.canal_compra),
  }));
  return gerarPlanilha({
    titulo: "RMA / SAC - Protocolos",
    periodo: "Conforme filtros aplicados na tela",
    geradoPor,
    colunas: COLUNAS_EXPORT,
    linhas: linhasFormatadas,
  });
}

// Colunas aceitas na importação - só os campos de cadastro inicial do
// protocolo (o resto é preenchido depois, pelas etapas normais do
// wizard). "status" é opcional (assume "em_aberto").
const COLUNAS_IMPORT = [
  { header: "Nome do cliente", campo: "clienteNome", obrigatorio: true },
  { header: "CPF/CNPJ do cliente", campo: "clienteCpfCnpj", obrigatorio: false },
  { header: "Canal de compra", campo: "canalCompra", obrigatorio: true },
  { header: "Nº do pedido", campo: "numeroPedido", obrigatorio: true },
  { header: "Nº do sistema", campo: "numeroSistema", obrigatorio: false },
  { header: "Nº do envio", campo: "numeroEnvio", obrigatorio: false },
  { header: "Nº da reversa", campo: "numeroReversa", obrigatorio: false },
  { header: "Nº de rastreio", campo: "numeroRastreio", obrigatorio: false },
  { header: "Descrição da reclamação", campo: "descricaoReclamacao", obrigatorio: true },
];

async function gerarModeloImportacao() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Modelo");
  ws.addRow(COLUNAS_IMPORT.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  ws.addRow([
    "Maria da Silva",
    "123.456.789-00",
    opcoes.rotuloDe("canal_compra", "mercado_livre") || "Mercado Livre",
    "PED-000123",
    "",
    "",
    "",
    "BR000000000",
    "Produto chegou com defeito de fábrica",
  ]);
  COLUNAS_IMPORT.forEach((_, i) => {
    ws.getColumn(i + 1).width = 24;
  });
  return wb.xlsx.writeBuffer();
}

// Lê a planilha e valida linha a linha, sem gravar nada ainda - usado
// tanto para a pré-visualização quanto como primeiro passo da
// confirmação (a confirmação nunca pula a validação).
async function lerEValidar(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A planilha está vazia.");

  // Array.from (não .map) porque row.values do exceljs vem esparso
  // (posição 0 sempre "vazia"); .map pula buracos e deixaria "undefined"
  // no meio do array, quebrando o find abaixo.
  const cabecalho = Array.from(ws.getRow(1).values || [], (v) => String(v || "").trim());
  const indicePorCampo = {};
  for (const col of COLUNAS_IMPORT) {
    const indice = cabecalho.findIndex((h) => h.toLowerCase() === col.header.toLowerCase());
    if (indice === -1 && col.obrigatorio) {
      throw new Error(`Coluna obrigatória não encontrada na planilha: "${col.header}". Baixe o modelo para conferir os nomes esperados.`);
    }
    indicePorCampo[col.campo] = indice;
  }

  const linhas = [];
  for (let numeroLinha = 2; numeroLinha <= ws.rowCount; numeroLinha += 1) {
    const row = ws.getRow(numeroLinha);
    if (!row.values || row.values.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;

    const dados = {};
    for (const col of COLUNAS_IMPORT) {
      const indice = indicePorCampo[col.campo];
      dados[col.campo] = indice > -1 ? String(row.getCell(indice).value ?? "").trim() : "";
    }

    const erros = [];
    for (const col of COLUNAS_IMPORT) {
      if (col.obrigatorio && !dados[col.campo]) erros.push(`"${col.header}" é obrigatório.`);
    }
    const canalValor = opcoes
      .listar("canal_compra")
      .find((o) => o.rotulo.toLowerCase() === dados.canalCompra.toLowerCase() || o.valor === dados.canalCompra)?.valor;
    if (dados.canalCompra && !canalValor) {
      erros.push(`Canal de compra "${dados.canalCompra}" não é uma opção cadastrada e ativa.`);
    }
    if (!erros.length) {
      const duplicados = protocolos.verificarDuplicidade({
        numeroPedido: dados.numeroPedido,
        numeroRastreio: dados.numeroRastreio,
        cpfCnpj: dados.clienteCpfCnpj,
      });
      if (duplicados.length) {
        erros.push(`Já existe um protocolo em andamento com esse pedido/rastreio/cliente (${duplicados[0].numero_protocolo}).`);
      }
    }

    linhas.push({ numeroLinha, dados: { ...dados, canalCompra: canalValor || dados.canalCompra }, erros });
  }

  return linhas;
}

async function pesquisar(buffer) {
  const linhas = await lerEValidar(buffer);
  return {
    total: linhas.length,
    validas: linhas.filter((l) => !l.erros.length).length,
    invalidas: linhas.filter((l) => l.erros.length),
    linhas,
  };
}

// Confirma a importação: revalida do zero (nunca confia numa validação
// anterior) e só grava se TODAS as linhas estiverem válidas - tudo numa
// única transação, então ou entra tudo, ou nada entra.
async function confirmar(buffer, { user }) {
  const linhas = await lerEValidar(buffer);
  const invalidas = linhas.filter((l) => l.erros.length);
  if (invalidas.length) {
    const erro = new Error("A planilha ainda tem linhas inválidas - corrija e importe novamente.");
    erro.invalidas = invalidas;
    throw erro;
  }
  if (!linhas.length) throw new Error("Nenhuma linha válida para importar.");

  const importarTudo = transaction(() => {
    const criados = [];
    for (const linha of linhas) {
      const protocolo = protocolos.criarCore({
        dados: {
          canalCompra: linha.dados.canalCompra,
          numeroPedido: linha.dados.numeroPedido,
          numeroSistema: linha.dados.numeroSistema,
          numeroEnvio: linha.dados.numeroEnvio,
          numeroReversa: linha.dados.numeroReversa,
          numeroRastreio: linha.dados.numeroRastreio,
          descricaoReclamacao: linha.dados.descricaoReclamacao,
        },
        cliente: { nome: linha.dados.clienteNome, cpfCnpj: linha.dados.clienteCpfCnpj },
        user,
        confirmarDuplicidade: true, // já validado em lerEValidar
      });
      criados.push(protocolo.numero_protocolo);
    }
    return criados;
  });

  return importarTudo();
}

module.exports = { exportarProtocolos, gerarModeloImportacao, pesquisar, confirmar };
