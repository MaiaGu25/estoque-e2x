// Extrai uma SUGESTÃO de campos a partir do texto bruto reconhecido pelo
// OCR. Nunca inventa valor para o que não foi encontrado (fica vazio,
// com confiança 0) - é só um ponto de partida para o administrador
// conferir e corrigir no formulário, nunca usado para criar o pedido
// sozinho.
//
// Confiança de cada campo: 0.8 quando bate um rótulo conhecido (ex.:
// "Pedido nº"), 0.45 quando é só um palpite por formato (ex.: um número
// de 10+ dígitos solto no texto), 0 quando não encontrou nada.

function limparNumero(txt) {
  return txt.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3},)/g, "").replace(",", ".");
}

function buscar(regex, texto) {
  const m = regex.exec(texto);
  return m ? m[1].trim() : null;
}

function detectarMarketplace(texto) {
  const t = texto.toLowerCase();
  if (t.includes("mercado livre") || t.includes("mercadolivre") || t.includes("mercadolibre")) {
    return { valor: "mercado_livre", confianca: 0.8 };
  }
  if (t.includes("shopee")) return { valor: "shopee", confianca: 0.8 };
  return { valor: null, confianca: 0 };
}

function detectarNumeroPedido(texto) {
  const rotulado = buscar(/pedido\s*(?:n[ºo°.]?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9.\-]{5,25})/i, texto);
  if (rotulado) return { valor: rotulado.replace(/[.\-]$/, ""), confianca: 0.8 };
  const solto = buscar(/\b(\d{9,15})\b/, texto);
  if (solto) return { valor: solto, confianca: 0.45 };
  return { valor: null, confianca: 0 };
}

function detectarData(texto) {
  const data = buscar(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/, texto);
  if (data) return { valor: data, confianca: 0.6 };
  return { valor: null, confianca: 0 };
}

function detectarPrazoEnvio(texto) {
  const prazo = buscar(/(?:enviar|envio|expedir)\D{0,15}(\d{1,2}[\/\-.]\d{1,2}[\/\-.]?\d{0,4})/i, texto);
  if (prazo) return { valor: prazo, confianca: 0.6 };
  return { valor: null, confianca: 0 };
}

function detectarSku(texto) {
  const sku = buscar(/\b(?:sku|c[oó]digo)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_.]{2,30})/i, texto);
  if (sku) return { valor: sku, confianca: 0.7 };
  return { valor: null, confianca: 0 };
}

function detectarQuantidade(texto) {
  const rotulada = buscar(/(?:quantidade|qtd|qtde)\s*[:\-]?\s*(\d{1,4})/i, texto);
  if (rotulada) return { valor: Number(rotulada), confianca: 0.75 };
  const vezes = buscar(/\bx\s?(\d{1,3})\b/i, texto);
  if (vezes) return { valor: Number(vezes), confianca: 0.4 };
  return { valor: null, confianca: 0 };
}

function detectarValores(texto) {
  const valores = [...texto.matchAll(/R\$\s?([\d.,]{2,12})/gi)]
    .map((m) => Number(limparNumero(m[1])))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!valores.length) return { total: { valor: null, confianca: 0 }, precoUnitario: { valor: null, confianca: 0 }, frete: { valor: null, confianca: 0 } };

  const totalRotulado = buscar(/total\D{0,10}R\$\s?([\d.,]{2,12})/i, texto);
  const freteRotulado = buscar(/frete\D{0,10}R\$\s?([\d.,]{2,12})/i, texto);

  const maiorValor = Math.max(...valores);
  return {
    total: totalRotulado
      ? { valor: Number(limparNumero(totalRotulado)), confianca: 0.8 }
      : { valor: maiorValor, confianca: 0.4 },
    precoUnitario: { valor: valores.length > 1 ? Math.min(...valores) : maiorValor, confianca: 0.35 },
    frete: freteRotulado ? { valor: Number(limparNumero(freteRotulado)), confianca: 0.8 } : { valor: null, confianca: 0 },
  };
}

function parseCaptureText(texto) {
  const valores = detectarValores(texto);
  return {
    marketplace: detectarMarketplace(texto),
    numeroPedido: detectarNumeroPedido(texto),
    data: detectarData(texto),
    prazoEnvio: detectarPrazoEnvio(texto),
    sku: detectarSku(texto),
    quantidade: detectarQuantidade(texto),
    precoUnitario: valores.precoUnitario,
    total: valores.total,
    frete: valores.frete,
  };
}

module.exports = { parseCaptureText };
