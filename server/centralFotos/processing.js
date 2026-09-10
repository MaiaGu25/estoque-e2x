const crypto = require("crypto");
const { Jimp } = require("jimp");

const MIME_JPEG = "image/jpeg";
const MIME_PNG = "image/png";
const MIME_WEBP = "image/webp";
const MIME_PERMITIDOS = [MIME_JPEG, MIME_PNG, MIME_WEBP];

// Limites configuráveis por variável de ambiente, com um padrão seguro.
const LIMITES = {
  tamanhoMaximoBytes: Number(process.env.CENTRAL_FOTOS_MAX_FILE_MB || 10) * 1024 * 1024,
  dimensaoMaxima: Number(process.env.CENTRAL_FOTOS_MAX_DIMENSAO_PX || 8000),
  fotosPorProduto: Number(process.env.CENTRAL_FOTOS_MAX_FOTOS_POR_PRODUTO || 60),
  arquivosPorEnvio: Number(process.env.CENTRAL_FOTOS_MAX_ARQUIVOS_POR_ENVIO || 20),
  larguraOtimizada: 1800,
  ladoMiniatura: 300,
};

class ImagemInvalidaError extends Error {}

// Confere a assinatura real (magic bytes) do arquivo - nunca confia só na
// extensão do nome ou no Content-Type que o navegador declarou. SVG e
// qualquer outro formato fora dessa lista são rejeitados automaticamente
// por não terem assinatura reconhecida aqui.
function detectarTipoReal(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return MIME_JPEG;
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return MIME_PNG;
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return MIME_WEBP;
  return null;
}

function hashSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Redimensiona só se precisar (nunca aumenta imagem pequena) e sempre
// mantendo a proporção - Jimp já corrige a orientação EXIF e descarta
// metadados da câmera sozinho ao decodificar/recodificar a imagem.
async function redimensionarSeNecessario(imagem, ladoMaximo) {
  const { width, height } = imagem.bitmap;
  if (width <= ladoMaximo && height <= ladoMaximo) return imagem;
  return imagem.clone().scaleToFit({ w: ladoMaximo, h: ladoMaximo });
}

/**
 * Valida um buffer de imagem e gera as versões otimizada e miniatura.
 * Nunca modifica o buffer original recebido.
 * @returns {{ mimeType: string, largura: number, altura: number, hash: string, bufferOtimizada: Buffer, bufferMiniatura: Buffer, mimeSaida: string }}
 */
async function processarImagem(bufferOriginal) {
  if (!Buffer.isBuffer(bufferOriginal) || !bufferOriginal.length) {
    throw new ImagemInvalidaError("Arquivo vazio.");
  }
  if (bufferOriginal.length > LIMITES.tamanhoMaximoBytes) {
    throw new ImagemInvalidaError(`Arquivo maior que o limite permitido (${Math.round(LIMITES.tamanhoMaximoBytes / 1024 / 1024)}MB).`);
  }

  const tipoReal = detectarTipoReal(bufferOriginal);
  if (!tipoReal) {
    throw new ImagemInvalidaError("Formato de imagem não suportado. Envie JPEG, PNG ou WebP.");
  }

  let imagem;
  try {
    imagem = await Jimp.read(bufferOriginal);
  } catch {
    throw new ImagemInvalidaError("Não foi possível ler a imagem - o arquivo pode estar corrompido.");
  }

  const largura = imagem.bitmap.width;
  const altura = imagem.bitmap.height;
  if (!largura || !altura) throw new ImagemInvalidaError("Imagem inválida (sem dimensões).");
  if (largura > LIMITES.dimensaoMaxima || altura > LIMITES.dimensaoMaxima) {
    throw new ImagemInvalidaError(`Imagem excede a resolução máxima permitida (${LIMITES.dimensaoMaxima}px).`);
  }

  const temTransparencia = typeof imagem.hasAlpha === "function" && imagem.hasAlpha();
  // PNG preserva transparência; para o resto, JPEG dá o melhor tamanho.
  const mimeSaida = temTransparencia ? MIME_PNG : MIME_JPEG;
  const opcoesEncode = mimeSaida === MIME_JPEG ? { quality: 82 } : undefined;

  const otimizada = await redimensionarSeNecessario(imagem, LIMITES.larguraOtimizada);
  const bufferOtimizada = await otimizada.getBuffer(mimeSaida, opcoesEncode);

  const miniatura = await redimensionarSeNecessario(imagem, LIMITES.ladoMiniatura);
  const bufferMiniatura = await miniatura.getBuffer(mimeSaida, opcoesEncode);

  return {
    mimeType: tipoReal,
    largura,
    altura,
    hash: hashSha256(bufferOriginal),
    mimeSaida,
    bufferOtimizada,
    bufferMiniatura,
  };
}

module.exports = {
  ImagemInvalidaError,
  MIME_PERMITIDOS,
  LIMITES,
  detectarTipoReal,
  hashSha256,
  processarImagem,
};
