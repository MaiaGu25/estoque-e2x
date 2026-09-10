const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { db, transaction, nowStamp, ORIGINAL_DIR, OPTIMIZED_DIR, THUMBNAILS_DIR } = require("./db");
const { originalStorage, optimizedStorage, thumbnailStorage } = require("./storage");
const { processarImagem, LIMITES } = require("./processing");
const { validarCamposProduto, normalizarSku, limparTexto, DadosInvalidosError } = require("./validation");
const { registrarAuditoria } = require("./auditoria");
const { invalidarCacheDoSku } = require("./apiClient");

class NaoEncontradoError extends Error {}
class ConflitoError extends Error {
  constructor(message, detalhes) {
    super(message);
    this.detalhes = detalhes;
  }
}

const EXTENSAO_POR_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MIME_POR_EXTENSAO = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const LIXEIRA_DIAS = Number(process.env.CENTRAL_FOTOS_LIXEIRA_DIAS || 30);

function decodificarDataUrl(dataUrl) {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new DadosInvalidosError("Envie a foto em um formato válido.");
  return Buffer.from(match[1], "base64");
}

function mimeDaChave(chave) {
  return MIME_POR_EXTENSAO[path.extname(chave || "").toLowerCase()] || "application/octet-stream";
}

function buscarProdutoBruto(id) {
  return db.prepare("SELECT * FROM cf_produtos WHERE id = ?").get(id);
}

function garantirProduto(produtoId) {
  const p = buscarProdutoBruto(produtoId);
  if (!p) throw new NaoEncontradoError("Produto não encontrado.");
  return p;
}

function contarImagensAtivas(produtoId) {
  return db.prepare("SELECT COUNT(*) AS n FROM cf_imagens WHERE produto_id = ? AND status = 'ativa'").get(produtoId).n;
}

function montarImagemPublica(img) {
  return {
    id: img.id,
    principal: !!img.principal,
    ordem: img.ordem,
    nomeOriginal: img.nome_original,
    mimeType: img.mime_type,
    tamanhoBytes: img.tamanho_bytes,
    tamanhoOtimizadaBytes: img.tamanho_otimizada_bytes,
    tamanhoMiniaturaBytes: img.tamanho_miniatura_bytes,
    largura: img.largura,
    altura: img.altura,
    status: img.status,
    excluidaEm: img.excluida_em,
    excluidaPorNome: img.excluida_por_nome,
    createdByNome: img.created_by_nome,
    createdAt: img.created_at,
    updatedAt: img.updated_at,
    thumbnailUrl: `/api/central-fotos/images/${img.id}/thumbnail`,
    optimizedUrl: `/api/central-fotos/images/${img.id}/optimized`,
    originalUrl: `/api/central-fotos/images/${img.id}/original`,
  };
}

function montarProdutoResumo(p) {
  return {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    categoria: p.categoria,
    ativo: !!p.ativo,
    qtdFotos: p.qtd_fotos,
    temPrincipal: !!p.tem_principal,
    thumbnailUrl: p.foto_principal_id ? `/api/central-fotos/images/${p.foto_principal_id}/thumbnail` : null,
    updatedAt: p.updated_at,
  };
}

function buscarProdutoDetalhado(id) {
  const p = buscarProdutoBruto(id);
  if (!p) return null;
  const imagens = db
    .prepare("SELECT * FROM cf_imagens WHERE produto_id = ? AND status = 'ativa' ORDER BY principal DESC, ordem ASC")
    .all(id)
    .map(montarImagemPublica);
  const imagensExcluidas = db
    .prepare("SELECT * FROM cf_imagens WHERE produto_id = ? AND status = 'excluida' ORDER BY excluida_em DESC")
    .all(id)
    .map(montarImagemPublica);
  const tamanhoTotalBytes = imagens.reduce((s, i) => s + i.tamanhoBytes + i.tamanhoOtimizadaBytes + i.tamanhoMiniaturaBytes, 0);
  return {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    descricao: p.descricao,
    categoria: p.categoria,
    observacao: p.observacao,
    ativo: !!p.ativo,
    createdByNome: p.created_by_nome,
    updatedByNome: p.updated_by_nome,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    imagens,
    imagensExcluidas,
    tamanhoTotalBytes,
    limiteFotos: LIMITES.fotosPorProduto,
    diasRetencaoLixeira: LIXEIRA_DIAS,
  };
}

// ---- Produtos ----

function listarProdutos({ busca = "", categoria = "", status = "todos", foto = "todos", pagina = 1, porPagina = 24 } = {}) {
  const where = [];
  const params = [];
  const buscaLimpa = limparTexto(busca);
  if (buscaLimpa) {
    where.push("(p.sku LIKE ? OR p.nome LIKE ? OR p.categoria LIKE ?)");
    const like = `%${buscaLimpa}%`;
    params.push(like, like, like);
  }
  if (categoria) {
    where.push("p.categoria = ?");
    params.push(categoria);
  }
  if (status === "ativos") where.push("p.ativo = 1");
  if (status === "inativos") where.push("p.ativo = 0");
  if (foto === "com_principal") {
    where.push("EXISTS (SELECT 1 FROM cf_imagens i WHERE i.produto_id = p.id AND i.principal = 1 AND i.status='ativa')");
  }
  if (foto === "sem_principal") {
    where.push("NOT EXISTS (SELECT 1 FROM cf_imagens i WHERE i.produto_id = p.id AND i.principal = 1 AND i.status='ativa')");
  }
  if (foto === "com_adicionais") {
    where.push("(SELECT COUNT(*) FROM cf_imagens i WHERE i.produto_id = p.id AND i.principal = 0 AND i.status='ativa') > 0");
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cf_produtos p ${whereSql}`).get(...params).n;

  const limite = Math.min(Math.max(Number(porPagina) || 24, 1), 100);
  const paginaSegura = Math.max(Number(pagina) || 1, 1);
  const offset = (paginaSegura - 1) * limite;
  const skuExato = normalizarSku(buscaLimpa);

  const linhas = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM cf_imagens i WHERE i.produto_id = p.id AND i.status='ativa') AS qtd_fotos,
        (SELECT i.id FROM cf_imagens i WHERE i.produto_id = p.id AND i.principal = 1 AND i.status='ativa' LIMIT 1) AS foto_principal_id,
        (SELECT 1 FROM cf_imagens i WHERE i.produto_id = p.id AND i.principal = 1 AND i.status='ativa' LIMIT 1) AS tem_principal
       FROM cf_produtos p
       ${whereSql}
       ORDER BY (p.sku_normalizado = ?) DESC, p.nome COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, skuExato, limite, offset);

  return {
    produtos: linhas.map(montarProdutoResumo),
    total,
    pagina: paginaSegura,
    porPagina: limite,
    totalPaginas: Math.max(Math.ceil(total / limite), 1),
  };
}

function listarCategorias() {
  return db
    .prepare("SELECT DISTINCT categoria FROM cf_produtos WHERE categoria != '' ORDER BY categoria COLLATE NOCASE")
    .all()
    .map((r) => r.categoria);
}

function criarProduto(body, user) {
  const dados = validarCamposProduto(body);
  const existente = db.prepare("SELECT id FROM cf_produtos WHERE sku_normalizado = ?").get(dados.skuNormalizado);
  if (existente) throw new ConflitoError("Já existe um produto com esse SKU.");

  const now = nowStamp();
  const result = db
    .prepare(
      `INSERT INTO cf_produtos (sku,sku_normalizado,nome,descricao,categoria,observacao,ativo,created_by,created_by_nome,updated_by,updated_by_nome,created_at,updated_at)
       VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?)`
    )
    .run(dados.sku, dados.skuNormalizado, dados.nome, dados.descricao, dados.categoria, dados.observacao, user.id, user.name, user.id, user.name, now, now);
  const id = result.lastInsertRowid;
  registrarAuditoria({ acao: "produto.criado", entidade: "produto", entidadeId: id, produtoId: id, sku: dados.sku, user, dadosNovos: dados });
  return buscarProdutoDetalhado(id);
}

function atualizarProduto(id, body, user) {
  const atual = buscarProdutoBruto(id);
  if (!atual) throw new NaoEncontradoError("Produto não encontrado.");

  const now = nowStamp();
  const fields = [];
  const values = [];

  // Trocar o SKU não quebra nada porque o relacionamento com as imagens
  // usa o ID internamente - mas ainda assim precisa checar unicidade e
  // registrar auditoria própria (a confirmação em si acontece no front).
  if (typeof body.sku === "string") {
    const novoSku = limparTexto(body.sku);
    const novoSkuNormalizado = normalizarSku(novoSku);
    if (!novoSku) throw new DadosInvalidosError("O SKU não pode ficar vazio.");
    if (novoSkuNormalizado !== atual.sku_normalizado) {
      const conflito = db.prepare("SELECT id FROM cf_produtos WHERE sku_normalizado = ? AND id != ?").get(novoSkuNormalizado, id);
      if (conflito) throw new ConflitoError("Já existe outro produto com esse SKU.");
      fields.push("sku = ?", "sku_normalizado = ?");
      values.push(novoSku, novoSkuNormalizado);
      registrarAuditoria({
        acao: "produto.sku_alterado",
        entidade: "produto",
        entidadeId: id,
        produtoId: id,
        sku: novoSku,
        user,
        dadosAnteriores: { sku: atual.sku },
        dadosNovos: { sku: novoSku },
      });
      invalidarCacheDoSku(atual.sku);
      invalidarCacheDoSku(novoSku);
    }
  }

  const camposSimples = { nome: "nome", descricao: "descricao", categoria: "categoria", observacao: "observacao" };
  const alteracoesSimples = {};
  for (const [campo, coluna] of Object.entries(camposSimples)) {
    if (typeof body[campo] === "string") {
      const valor = limparTexto(body[campo]);
      if (campo === "nome" && !valor) throw new DadosInvalidosError("O nome não pode ficar vazio.");
      if (valor !== atual[coluna]) {
        fields.push(`${coluna} = ?`);
        values.push(valor);
        alteracoesSimples[campo] = { de: atual[coluna], para: valor };
      }
    }
  }
  if (Object.keys(alteracoesSimples).length) {
    registrarAuditoria({ acao: "produto.editado", entidade: "produto", entidadeId: id, produtoId: id, sku: atual.sku, user, dadosAnteriores: alteracoesSimples });
  }

  if (typeof body.ativo === "boolean" && body.ativo !== !!atual.ativo) {
    fields.push("ativo = ?");
    values.push(body.ativo ? 1 : 0);
    registrarAuditoria({ acao: body.ativo ? "produto.reativado" : "produto.inativado", entidade: "produto", entidadeId: id, produtoId: id, sku: atual.sku, user });
  }

  if (!fields.length) throw new DadosInvalidosError("Nada para atualizar.");

  fields.push("updated_by = ?", "updated_by_nome = ?", "updated_at = ?");
  values.push(user.id, user.name, now, id);
  db.prepare(`UPDATE cf_produtos SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  invalidarCacheDoSku(atual.sku);

  return buscarProdutoDetalhado(id);
}

// ---- Imagens ----

async function adicionarImagem(produtoId, { nomeOriginal, dataUrl, forcarDuplicata }, user) {
  const produto = garantirProduto(produtoId);

  const atuais = contarImagensAtivas(produtoId);
  if (atuais >= LIMITES.fotosPorProduto) {
    throw new DadosInvalidosError(`Esse produto já atingiu o limite de ${LIMITES.fotosPorProduto} fotos.`);
  }

  const bufferOriginal = decodificarDataUrl(dataUrl);
  // Lança ImagemInvalidaError se o arquivo não passar nas validações -
  // nada é gravado em disco antes desse ponto.
  const processada = await processarImagem(bufferOriginal);

  const duplicata = db
    .prepare("SELECT id FROM cf_imagens WHERE produto_id = ? AND hash_sha256 = ? AND status = 'ativa'")
    .get(produtoId, processada.hash);
  if (duplicata && !forcarDuplicata) {
    throw new ConflitoError("Essa imagem já foi enviada para esse produto.", { imagemExistenteId: duplicata.id });
  }

  const uuid = crypto.randomUUID();
  const chaveOriginal = `${uuid}${EXTENSAO_POR_MIME[processada.mimeType] || ""}`;
  const chaveOtimizada = `${uuid}-otimizada${EXTENSAO_POR_MIME[processada.mimeSaida] || ""}`;
  const chaveMiniatura = `${uuid}-miniatura${EXTENSAO_POR_MIME[processada.mimeSaida] || ""}`;

  const limparArquivos = async () => {
    await Promise.all([
      originalStorage.remove(chaveOriginal),
      optimizedStorage.remove(chaveOtimizada),
      thumbnailStorage.remove(chaveMiniatura),
    ]);
  };

  await originalStorage.put(chaveOriginal, bufferOriginal);
  try {
    await optimizedStorage.put(chaveOtimizada, processada.bufferOtimizada);
    await thumbnailStorage.put(chaveMiniatura, processada.bufferMiniatura);
  } catch (error) {
    await limparArquivos();
    throw error;
  }

  const now = nowStamp();
  const primeiraFoto = atuais === 0;
  const proximaOrdem = db.prepare("SELECT COALESCE(MAX(ordem),-1) AS m FROM cf_imagens WHERE produto_id = ? AND status='ativa'").get(produtoId).m + 1;

  let novaImagemId;
  try {
    const run = transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO cf_imagens
           (produto_id,principal,ordem,storage_key_original,storage_key_otimizada,storage_key_miniatura,nome_original,mime_type,
            tamanho_bytes,tamanho_otimizada_bytes,tamanho_miniatura_bytes,largura,altura,hash_sha256,status,created_by,created_by_nome,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ativa',?,?,?,?)`
        )
        .run(
          produtoId,
          primeiraFoto ? 1 : 0,
          proximaOrdem,
          chaveOriginal,
          chaveOtimizada,
          chaveMiniatura,
          String(nomeOriginal || "").slice(0, 255),
          processada.mimeType,
          bufferOriginal.length,
          processada.bufferOtimizada.length,
          processada.bufferMiniatura.length,
          processada.largura,
          processada.altura,
          processada.hash,
          user.id,
          user.name,
          now,
          now
        );
      return result.lastInsertRowid;
    });
    novaImagemId = run();
  } catch (error) {
    // O banco falhou depois dos arquivos já gravados - remove pra não
    // deixar arquivo órfão sem registro nenhum.
    await limparArquivos();
    throw error;
  }

  registrarAuditoria({
    acao: "imagem.enviada",
    entidade: "imagem",
    entidadeId: novaImagemId,
    produtoId,
    sku: produto.sku,
    user,
    dadosNovos: { nomeOriginal, mimeType: processada.mimeType, tamanhoBytes: bufferOriginal.length, principal: primeiraFoto },
  });
  invalidarCacheDoSku(produto.sku);

  return buscarProdutoDetalhado(produtoId);
}

function definirPrincipal(produtoId, imagemId, user) {
  const produto = garantirProduto(produtoId);
  const alvo = db.prepare("SELECT * FROM cf_imagens WHERE id = ? AND produto_id = ? AND status='ativa'").get(imagemId, produtoId);
  if (!alvo) throw new NaoEncontradoError("Imagem não encontrada nesse produto.");
  if (!alvo.principal) {
    const run = transaction(() => {
      const now = nowStamp();
      db.prepare("UPDATE cf_imagens SET principal = 0, updated_at = ? WHERE produto_id = ? AND principal = 1 AND status='ativa'").run(now, produtoId);
      db.prepare("UPDATE cf_imagens SET principal = 1, updated_at = ? WHERE id = ?").run(now, imagemId);
    });
    run();
    registrarAuditoria({ acao: "imagem.principal_alterada", entidade: "imagem", entidadeId: imagemId, produtoId, sku: produto.sku, user, dadosNovos: { novaPrincipalId: imagemId } });
    invalidarCacheDoSku(produto.sku);
  }
  return buscarProdutoDetalhado(produtoId);
}

function reordenarImagens(produtoId, ordemIds, user) {
  const produto = garantirProduto(produtoId);
  if (!Array.isArray(ordemIds) || !ordemIds.length) throw new DadosInvalidosError("Informe a nova ordem das imagens.");

  const idsEnviados = ordemIds.map(Number);
  if (idsEnviados.some((n) => !Number.isInteger(n))) throw new DadosInvalidosError("Lista de ordenação inválida.");

  const ativas = db.prepare("SELECT id FROM cf_imagens WHERE produto_id = ? AND status='ativa'").all(produtoId).map((r) => r.id);
  const setEnviado = new Set(idsEnviados);
  const setAtual = new Set(ativas);
  if (setEnviado.size !== setAtual.size || ![...setEnviado].every((id) => setAtual.has(id))) {
    throw new DadosInvalidosError("A lista de ordenação precisa conter exatamente as imagens ativas desse produto.");
  }

  const run = transaction(() => {
    const now = nowStamp();
    idsEnviados.forEach((id, index) => {
      db.prepare("UPDATE cf_imagens SET ordem = ?, updated_at = ? WHERE id = ? AND produto_id = ?").run(index, now, id, produtoId);
    });
  });
  run();

  registrarAuditoria({ acao: "imagem.reordenada", entidade: "produto", entidadeId: produtoId, produtoId, sku: produto.sku, user, dadosNovos: { ordem: idsEnviados } });
  invalidarCacheDoSku(produto.sku);
  return buscarProdutoDetalhado(produtoId);
}

function excluirImagem(produtoId, imagemId, { novaPrincipalId } = {}, user) {
  const produto = garantirProduto(produtoId);
  const alvo = db.prepare("SELECT * FROM cf_imagens WHERE id = ? AND produto_id = ? AND status='ativa'").get(imagemId, produtoId);
  if (!alvo) throw new NaoEncontradoError("Imagem não encontrada nesse produto.");

  const run = transaction(() => {
    const now = nowStamp();
    db.prepare(
      "UPDATE cf_imagens SET status='excluida', principal=0, excluida_em=?, excluida_por=?, excluida_por_nome=?, updated_at=? WHERE id=?"
    ).run(now, user.id, user.name, now, imagemId);

    if (alvo.principal) {
      let proximaId = null;
      if (novaPrincipalId) {
        const escolhida = db.prepare("SELECT id FROM cf_imagens WHERE id = ? AND produto_id = ? AND status='ativa'").get(Number(novaPrincipalId), produtoId);
        if (!escolhida) throw new DadosInvalidosError("A imagem escolhida como nova principal não é válida.");
        proximaId = escolhida.id;
      } else {
        const proxima = db.prepare("SELECT id FROM cf_imagens WHERE produto_id = ? AND status='ativa' ORDER BY ordem ASC LIMIT 1").get(produtoId);
        proximaId = proxima ? proxima.id : null;
      }
      if (proximaId) db.prepare("UPDATE cf_imagens SET principal = 1, updated_at = ? WHERE id = ?").run(now, proximaId);
    }
  });
  run();

  registrarAuditoria({ acao: "imagem.excluida", entidade: "imagem", entidadeId: imagemId, produtoId, sku: produto.sku, user, dadosAnteriores: { eraPrincipal: !!alvo.principal } });
  invalidarCacheDoSku(produto.sku);
  return buscarProdutoDetalhado(produtoId);
}

function restaurarImagem(produtoId, imagemId, user) {
  const produto = garantirProduto(produtoId);
  const alvo = db.prepare("SELECT * FROM cf_imagens WHERE id = ? AND produto_id = ? AND status='excluida'").get(imagemId, produtoId);
  if (!alvo) throw new NaoEncontradoError("Imagem não encontrada na lixeira desse produto.");

  const prazoMs = LIXEIRA_DIAS * 24 * 60 * 60 * 1000;
  const excluidaEm = new Date(String(alvo.excluida_em).replace(" ", "T") + "Z").getTime();
  if (Date.now() - excluidaEm > prazoMs) {
    throw new DadosInvalidosError(`O prazo de ${LIXEIRA_DIAS} dias para recuperar essa imagem já passou.`);
  }

  const now = nowStamp();
  db.prepare("UPDATE cf_imagens SET status='ativa', excluida_em=NULL, excluida_por=NULL, excluida_por_nome='', updated_at=? WHERE id=?").run(now, imagemId);

  registrarAuditoria({ acao: "imagem.restaurada", entidade: "imagem", entidadeId: imagemId, produtoId, sku: produto.sku, user });
  invalidarCacheDoSku(produto.sku);
  return buscarProdutoDetalhado(produtoId);
}

// Lê os bytes de uma variante já pronta pra servir por HTTP (rotas
// /images/:id/thumbnail|optimized|original). Retorna null se a imagem,
// o arquivo dessa variante, ou a própria imagem (excluída) não existir -
// a rota decide o 404, esta função não lança erro pra esse caso comum.
async function lerVarianteImagem(imagemId, variante) {
  const img = db.prepare("SELECT * FROM cf_imagens WHERE id = ?").get(Number(imagemId));
  if (!img || img.status !== "ativa") return null;

  let storage, chave;
  if (variante === "original") {
    storage = originalStorage;
    chave = img.storage_key_original;
  } else if (variante === "optimized") {
    storage = optimizedStorage;
    chave = img.storage_key_otimizada;
  } else if (variante === "thumbnail") {
    storage = thumbnailStorage;
    chave = img.storage_key_miniatura;
  } else {
    return null;
  }
  if (!chave) return null;

  const buffer = await storage.get(chave).catch(() => null);
  if (!buffer) return null;

  return {
    buffer,
    mimeType: variante === "original" ? img.mime_type : mimeDaChave(chave),
    etag: `"${variante}-${img.hash_sha256}"`,
    nomeOriginal: img.nome_original,
  };
}

// ---- Manutenção administrativa ----

async function limparLixeira(user) {
  const prazoMs = LIXEIRA_DIAS * 24 * 60 * 60 * 1000;
  const candidatas = db.prepare("SELECT * FROM cf_imagens WHERE status='excluida'").all();
  let removidas = 0;
  for (const img of candidatas) {
    const excluidaEm = new Date(String(img.excluida_em).replace(" ", "T") + "Z").getTime();
    if (Date.now() - excluidaEm <= prazoMs) continue;
    await originalStorage.remove(img.storage_key_original);
    if (img.storage_key_otimizada) await optimizedStorage.remove(img.storage_key_otimizada);
    if (img.storage_key_miniatura) await thumbnailStorage.remove(img.storage_key_miniatura);
    db.prepare("DELETE FROM cf_imagens WHERE id = ?").run(img.id);
    registrarAuditoria({ acao: "imagem.removida_definitivamente", entidade: "imagem", entidadeId: img.id, produtoId: img.produto_id, user, dadosAnteriores: { excluidaEm: img.excluida_em } });
    removidas++;
  }
  return { removidas };
}

async function diagnostico() {
  const imagens = db.prepare("SELECT * FROM cf_imagens WHERE status='ativa'").all();
  const semOriginal = [];
  const semOtimizada = [];
  const semMiniatura = [];
  for (const img of imagens) {
    if (!(await originalStorage.exists(img.storage_key_original))) semOriginal.push(img.id);
    if (img.storage_key_otimizada && !(await optimizedStorage.exists(img.storage_key_otimizada))) semOtimizada.push(img.id);
    if (img.storage_key_miniatura && !(await thumbnailStorage.exists(img.storage_key_miniatura))) semMiniatura.push(img.id);
  }

  const contagemHash = new Map();
  for (const img of imagens) {
    const chave = `${img.produto_id}:${img.hash_sha256}`;
    contagemHash.set(chave, (contagemHash.get(chave) || 0) + 1);
  }
  const hashesDuplicados = [...contagemHash.entries()].filter(([, n]) => n > 1).map(([chave]) => chave);

  const listarOrfaos = async (dir, chavesValidas) => {
    let nomes = [];
    try {
      nomes = await fs.readdir(dir);
    } catch {
      return [];
    }
    return nomes.filter((n) => !chavesValidas.has(n));
  };
  const orfaos = {
    original: await listarOrfaos(ORIGINAL_DIR, new Set(imagens.map((i) => i.storage_key_original))),
    otimizada: await listarOrfaos(OPTIMIZED_DIR, new Set(imagens.map((i) => i.storage_key_otimizada).filter(Boolean))),
    miniatura: await listarOrfaos(THUMBNAILS_DIR, new Set(imagens.map((i) => i.storage_key_miniatura).filter(Boolean))),
  };

  return { imagensSemArquivoOriginal: semOriginal, imagensSemOtimizada: semOtimizada, imagensSemMiniatura: semMiniatura, hashesDuplicados, arquivosOrfaos: orfaos };
}

function visaoGeral() {
  const produtosCadastrados = db.prepare("SELECT COUNT(*) AS n FROM cf_produtos").get().n;
  const produtosComFoto = db.prepare("SELECT COUNT(DISTINCT produto_id) AS n FROM cf_imagens WHERE status='ativa'").get().n;
  const totalImagens = db.prepare("SELECT COUNT(*) AS n FROM cf_imagens WHERE status='ativa'").get().n;
  const tamanhos = db
    .prepare(
      "SELECT COALESCE(SUM(tamanho_bytes),0) AS orig, COALESCE(SUM(tamanho_otimizada_bytes),0) AS otim, COALESCE(SUM(tamanho_miniatura_bytes),0) AS mini FROM cf_imagens WHERE status='ativa'"
    )
    .get();
  const ultimosEnvios = db
    .prepare(
      `SELECT i.id, i.nome_original, i.created_at, i.created_by_nome, p.sku, p.nome AS produto_nome
       FROM cf_imagens i JOIN cf_produtos p ON p.id = i.produto_id
       WHERE i.status='ativa' ORDER BY i.created_at DESC, i.id DESC LIMIT 10`
    )
    .all();

  return {
    produtosCadastrados,
    produtosComFoto,
    produtosSemFoto: produtosCadastrados - produtosComFoto,
    totalImagens,
    espacoOriginaisBytes: tamanhos.orig,
    espacoOtimizadasBytes: tamanhos.otim,
    espacoMiniaturasBytes: tamanhos.mini,
    ultimosEnvios: ultimosEnvios.map((e) => ({
      imagemId: e.id,
      nomeOriginal: e.nome_original,
      sku: e.sku,
      produtoNome: e.produto_nome,
      criadoPor: e.created_by_nome,
      createdAt: e.created_at,
    })),
  };
}

module.exports = {
  NaoEncontradoError,
  ConflitoError,
  DadosInvalidosError,
  listarProdutos,
  listarCategorias,
  buscarProdutoDetalhado,
  criarProduto,
  atualizarProduto,
  adicionarImagem,
  definirPrincipal,
  reordenarImagens,
  excluirImagem,
  restaurarImagem,
  lerVarianteImagem,
  limparLixeira,
  diagnostico,
  visaoGeral,
};
