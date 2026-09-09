// Sugere o próximo código sequencial dado um prefixo (ex.: "F" a partir de
// ["F01","F02"] sugere "F03"). Usado só para pré-preencher formulários -
// o código final digitado pelo usuário é sempre validado/único no banco.
function proximoCodigo(prefixo, existentes) {
  let max = 0;
  const re = new RegExp(`^${prefixo}(\\d+)$`, "i");
  for (const c of existentes) {
    const m = re.exec(c);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefixo}${String(max + 1).padStart(2, "0")}`;
}

// Identificador final e imutável de uma posição de armazenagem, ex.:
// F01-C02-M05-N03. Gerado uma vez na criação e nunca recalculado depois,
// mesmo que o nome amigável (name) do montante/corredor/fileira mude.
function codigoPosicao(rowCode, aisleCode, rackCode, levelNumber) {
  return `${rowCode}-${aisleCode}-${rackCode}-N${String(levelNumber).padStart(2, "0")}`;
}

module.exports = { proximoCodigo, codigoPosicao };
