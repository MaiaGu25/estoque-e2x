const path = require("path");
const fs = require("fs");
const { db, transaction } = require("../../db");
const { nowStamp, saveBase64Image } = require("../../util");
const historico = require("./auditoria");

// Mesma pasta usada pelo módulo antigo (data/rma) - os anexos migrados
// dos rma_eventos antigos continuam apontando pra cá, então não há
// necessidade (nem vantagem) de mudar de lugar.
const ANEXOS_DIR = path.join(__dirname, "..", "..", "..", "data", "rma");

function listar(protocoloId) {
  return db.prepare("SELECT * FROM rma_anexos WHERE protocolo_id = ? ORDER BY id").all(protocoloId);
}

function buscarPorId(id) {
  return db.prepare("SELECT * FROM rma_anexos WHERE id = ?").get(id);
}

// Caminho no disco, só se realmente estiver dentro da pasta de anexos
// (mesma trava contra path traversal que o módulo antigo já usava).
function caminhoSeguro(anexo) {
  if (!anexo) return null;
  const base = path.resolve(ANEXOS_DIR);
  const resolvido = path.resolve(anexo.caminho_arquivo);
  if (resolvido !== base && !resolvido.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(resolvido)) return null;
  return resolvido;
}

// Versão "core" (sem BEGIN/COMMIT próprio) para poder ser chamada de
// dentro de outra transaction() (ex.: protocolos.adicionarNota).
function adicionarCore({ protocoloId, etapa, arquivoBase64, descricao, user }) {
  const protocolo = db.prepare("SELECT id FROM rma_protocolos WHERE id = ?").get(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const nomeArquivo = `${protocoloId}-${Date.now()}.jpg`;
  const caminho = saveBase64Image(ANEXOS_DIR, nomeArquivo, arquivoBase64);
  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO rma_anexos (protocolo_id,etapa,nome_arquivo,caminho_arquivo,descricao,created_by,created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(protocoloId, etapa || "", nomeArquivo, caminho, String(descricao || "").trim(), user?.id ?? null, now);
  historico.registrar({ protocoloId, acao: "anexo.adicionar", valorNovo: nomeArquivo, user });
  return buscarPorId(result.lastInsertRowid);
}

const adicionar = transaction(adicionarCore);

module.exports = { listar, buscarPorId, caminhoSeguro, adicionar, adicionarCore, ANEXOS_DIR };
