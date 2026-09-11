const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");

// Implementação real do OrderCaptureReader usando tesseract.js (motor
// OCR em WASM, sem serviço pago, funciona 100% offline). Os arquivos de
// idioma vêm de pacotes npm normais (@tesseract.js-data/eng e /por) -
// para não depender de baixar nada da internet em tempo de execução
// (o worker por padrão tentaria buscar o .traineddata de um CDN, o que
// não é confiável nem em rede local nem em todo ambiente hospedado),
// os dois arquivos são copiados uma única vez para uma pasta local em
// `data/` e o worker aponta pra lá (langPath).
const DIR_IDIOMAS = path.join(__dirname, "..", "..", "..", "..", "data", "marketplace", "ocr-lang");
const DIR_CACHE = path.join(__dirname, "..", "..", "..", "..", "data", "marketplace", "ocr-cache");

function garantirArquivosDeIdioma() {
  if (!fs.existsSync(DIR_IDIOMAS)) fs.mkdirSync(DIR_IDIOMAS, { recursive: true });
  if (!fs.existsSync(DIR_CACHE)) fs.mkdirSync(DIR_CACHE, { recursive: true });
  const fontes = {
    "eng.traineddata.gz": require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"),
    "por.traineddata.gz": require.resolve("@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz"),
  };
  for (const [nome, origem] of Object.entries(fontes)) {
    const destino = path.join(DIR_IDIOMAS, nome);
    if (!fs.existsSync(destino)) fs.copyFileSync(origem, destino);
  }
}

let workerPromise = null;
function obterWorker() {
  if (!workerPromise) {
    garantirArquivosDeIdioma();
    workerPromise = createWorker("por+eng", 1, { langPath: DIR_IDIOMAS, cachePath: DIR_CACHE, gzip: true });
  }
  return workerPromise;
}

async function ler(buffer) {
  const worker = await obterWorker();
  const { data } = await worker.recognize(buffer);
  const palavras = (data.words || []).map((w) => ({ texto: w.text, confianca: w.confidence }));
  return { texto: data.text || "", confiancaMedia: data.confidence || 0, palavras };
}

module.exports = { ler };
