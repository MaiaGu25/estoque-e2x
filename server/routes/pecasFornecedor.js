const express = require("express");
const { db, transaction, getMeta, setMeta } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { nowStamp } = require("../util");
const { broadcast } = require("../realtime");
const { gerarPlanilha } = require("../xlsx");

const router = express.Router();
router.use(requireAuth);

// Status da ordem inteira (o fornecedor decide o pacote todo, mesmo que
// aceite só parte das peças - o que cada peça teve de decisão é outro
// campo, "decisao").
const STATUS_LABEL = {
  em_aberto: "Em aberto",
  registrado: "Registrado",
  em_analise: "Em análise",
  revisar: "Revisar",
  liberado: "Liberado",
  concluido: "Concluído",
};

const DECISAO_LABEL = {
  pendente: "Pendente",
  aceita: "Aceita",
  recusada: "Recusada",
};

function registrarEvento(pecaId, texto, user) {
  db.prepare(
    "INSERT INTO pecas_fornecedor_eventos (peca_id,texto,responsible,created_by,created_at) VALUES (?,?,?,?,?)"
  ).run(pecaId, texto, user.name, user.id, nowStamp());
}

// Numeração sequencial por ano (RMA-20260001, RMA-20260002, ...), reinicia
// a cada ano novo. Guardada em app_meta porque node:sqlite não tem uma
// sequência nativa por chave - como cada operação do servidor roda de
// forma síncrona, ler e gravar o contador aqui dentro é seguro mesmo sem
// trava adicional.
function gerarNumeroPedido() {
  const ano = nowStamp().slice(0, 4);
  const chave = `pedido_fornecedor_seq_${ano}`;
  const proximo = (Number(getMeta(chave)) || 0) + 1;
  setMeta(chave, String(proximo));
  return `RMA-${ano}${String(proximo).padStart(4, "0")}`;
}

// ---- Fornecedores ----

function comContatos(fornecedores) {
  if (!fornecedores.length) return fornecedores;
  const ids = fornecedores.map((f) => f.id);
  const contatos = db
    .prepare(`SELECT * FROM fornecedor_contatos WHERE fornecedor_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`)
    .all(...ids);
  return fornecedores.map((f) => ({ ...f, contatos: contatos.filter((c) => c.fornecedor_id === f.id) }));
}

router.get("/fornecedores", (req, res) => {
  const fornecedores = db.prepare("SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
  res.json({ fornecedores: comContatos(fornecedores) });
});

router.post("/fornecedores", (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Digite o nome do fornecedor." });
  const contatos = (Array.isArray(b.contatos) ? b.contatos : [])
    .map((c) => ({
      nome: String(c?.nome || "").trim(),
      telefone: String(c?.telefone || "").trim(),
      email: String(c?.email || "").trim(),
    }))
    .filter((c) => c.nome || c.telefone || c.email);

  const run = transaction(() => {
    const now = nowStamp();
    const result = db
      .prepare(
        `INSERT INTO fornecedores (nome,identificacao,endereco,numero,cep,cidade,estado)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        nome,
        String(b.identificacao || "").trim(),
        String(b.endereco || "").trim(),
        String(b.numero || "").trim(),
        String(b.cep || "").trim(),
        String(b.cidade || "").trim(),
        String(b.estado || "").trim()
      );
    const fornecedorId = result.lastInsertRowid;
    for (const contato of contatos) {
      db.prepare("INSERT INTO fornecedor_contatos (fornecedor_id,nome,telefone,email,created_at) VALUES (?,?,?,?,?)").run(
        fornecedorId,
        contato.nome,
        contato.telefone,
        contato.email,
        now
      );
    }
    return fornecedorId;
  });

  try {
    const id = run();
    broadcast("pecasFornecedor");
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ error: "Já existe um fornecedor com esse nome." });
  }
});

router.patch("/fornecedores/:id", (req, res) => {
  const id = Number(req.params.id);
  const fornecedor = db.prepare("SELECT * FROM fornecedores WHERE id = ?").get(id);
  if (!fornecedor) return res.status(404).json({ error: "Fornecedor não encontrado." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  for (const key of ["nome", "identificacao", "contato", "endereco", "numero", "cep", "cidade", "estado"]) {
    if (typeof b[key] === "string") {
      fields.push(`${key} = ?`);
      values.push(b[key].trim());
    }
  }
  if (typeof b.ativo === "boolean") {
    fields.push("ativo = ?");
    values.push(b.ativo ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  values.push(id);
  try {
    db.prepare(`UPDATE fornecedores SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    broadcast("pecasFornecedor");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Já existe um fornecedor com esse nome." });
  }
});

router.post("/fornecedores/:id/contatos", (req, res) => {
  const id = Number(req.params.id);
  const fornecedor = db.prepare("SELECT id FROM fornecedores WHERE id = ?").get(id);
  if (!fornecedor) return res.status(404).json({ error: "Fornecedor não encontrado." });

  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  const telefone = String(b.telefone || "").trim();
  const email = String(b.email || "").trim();
  if (!nome && !telefone && !email) return res.status(400).json({ error: "Preencha ao menos um dado do contato." });

  const result = db
    .prepare("INSERT INTO fornecedor_contatos (fornecedor_id,nome,telefone,email,created_at) VALUES (?,?,?,?,?)")
    .run(id, nome, telefone, email, nowStamp());
  broadcast("pecasFornecedor");
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.delete("/fornecedores/:id/contatos/:contatoId", (req, res) => {
  const id = Number(req.params.id);
  const contatoId = Number(req.params.contatoId);
  const contato = db.prepare("SELECT id FROM fornecedor_contatos WHERE id = ? AND fornecedor_id = ?").get(contatoId, id);
  if (!contato) return res.status(404).json({ error: "Contato não encontrado." });

  db.prepare("DELETE FROM fornecedor_contatos WHERE id = ?").run(contatoId);
  broadcast("pecasFornecedor");
  res.json({ ok: true });
});

// ---- Peças ----

router.get("/pecas", (req, res) => {
  const { decisao, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (decisao) { where.push("p.decisao = ?"); params.push(String(decisao)); }
  if (fornecedorId) { where.push("p.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (busca) {
    where.push("(p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like);
  }
  const sql = `
    SELECT p.*, f.nome AS fornecedor_nome
    FROM pecas_fornecedor p
    JOIN fornecedores f ON f.id = p.fornecedor_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.id DESC LIMIT 500`;
  const pecas = db.prepare(sql).all(...params);
  res.json({ pecas });
});

router.get("/stats", (req, res) => {
  const porStatus = db.prepare("SELECT status, COUNT(*) AS n FROM pedidos_fornecedor GROUP BY status").all();
  const hojeInicio = nowStamp().slice(0, 10);
  const registradasHoje = db.prepare("SELECT COUNT(*) AS n FROM pedidos_fornecedor WHERE created_at >= ?").get(hojeInicio).n;
  const porFornecedor = db
    .prepare(
      `SELECT f.nome AS fornecedor, COUNT(*) AS n
       FROM pecas_fornecedor p JOIN fornecedores f ON f.id = p.fornecedor_id
       GROUP BY f.nome ORDER BY n DESC LIMIT 10`
    )
    .all();
  const porPeca = db
    .prepare(
      `SELECT COALESCE(NULLIF(codigo,''), descricao) AS chave, MAX(codigo) AS codigo, MAX(descricao) AS descricao, COUNT(*) AS n
       FROM pecas_fornecedor
       GROUP BY chave ORDER BY n DESC LIMIT 10`
    )
    .all()
    .map(({ codigo, descricao, n }) => ({ codigo, descricao, n }));
  res.json({ porStatus, registradasHoje, porFornecedor, porPeca });
});

router.post("/pecas/lote", (req, res) => {
  const b = req.body || {};
  const fornecedorId = Number(b.fornecedorId);
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!fornecedorId) return res.status(400).json({ error: "Selecione o fornecedor." });
  if (!itens.length) return res.status(400).json({ error: "Adicione ao menos uma peça na lista." });

  const fornecedor = db.prepare("SELECT id, nome FROM fornecedores WHERE id = ? AND ativo = 1").get(fornecedorId);
  if (!fornecedor) return res.status(400).json({ error: "Fornecedor inválido." });

  const rmaRelacionado = String(b.rmaRelacionado || "").trim();
  const limpos = itens.map((item) => ({
    codigo: String(item?.codigo || "").trim(),
    serial: String(item?.serial || "").trim(),
    descricao: String(item?.descricao || "").trim(),
    ean: String(item?.ean || "").trim(),
    defeito: String(item?.defeito || "").trim(),
  }));
  const semDescricao = limpos.findIndex((item) => !item.descricao);
  if (semDescricao !== -1) {
    return res.status(400).json({ error: `Peça ${semDescricao + 1} da lista está sem descrição.` });
  }

  const run = transaction(() => {
    const now = nowStamp();
    const pedidoNumero = gerarNumeroPedido();
    db.prepare(
      `INSERT INTO pedidos_fornecedor (numero,fornecedor_id,rma_relacionado,status,created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,'em_aberto',?,?,?,?)`
    ).run(pedidoNumero, fornecedorId, rmaRelacionado, req.user.id, now, req.user.id, now);

    const ids = [];
    for (const item of limpos) {
      const result = db
        .prepare(
          `INSERT INTO pecas_fornecedor
           (codigo,serial,descricao,ean,marca,defeito,fornecedor_id,decisao,observacoes,pedido_numero,created_by,created_at,updated_by,updated_at)
           VALUES (?,?,?,?,'',?,?,'pendente','',?,?,?,?,?)`
        )
        .run(item.codigo, item.serial, item.descricao, item.ean, item.defeito, fornecedorId, pedidoNumero, req.user.id, now, req.user.id, now);
      const id = result.lastInsertRowid;
      registrarEvento(id, "Peça cadastrada nesta ordem.", req.user);
      ids.push(id);
    }
    return { ids, pedidoNumero };
  });

  try {
    const { ids, pedidoNumero } = run();
    broadcast("pecasFornecedor");
    res.json({ ok: true, pedidoNumero, ids });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar as peças." });
  }
});

// ---- Pedidos ----

router.get("/pedidos", (req, res) => {
  const { status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (fornecedorId) { where.push("o.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (status) { where.push("o.status = ?"); params.push(String(status)); }
  if (busca) {
    where.push("(o.numero LIKE ? OR EXISTS (SELECT 1 FROM pecas_fornecedor p WHERE p.pedido_numero = o.numero AND (p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)))");
    const like = `%${busca}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT
      o.numero AS pedido_numero,
      o.fornecedor_id,
      f.nome AS fornecedor_nome,
      o.rma_relacionado,
      o.status,
      o.created_at,
      o.updated_at,
      COALESCE((SELECT COUNT(*) FROM pecas_fornecedor p WHERE p.pedido_numero = o.numero), 0) AS total_pecas,
      COALESCE((SELECT COUNT(*) FROM pecas_fornecedor p WHERE p.pedido_numero = o.numero AND p.decisao = 'pendente'), 0) AS pendentes,
      COALESCE((SELECT COUNT(*) FROM pecas_fornecedor p WHERE p.pedido_numero = o.numero AND p.decisao = 'aceita'), 0) AS aceitas,
      COALESCE((SELECT COUNT(*) FROM pecas_fornecedor p WHERE p.pedido_numero = o.numero AND p.decisao = 'recusada'), 0) AS recusadas
    FROM pedidos_fornecedor o
    JOIN fornecedores f ON f.id = o.fornecedor_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY o.created_at DESC LIMIT 300`;
  const pedidos = db.prepare(sql).all(...params);
  res.json({ pedidos });
});

router.get("/pedidos/:numero", (req, res) => {
  const numero = req.params.numero;
  const pedido = db
    .prepare(
      `SELECT o.*, f.nome AS fornecedor_nome FROM pedidos_fornecedor o
       JOIN fornecedores f ON f.id = o.fornecedor_id
       WHERE o.numero = ?`
    )
    .get(numero);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

  const pecas = db.prepare("SELECT * FROM pecas_fornecedor WHERE pedido_numero = ? ORDER BY id ASC").all(numero);
  res.json({
    pedidoNumero: pedido.numero,
    fornecedorId: pedido.fornecedor_id,
    fornecedorNome: pedido.fornecedor_nome,
    rmaRelacionado: pedido.rma_relacionado,
    status: pedido.status,
    createdAt: pedido.created_at,
    pecas,
  });
});

// Enquanto o pedido não estiver concluído, a recepção pode ir incluindo
// mais peças na mesma ordem (ex.: o fornecedor ainda está avaliando e
// aparece mais uma peça com o mesmo defeito).
router.post("/pedidos/:numero/pecas", (req, res) => {
  const numero = req.params.numero;
  const pedido = db.prepare("SELECT * FROM pedidos_fornecedor WHERE numero = ?").get(numero);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });
  if (pedido.status === "concluido") {
    return res.status(400).json({ error: "Este pedido já está concluído e não aceita novas peças." });
  }

  const b = req.body || {};
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return res.status(400).json({ error: "Adicione ao menos uma peça na lista." });

  const limpos = itens.map((item) => ({
    codigo: String(item?.codigo || "").trim(),
    serial: String(item?.serial || "").trim(),
    descricao: String(item?.descricao || "").trim(),
    ean: String(item?.ean || "").trim(),
    defeito: String(item?.defeito || "").trim(),
  }));
  const semDescricao = limpos.findIndex((item) => !item.descricao);
  if (semDescricao !== -1) {
    return res.status(400).json({ error: `Peça ${semDescricao + 1} da lista está sem descrição.` });
  }

  const run = transaction(() => {
    const now = nowStamp();
    const ids = [];
    for (const item of limpos) {
      const result = db
        .prepare(
          `INSERT INTO pecas_fornecedor
           (codigo,serial,descricao,ean,marca,defeito,fornecedor_id,decisao,observacoes,pedido_numero,created_by,created_at,updated_by,updated_at)
           VALUES (?,?,?,?,'',?,?,'pendente','',?,?,?,?,?)`
        )
        .run(item.codigo, item.serial, item.descricao, item.ean, item.defeito, pedido.fornecedor_id, numero, req.user.id, now, req.user.id, now);
      const id = result.lastInsertRowid;
      registrarEvento(id, "Peça adicionada a esta ordem.", req.user);
      ids.push(id);
    }
    db.prepare("UPDATE pedidos_fornecedor SET updated_by = ?, updated_at = ? WHERE numero = ?").run(req.user.id, now, numero);
    return ids;
  });

  try {
    const ids = run();
    broadcast("pecasFornecedor");
    res.json({ ok: true, ids });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível adicionar as peças." });
  }
});

router.patch("/pedidos/:numero", (req, res) => {
  const numero = req.params.numero;
  const pedido = db.prepare("SELECT * FROM pedidos_fornecedor WHERE numero = ?").get(numero);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  let eventoStatus = null;

  if (b.status && b.status !== pedido.status) {
    if (!STATUS_LABEL[b.status]) return res.status(400).json({ error: "Status inválido." });
    fields.push("status = ?");
    values.push(b.status);
    eventoStatus = `Status do pedido alterado para "${STATUS_LABEL[b.status]}".`;
  }
  if (typeof b.rmaRelacionado === "string" && b.rmaRelacionado.trim() !== pedido.rma_relacionado) {
    fields.push("rma_relacionado = ?");
    values.push(b.rmaRelacionado.trim());
  }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  const run = transaction(() => {
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(req.user.id, nowStamp());
    values.push(numero);
    db.prepare(`UPDATE pedidos_fornecedor SET ${fields.join(", ")} WHERE numero = ?`).run(...values);
    if (eventoStatus) {
      const pecas = db.prepare("SELECT id FROM pecas_fornecedor WHERE pedido_numero = ?").all(numero);
      for (const peca of pecas) registrarEvento(peca.id, eventoStatus, req.user);
    }
  });

  run();
  broadcast("pecasFornecedor");
  res.json({ ok: true });
});

router.delete("/pedidos/:numero", requireAdmin, (req, res) => {
  const numero = req.params.numero;
  const pedido = db.prepare("SELECT numero FROM pedidos_fornecedor WHERE numero = ?").get(numero);
  if (!pedido) return res.status(404).json({ error: "Pedido não encontrado." });

  const run = transaction(() => {
    const pecas = db.prepare("SELECT id FROM pecas_fornecedor WHERE pedido_numero = ?").all(numero);
    for (const peca of pecas) {
      db.prepare("DELETE FROM pecas_fornecedor_eventos WHERE peca_id = ?").run(peca.id);
    }
    db.prepare("DELETE FROM pecas_fornecedor WHERE pedido_numero = ?").run(numero);
    db.prepare("DELETE FROM pedidos_fornecedor WHERE numero = ?").run(numero);
  });

  run();
  broadcast("pecasFornecedor");
  res.json({ ok: true });
});

router.get("/planilha", async (req, res) => {
  const { pedidoNumero, status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (pedidoNumero) { where.push("p.pedido_numero = ?"); params.push(String(pedidoNumero)); }
  if (fornecedorId) { where.push("p.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (status) { where.push("o.status = ?"); params.push(String(status)); }
  if (busca) {
    where.push("(p.pedido_numero LIKE ? OR p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT p.*, f.nome AS fornecedor_nome, o.status AS pedido_status, o.rma_relacionado
    FROM pecas_fornecedor p
    JOIN fornecedores f ON f.id = p.fornecedor_id
    JOIN pedidos_fornecedor o ON o.numero = p.pedido_numero
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY p.pedido_numero DESC, p.id ASC LIMIT 2000`;
  const pecas = db.prepare(sql).all(...params);

  const periodo = pedidoNumero
    ? `Pedido ${pedidoNumero}`
    : [status && STATUS_LABEL[status], fornecedorId && "fornecedor selecionado", busca && `busca "${busca}"`]
        .filter(Boolean)
        .join(" · ") || "Todos os registros";

  const nomeArquivo = pedidoNumero ? `pedido_${pedidoNumero}.xlsx` : `pecas_fornecedor_${nowStamp().slice(0, 10)}.xlsx`;

  try {
    const buffer = await gerarPlanilha({
      titulo: pedidoNumero ? `Pedido ${pedidoNumero} — Peças para Fornecedor` : "Peças para Fornecedor",
      periodo,
      geradoPor: req.user.name,
      colunas: [
        { key: "pedido_numero", header: "Pedido", minWidth: 16, maxWidth: 20 },
        { key: "codigo", header: "Código", minWidth: 8, maxWidth: 14 },
        { key: "serial", header: "Serial", minWidth: 8, maxWidth: 18 },
        { key: "descricao", header: "Descrição", minWidth: 16, maxWidth: 32, wrap: true },
        { key: "ean", header: "EAN", minWidth: 8, maxWidth: 16 },
        { key: "marca", header: "Marca", minWidth: 8, maxWidth: 16 },
        { key: "defeito", header: "Defeito", minWidth: 16, maxWidth: 34, wrap: true },
        { key: "fornecedor_nome", header: "Fornecedor", minWidth: 14, maxWidth: 26, wrap: true },
        { key: "status_label", header: "Status do pedido", minWidth: 12, maxWidth: 20 },
        { key: "decisao_label", header: "Decisão da peça", minWidth: 12, maxWidth: 18 },
        { key: "rma_relacionado", header: "RMA relacionado", minWidth: 12, maxWidth: 22 },
        { key: "created_at", header: "Data", type: "date", minWidth: 14, maxWidth: 18 },
      ],
      linhas: pecas.map((p) => ({
        ...p,
        status_label: STATUS_LABEL[p.pedido_status] || p.pedido_status,
        decisao_label: DECISAO_LABEL[p.decisao] || p.decisao,
      })),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível gerar a planilha." });
  }
});

router.get("/pecas/:id", (req, res) => {
  const id = Number(req.params.id);
  const peca = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome FROM pecas_fornecedor p JOIN fornecedores f ON f.id = p.fornecedor_id WHERE p.id = ?`
    )
    .get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });
  const eventos = db.prepare("SELECT * FROM pecas_fornecedor_eventos WHERE peca_id = ? ORDER BY id ASC").all(id);
  res.json({ peca, eventos });
});

router.patch("/pecas/:id", (req, res) => {
  const id = Number(req.params.id);
  const peca = db.prepare("SELECT * FROM pecas_fornecedor WHERE id = ?").get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  const eventos = [];

  for (const [key, column] of Object.entries({
    codigo: "codigo",
    serial: "serial",
    descricao: "descricao",
    ean: "ean",
    marca: "marca",
    defeito: "defeito",
    observacoes: "observacoes",
  })) {
    if (typeof b[key] === "string" && b[key] !== peca[column]) {
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }

  if (b.decisao && b.decisao !== peca.decisao) {
    if (!DECISAO_LABEL[b.decisao]) return res.status(400).json({ error: "Decisão inválida." });
    fields.push("decisao = ?");
    values.push(b.decisao);
    eventos.push(`Decisão do fornecedor marcada como "${DECISAO_LABEL[b.decisao]}".`);
  }

  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  const run = transaction(() => {
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(req.user.id, nowStamp());
    values.push(id);
    db.prepare(`UPDATE pecas_fornecedor SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    for (const texto of eventos) registrarEvento(id, texto, req.user);
  });

  try {
    run();
    broadcast("pecasFornecedor");
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a peça." });
  }
});

router.post("/pecas/:id/eventos", (req, res) => {
  const id = Number(req.params.id);
  const peca = db.prepare("SELECT id FROM pecas_fornecedor WHERE id = ?").get(id);
  if (!peca) return res.status(404).json({ error: "Peça não encontrada." });

  const texto = String((req.body || {}).texto || "").trim();
  if (!texto) return res.status(400).json({ error: "Escreva um comentário." });

  registrarEvento(id, texto, req.user);
  db.prepare("UPDATE pecas_fornecedor SET updated_at = ? WHERE id = ?").run(nowStamp(), id);
  broadcast("pecasFornecedor");
  res.json({ ok: true });
});

module.exports = router;
