const ExcelJS = require("exceljs");

const VERDE_ESCURO = "FF0B5D3B";
const VERDE_CLARO = "FFEFF8F2";
const BRANCO = "FFFFFFFF";
const CINZA_TEXTO = "FF5A6E65";
const BORDA = "FFD9E2DC";

function formatarDataHoraPtBr(raw) {
  if (!raw) return "";
  const d = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function bordaFina() {
  const estilo = { style: "thin", color: { argb: BORDA } };
  return { top: estilo, left: estilo, bottom: estilo, right: estilo };
}

// Gera um .xlsx formatado (faixa verde com o nome do sistema, título,
// período, autor e data, cabeçalho de colunas em verde, linhas
// alternadas, filtro automático, cabeçalho congelado, larguras ajustadas
// ao conteúdo e rodapé com total de registros/somas) e devolve o buffer
// pronto para enviar como download.
async function gerarPlanilha({ titulo, periodo, geradoPor, colunas, linhas, totais }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Estoque E2X";
  wb.created = new Date();

  const ws = wb.addWorksheet("Relatório", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const totalColunas = colunas.length;

  ws.mergeCells(1, 1, 1, totalColunas);
  const banner = ws.getCell(1, 1);
  banner.value = "ESTOQUE E2X";
  banner.font = { bold: true, color: { argb: BRANCO }, size: 16 };
  banner.alignment = { horizontal: "center", vertical: "middle" };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_ESCURO } };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, totalColunas);
  const tituloCell = ws.getCell(2, 1);
  tituloCell.value = titulo;
  tituloCell.font = { bold: true, size: 13 };
  tituloCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 20;

  ws.mergeCells(3, 1, 3, totalColunas);
  ws.getCell(3, 1).value = `Período: ${periodo}`;
  ws.getCell(3, 1).alignment = { horizontal: "center" };
  ws.getCell(3, 1).font = { size: 10, color: { argb: CINZA_TEXTO } };

  ws.mergeCells(4, 1, 4, totalColunas);
  ws.getCell(4, 1).value = `Gerado em ${formatarDataHoraPtBr(new Date().toISOString().slice(0, 19).replace("T", " "))} por ${geradoPor}`;
  ws.getCell(4, 1).alignment = { horizontal: "center" };
  ws.getCell(4, 1).font = { italic: true, size: 10, color: { argb: CINZA_TEXTO } };

  ws.getRow(5).height = 6;

  const linhaCabecalho = 6;
  const headerRow = ws.getRow(linhaCabecalho);
  colunas.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: BRANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_ESCURO } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = bordaFina();
  });
  headerRow.height = 22;

  ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho, column: totalColunas } };
  ws.views = [{ state: "frozen", ySplit: linhaCabecalho }];

  linhas.forEach((linha, idx) => {
    const row = ws.getRow(linhaCabecalho + 1 + idx);
    const parQualquer = idx % 2 === 1;
    colunas.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      const bruto = linha[col.key];
      if (col.type === "date") {
        cell.value = formatarDataHoraPtBr(bruto);
      } else if (col.type === "number") {
        cell.value = Number(bruto) || 0;
        cell.numFmt = "#,##0.##";
        cell.alignment = { horizontal: "right", vertical: "top" };
      } else {
        cell.value = bruto === null || bruto === undefined || bruto === "" ? "—" : String(bruto);
        cell.alignment = { wrapText: !!col.wrap, vertical: "top" };
      }
      cell.border = bordaFina();
      if (parQualquer) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_CLARO } };
      }
    });
  });

  colunas.forEach((col, i) => {
    const maiorConteudo = linhas.reduce((max, l) => {
      const v = l[col.key];
      const texto = col.type === "date" ? formatarDataHoraPtBr(v) : String(v ?? "");
      return Math.max(max, texto.length);
    }, col.header.length);
    const largura = Math.min(col.maxWidth ?? 38, Math.max(col.minWidth ?? 10, maiorConteudo + 2));
    ws.getColumn(i + 1).width = largura;
  });

  const linhaRodape = linhaCabecalho + 1 + linhas.length + 1;
  const rodapeCell = ws.getCell(linhaRodape, 1);
  rodapeCell.value = `Total de registros: ${linhas.length}`;
  rodapeCell.font = { bold: true };

  if (totais) {
    for (const key of Object.keys(totais)) {
      const colIdx = colunas.findIndex((c) => c.key === key);
      if (colIdx === -1) continue;
      const soma = linhas.reduce((s, l) => s + (Number(l[key]) || 0), 0);
      const cell = ws.getCell(linhaRodape, colIdx + 1);
      cell.value = soma;
      cell.numFmt = "#,##0.##";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
    }
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { gerarPlanilha, formatarDataHoraPtBr };
