const crypto = require("crypto");
const { Jimp } = require("jimp");

// Mesmo critério de detecção por assinatura de bytes (magic number) já
// usado pela Central de Fotos - nunca confia na extensão do arquivo nem
// no Content-Type informado pelo navegador.
const MIME_JPEG = "image/jpeg";
const MIME_PNG = "image/png";
const MIME_WEBP = "image/webp";
const MIME_PERMITIDOS = [MIME_JPEG, MIME_PNG, MIME_WEBP];

const LIMITES = {
  tamanhoMaximoBytes: Number(process.env.MARKETPLACE_CAPTURE_MAX_FILE_MB || 8) * 1024 * 1024,
  dimensaoMaxima: Number(process.env.MARKETPLACE_CAPTURE_MAX_DIMENSAO_PX || 6000),
  dimensaoMinima: 40,
};

class ImagemInvalidaError extends Error {}

function detectarMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return MIME_JPEG;
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return MIME_PNG;
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return MIME_WEBP;
  return null;
}

// Aceita tanto um data URL (data:image/...;base64,...) quanto base64 cru.
function decodificarDataUrl(dataUrlOuBase64) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrlOuBase64 || "");
  const base64 = match ? match[1] : dataUrlOuBase64;
  if (!base64) throw new ImagemInvalidaError("Nenhuma imagem enviada.");
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new ImagemInvalidaError("Arquivo corrompido ou em formato inválido.");
  }
  if (!buffer.length) throw new ImagemInvalidaError("Arquivo vazio.");
  return buffer;
}

async function validarCaptura(dataUrlOuBase64) {
  const buffer = decodificarDataUrl(dataUrlOuBase64);
  if (buffer.length > LIMITES.tamanhoMaximoBytes) {
    throw new ImagemInvalidaError(`Arquivo maior que o limite de ${Math.round(LIMITES.tamanhoMaximoBytes / 1024 / 1024)}MB.`);
  }
  const mimeType = detectarMime(buffer);
  if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
    throw new ImagemInvalidaError("Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.");
  }
  let imagem;
  try {
    imagem = await Jimp.read(buffer);
  } catch {
    throw new ImagemInvalidaError("Não foi possível ler a imagem - o arquivo pode estar corrompido.");
  }
  const { width, height } = imagem.bitmap;
  if (width < LIMITES.dimensaoMinima || height < LIMITES.dimensaoMinima) {
    throw new ImagemInvalidaError("Imagem pequena demais para ser lida.");
  }
  if (width > LIMITES.dimensaoMaxima || height > LIMITES.dimensaoMaxima) {
    throw new ImagemInvalidaError(`Imagem maior que o limite de ${LIMITES.dimensaoMaxima}px.`);
  }

  return { buffer, mimeType, width, height };
}

// Nome interno aleatório - nunca usa o nome original do arquivo enviado
// (evita expor caminho físico e path traversal).
function nomeInternoAleatorio(mimeType) {
  const extensao = mimeType === MIME_PNG ? "png" : mimeType === MIME_WEBP ? "webp" : "jpg";
  return `${crypto.randomBytes(20).toString("hex")}.${extensao}`;
}

module.exports = { validarCaptura, nomeInternoAleatorio, ImagemInvalidaError, LIMITES };
