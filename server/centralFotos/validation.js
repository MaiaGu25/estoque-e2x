// SKU é tratado sempre como texto (preserva zeros à esquerda) e é único
// sem diferenciar maiúsculas/minúsculas - normalizarSku() é o valor usado
// pra checar duplicidade; "sku" guarda a grafia como a pessoa digitou.
function normalizarSku(sku) {
  return String(sku || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function limparTexto(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ");
}

class DadosInvalidosError extends Error {}

function validarCamposProduto(body, { exigirSku = true } = {}) {
  const sku = limparTexto(body.sku);
  const nome = limparTexto(body.nome);

  if (exigirSku && !sku) throw new DadosInvalidosError("Informe o SKU do produto.");
  if (!nome) throw new DadosInvalidosError("Informe o nome do produto.");

  return {
    sku,
    skuNormalizado: normalizarSku(sku),
    nome,
    descricao: limparTexto(body.descricao),
    categoria: limparTexto(body.categoria),
    observacao: limparTexto(body.observacao),
  };
}

module.exports = { normalizarSku, limparTexto, validarCamposProduto, DadosInvalidosError };
