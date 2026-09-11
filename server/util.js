const fs = require("fs");
const path = require("path");

// Timestamp no mesmo formato "YYYY-MM-DD HH:MM:SS" usado pelos dados
// herdados da versão anterior, para que o frontend só precise entender um
// formato de data.
function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// Decodifica uma foto enviada como data URL (base64) do navegador e grava
// em disco. Usado pela Central de Testes e pelo RMA/SAC.
function saveBase64Image(dir, filename, dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Foto inválida.");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, filename);
  fs.writeFileSync(arquivo, Buffer.from(match[1], "base64"));
  return arquivo;
}

// Usado pelos números do protocolo de RMA/SAC (pedido, sistema, envio,
// reversa, rastreio) para aceitar o valor digitado ou lido por leitor de
// código de barras com ou sem espaço/pontuação: "AB-123 456" e "ab123456"
// viram o mesmo valor de busca. Guardado numa coluna "_normalizado" ao
// lado do valor original, nunca no lugar dele.
function normalizarNumero(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Mesma ideia, mas só dígitos - usado para CPF/CNPJ, onde pontuação nunca
// faz parte do número em si.
function normalizarDocumento(valor) {
  return String(valor || "").replace(/\D/g, "");
}

// Trava de segurança para os trechos de SQL montados dinamicamente (UPDATE
// ... SET campo = ? escolhido em tempo de execução): o nome da coluna nunca
// vem direto do que o usuário mandou, sempre de um mapa fixo no código, mas
// essa checagem garante isso também em tempo de execução - se algum dia um
// nome de coluna inválido chegar aqui (bug ou mapa mal escrito), a query
// nunca roda, só estoura erro.
const IDENTIFICADOR_SQL = /^[A-Za-z_][A-Za-z0-9_]*$/;
function coluna(nome) {
  if (typeof nome !== "string" || !IDENTIFICADOR_SQL.test(nome)) {
    throw new Error(`Nome de coluna inválido: ${nome}`);
  }
  return nome;
}

module.exports = { nowStamp, saveBase64Image, normalizarNumero, normalizarDocumento, coluna };
