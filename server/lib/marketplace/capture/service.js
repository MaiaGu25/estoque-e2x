const fs = require("fs");
const path = require("path");
const { db } = require("../../../db");
const { nowStamp } = require("../../../util");
const { validarCaptura, nomeInternoAleatorio } = require("./validation");
const reader = require("./index");
const { parseCaptureText } = require("./parseCaptureText");
const { registrarAuditoria } = require("../audit");

const DIR_CAPTURAS = path.join(__dirname, "..", "..", "..", "..", "data", "marketplace", "capturas");
const DIAS_PARA_EXCLUIR = Number(process.env.MARKETPLACE_CAPTURE_RETENCAO_DIAS || 30);

function caminhoArquivo(nomeArquivo) {
  // path.basename corta qualquer tentativa de path traversal mesmo que
  // o nome interno já seja sempre gerado por nós (nunca vem do cliente).
  return path.join(DIR_CAPTURAS, path.basename(nomeArquivo));
}

// Salva a captura, roda o OCR e devolve os campos reconhecidos para o
// formulário sugerir - NUNCA cria pedido nem reserva estoque aqui.
async function processarCaptura(dataUrlOuBase64, user) {
  const { buffer, mimeType } = await validarCaptura(dataUrlOuBase64);
  if (!fs.existsSync(DIR_CAPTURAS)) fs.mkdirSync(DIR_CAPTURAS, { recursive: true });

  const nomeArquivo = nomeInternoAleatorio(mimeType);
  fs.writeFileSync(caminhoArquivo(nomeArquivo), buffer);

  const now = nowStamp();
  const excluirApos = new Date(Date.now() + DIAS_PARA_EXCLUIR * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const insercao = db
    .prepare(
      `INSERT INTO marketplace_manual_captures (arquivo,mime_type,tamanho_bytes,status,created_by,created_at,excluir_apos)
       VALUES (?,?,?,'processando',?,?,?)`
    )
    .run(nomeArquivo, mimeType, buffer.length, user.id, now, excluirApos);
  const capturaId = insercao.lastInsertRowid;

  try {
    const { texto, confiancaMedia } = await reader.ler(buffer);
    const camposReconhecidos = parseCaptureText(texto);
    db.prepare("UPDATE marketplace_manual_captures SET status = 'lida', dados_reconhecidos = ?, confianca_media = ? WHERE id = ?").run(
      JSON.stringify({ texto, campos: camposReconhecidos }),
      confiancaMedia,
      capturaId
    );
    registrarAuditoria({ action: "captura.lida", entityType: "marketplace_manual_captures", entityId: capturaId, user, newData: { confiancaMedia } });
    return { id: capturaId, status: "lida", texto, campos: camposReconhecidos, confiancaMedia };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido ao ler a imagem.";
    db.prepare("UPDATE marketplace_manual_captures SET status = 'falhou', dados_reconhecidos = ? WHERE id = ?").run(
      JSON.stringify({ erro: mensagem }),
      capturaId
    );
    registrarAuditoria({ action: "captura.falhou", entityType: "marketplace_manual_captures", entityId: capturaId, user, resultado: "falha" });
    return { id: capturaId, status: "falhou", erro: mensagem, campos: null, confiancaMedia: 0 };
  }
}

function descartarCaptura(id, user) {
  const captura = db.prepare("SELECT * FROM marketplace_manual_captures WHERE id = ?").get(id);
  if (!captura) throw new Error("Captura não encontrada.");
  db.prepare("UPDATE marketplace_manual_captures SET status = 'descartada' WHERE id = ?").run(id);
  try {
    fs.unlinkSync(caminhoArquivo(captura.arquivo));
  } catch {
    // arquivo já pode não existir - não é um erro que impeça descartar o registro.
  }
  registrarAuditoria({ action: "captura.descartada", entityType: "marketplace_manual_captures", entityId: id, user });
}

// Apaga do disco e do banco as capturas cujo prazo de retenção já
// passou - roda dentro do mesmo ciclo periódico da sincronização
// (server/jobs/marketplaceSync.js), já que não existe outro agendador.
function excluirCapturasExpiradas() {
  const now = nowStamp();
  const expiradas = db
    .prepare("SELECT id, arquivo FROM marketplace_manual_captures WHERE excluir_apos IS NOT NULL AND excluir_apos <= ? AND status != 'descartada'")
    .all(now);
  for (const captura of expiradas) {
    try {
      fs.unlinkSync(caminhoArquivo(captura.arquivo));
    } catch {
      // segue mesmo se o arquivo já não existir
    }
    db.prepare("UPDATE marketplace_manual_captures SET status = 'descartada' WHERE id = ?").run(captura.id);
  }
  return expiradas.length;
}

module.exports = { processarCaptura, descartarCaptura, excluirCapturasExpiradas, caminhoArquivo };
