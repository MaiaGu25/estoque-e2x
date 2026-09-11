const { db, transaction } = require("../../db");
const { nowStamp } = require("../../util");

// Todas as listas selecionáveis do módulo RMA/SAC (status, canal de
// compra, motivo do produto, etc.) moram em uma única tabela genérica,
// rma_opcoes, diferenciadas por "tipo". Isso é o que torna cada lista
// administrável (adicionar/editar rótulo/ativar/desativar/reordenar) sem
// precisar de uma tabela por lista nem de um CHECK fixo no banco.
const TIPOS = [
  "status",
  "status_secundario",
  "canal_compra",
  "modalidade_envio",
  "canal_contato",
  "motivo_produto",
  "estado_embalagem",
  "tipo_solucao",
];

function validarTipo(tipo) {
  if (!TIPOS.includes(tipo)) throw new Error("Tipo de lista inválido.");
}

// Chave interna estável (nunca muda depois de criada, mesmo que o rótulo
// mude) - deriva do rótulo só na criação, evitando o admin ter que digitar
// duas coisas.
function gerarValor(rotulo) {
  return String(rotulo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function listar(tipo, { incluirInativos = false } = {}) {
  validarTipo(tipo);
  const condicao = incluirInativos ? "" : "AND ativo = 1";
  return db.prepare(`SELECT * FROM rma_opcoes WHERE tipo = ? ${condicao} ORDER BY ordem, id`).all(tipo);
}

// Usado pela tela administrativa: todas as listas de uma vez, já
// agrupadas por tipo.
function listarTodas({ incluirInativos = true } = {}) {
  const condicao = incluirInativos ? "" : "WHERE ativo = 1";
  const linhas = db.prepare(`SELECT * FROM rma_opcoes ${condicao} ORDER BY tipo, ordem, id`).all();
  const porTipo = {};
  for (const tipo of TIPOS) porTipo[tipo] = [];
  for (const linha of linhas) porTipo[linha.tipo].push(linha);
  return porTipo;
}

// Uma opção existe (independente de ativa) - usado para validar um valor
// já gravado num protocolo antigo, que precisa continuar aparecendo do
// jeito que está mesmo se foi desativada depois.
function existe(tipo, valor) {
  if (!valor) return true; // campo vazio é sempre válido (opcional)
  return !!db.prepare("SELECT 1 FROM rma_opcoes WHERE tipo = ? AND valor = ?").get(tipo, valor);
}

// Uma opção está disponível para uso em um cadastro NOVO - precisa estar
// ativa, não basta existir.
function ativaExiste(tipo, valor) {
  if (!valor) return true;
  return !!db.prepare("SELECT 1 FROM rma_opcoes WHERE tipo = ? AND valor = ? AND ativo = 1").get(tipo, valor);
}

function rotuloDe(tipo, valor) {
  if (!valor) return "";
  const linha = db.prepare("SELECT rotulo FROM rma_opcoes WHERE tipo = ? AND valor = ?").get(tipo, valor);
  return linha ? linha.rotulo : valor;
}

const criar = transaction(({ tipo, rotulo, cor, user }) => {
  validarTipo(tipo);
  const rotuloLimpo = String(rotulo || "").trim();
  if (!rotuloLimpo) throw new Error("Informe o rótulo da opção.");
  let valor = gerarValor(rotuloLimpo);
  if (!valor) throw new Error("Rótulo inválido.");
  let sufixo = 2;
  const valorOriginal = valor;
  while (db.prepare("SELECT 1 FROM rma_opcoes WHERE tipo = ? AND valor = ?").get(tipo, valor)) {
    valor = `${valorOriginal}_${sufixo}`;
    sufixo += 1;
  }
  const maiorOrdem = db.prepare("SELECT COALESCE(MAX(ordem), 0) AS m FROM rma_opcoes WHERE tipo = ?").get(tipo).m;
  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO rma_opcoes (tipo,valor,rotulo,cor,ordem,ativo,created_at,updated_at)
       VALUES (?,?,?,?,?,1,?,?)`
    )
    .run(tipo, valor, rotuloLimpo, String(cor || "").trim(), maiorOrdem + 1, now, now);
  return db.prepare("SELECT * FROM rma_opcoes WHERE id = ?").get(result.lastInsertRowid);
});

// Só o rótulo/cor são editáveis - "valor" é a chave estável usada em todo
// protocolo já salvo com essa opção, então nunca muda.
const editar = transaction(({ id, rotulo, cor }) => {
  const opcao = db.prepare("SELECT * FROM rma_opcoes WHERE id = ?").get(id);
  if (!opcao) throw new Error("Opção não encontrada.");
  const rotuloLimpo = String(rotulo ?? opcao.rotulo).trim();
  if (!rotuloLimpo) throw new Error("Informe o rótulo da opção.");
  db.prepare("UPDATE rma_opcoes SET rotulo = ?, cor = ?, updated_at = ? WHERE id = ?").run(
    rotuloLimpo,
    cor === undefined ? opcao.cor : String(cor || "").trim(),
    nowStamp(),
    id
  );
  return db.prepare("SELECT * FROM rma_opcoes WHERE id = ?").get(id);
});

// Nunca apaga (DELETE) - só ativa/desativa. Uma opção desativada some das
// listas de opções para NOVOS cadastros, mas continua existindo e sendo
// mostrada normalmente em protocolos antigos que já a usam.
const definirAtiva = transaction(({ id, ativo }) => {
  const opcao = db.prepare("SELECT * FROM rma_opcoes WHERE id = ?").get(id);
  if (!opcao) throw new Error("Opção não encontrada.");
  db.prepare("UPDATE rma_opcoes SET ativo = ?, updated_at = ? WHERE id = ?").run(ativo ? 1 : 0, nowStamp(), id);
  return db.prepare("SELECT * FROM rma_opcoes WHERE id = ?").get(id);
});

// Reordena todas as opções de um tipo de uma vez, na ordem dos ids
// recebidos (drag-and-drop na tela administrativa).
const reordenar = transaction(({ tipo, ids }) => {
  validarTipo(tipo);
  const existentes = new Set(db.prepare("SELECT id FROM rma_opcoes WHERE tipo = ?").all(tipo).map((r) => r.id));
  if (!Array.isArray(ids) || ids.some((id) => !existentes.has(id))) {
    throw new Error("Lista de reordenação inválida.");
  }
  const now = nowStamp();
  const atualizar = db.prepare("UPDATE rma_opcoes SET ordem = ?, updated_at = ? WHERE id = ?");
  ids.forEach((id, index) => atualizar.run(index + 1, now, id));
  return listar(tipo, { incluirInativos: true });
});

module.exports = { TIPOS, listar, listarTodas, existe, ativaExiste, rotuloDe, criar, editar, definirAtiva, reordenar };
