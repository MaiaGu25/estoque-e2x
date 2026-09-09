const express = require("express");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");
const { broadcast } = require("../realtime");
const { gerarPlanilha } = require("../xlsx");

const router = express.Router();
router.use(requireAuth);

const STATUS_LABEL = {
  aguardando_envio: "Aguardando envio",
  aguardando_fornecedor: "Aguardando fornecedor",
  trocada: "Trocada",
  recusada: "Recusada pelo fornecedor",
};

function registrarEvento(pecaId, texto, user) {
  db.prepare(
    "INSERT INTO pecas_fornecedor_eventos (peca_id,texto,responsible,created_by,created_at) VALUES (?,?,?,?,?)"
  ).run(pecaId, texto, user.name, user.id, nowStamp());
}

// ---- Fornecedores ----

router.get("/fornecedores", (req, res) => {
  const fornecedores = db.prepare("SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY nome COLLATE NOCASE").all();
  res.json({ fornecedores });
});

router.post("/fornecedores", (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Digite o nome do fornecedor." });
  try {
    const result = db
      .prepare("INSERT INTO fornecedores (nome,identificacao,contato) VALUES (?,?,?)")
      .run(nome, String(b.identificacao || "").trim(), String(b.contato || "").trim());
    broadcast("pecasFornecedor");
    res.json({ ok: true, id: result.lastInsertRowid });
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
  for (const key of ["nome", "identificacao", "contato"]) {
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

// ---- Peças ----

router.get("/pecas", (req, res) => {
  const { status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push("p.status = ?"); params.push(String(status)); }
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
  const porStatus = db.prepare("SELECT status, COUNT(*) AS n FROM pecas_fornecedor GROUP BY status").all();
  const hojeInicio = nowStamp().slice(0, 10);
  const registradasHoje = db.prepare("SELECT COUNT(*) AS n FROM pecas_fornecedor WHERE created_at >= ?").get(hojeInicio).n;
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

function gerarNumeroPedido() {
  const now = nowStamp();
  return `ORD-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
}

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
    defeito: String(item?.defeito || "").trim(),
  }));
  const semDescricao = limpos.findIndex((item) => !item.descricao);
  if (semDescricao !== -1) {
    return res.status(400).json({ error: `Peça ${semDescricao + 1} da lista está sem descrição.` });
  }

  const pedidoNumero = gerarNumeroPedido();

  const run = transaction(() => {
    const now = nowStamp();
    const ids = [];
    let baixasAutomaticas = 0;
    for (const item of limpos) {
      const result = db
        .prepare(
          `INSERT INTO pecas_fornecedor
           (codigo,serial,descricao,ean,marca,defeito,fornecedor_id,status,rma_relacionado,observacoes,pedido_numero,created_by,created_at,updated_by,updated_at)
           VALUES (?,?,?,'','',?,?,'aguardando_envio',?,'',?,?,?,?,?)`
        )
        .run(item.codigo, item.serial, item.descricao, item.defeito, fornecedorId, rmaRelacionado, pedidoNumero, req.user.id, now, req.user.id, now);
      const id = result.lastInsertRowid;

      let textoEvento = "Peça cadastrada, aguardando envio ao fornecedor.";
      if (item.codigo) {
        const part = db.prepare("SELECT id, quantity FROM parts WHERE code = ? AND active = 1").get(item.codigo);
        if (part) {
          const next = part.quantity - 1;
          db.prepare("UPDATE parts SET quantity = ?, updated_at = ? WHERE id = ?").run(next, now, part.id);
          db.prepare(
            `INSERT INTO movements (part_id,order_id,type,quantity,previous_balance,new_balance,reason,responsible,notes,created_by,created_at)
             VALUES (?,NULL,'SAIDA',1,?,?,'RMA',?,?,?,?)`
          ).run(part.id, part.quantity, next, req.user.name, `Pedido ${pedidoNumero} · ${item.descricao} · Fornecedor: ${fornecedor.nome}`, req.user.id, now);
          baixasAutomaticas++;
          textoEvento += ` Saída automática registrada no estoque (${item.codigo}).`;
        }
      }
      registrarEvento(id, textoEvento, req.user);
      ids.push(id);
    }
    return { ids, baixasAutomaticas };
  });

  try {
    const { ids, baixasAutomaticas } = run();
    broadcast("pecasFornecedor");
    if (baixasAutomaticas) broadcast("estoque");
    res.json({ ok: true, pedidoNumero, ids, baixasAutomaticas, semCorrespondencia: ids.length - baixasAutomaticas });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível cadastrar as peças." });
  }
});

// ---- Pedidos (agrupamento de peças cadastradas juntas) ----

router.get("/pedidos", (req, res) => {
  const { status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (fornecedorId) { where.push("p.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (status) { where.push("p.status = ?"); params.push(String(status)); }
  if (busca) {
    where.push("(p.pedido_numero LIKE ? OR p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT
      p.pedido_numero,
      p.fornecedor_id,
      f.nome AS fornecedor_nome,
      COUNT(*) AS total_pecas,
      MIN(p.created_at) AS created_at,
      MAX(p.updated_at) AS updated_at,
      SUM(CASE WHEN p.status = 'aguardando_envio' THEN 1 ELSE 0 END) AS aguardando_envio,
      SUM(CASE WHEN p.status = 'aguardando_fornecedor' THEN 1 ELSE 0 END) AS aguardando_fornecedor,
      SUM(CASE WHEN p.status = 'trocada' THEN 1 ELSE 0 END) AS trocada,
      SUM(CASE WHEN p.status = 'recusada' THEN 1 ELSE 0 END) AS recusada
    FROM pecas_fornecedor p
    JOIN fornecedores f ON f.id = p.fornecedor_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    GROUP BY p.pedido_numero
    ORDER BY created_at DESC LIMIT 300`;
  const pedidos = db.prepare(sql).all(...params);
  res.json({ pedidos });
});

router.get("/pedidos/:numero", (req, res) => {
  const numero = req.params.numero;
  const pecas = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome FROM pecas_fornecedor p
       JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.pedido_numero = ? ORDER BY p.id ASC`
    )
    .all(numero);
  if (!pecas.length) return res.status(404).json({ error: "Pedido não encontrado." });
  res.json({
    pedidoNumero: numero,
    fornecedorId: pecas[0].fornecedor_id,
    fornecedorNome: pecas[0].fornecedor_nome,
    createdAt: pecas[0].created_at,
    pecas,
  });
});

router.get("/planilha", async (req, res) => {
  const { pedidoNumero, status, fornecedorId, busca } = req.query;
  const where = [];
  const params = [];
  if (pedidoNumero) { where.push("p.pedido_numero = ?"); params.push(String(pedidoNumero)); }
  if (fornecedorId) { where.push("p.fornecedor_id = ?"); params.push(Number(fornecedorId)); }
  if (status) { where.push("p.status = ?"); params.push(String(status)); }
  if (busca) {
    where.push("(p.pedido_numero LIKE ? OR p.codigo LIKE ? OR p.serial LIKE ? OR p.descricao LIKE ? OR p.ean LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT p.*, f.nome AS fornecedor_nome
    FROM pecas_fornecedor p
    JOIN fornecedores f ON f.id = p.fornecedor_id
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
        { key: "status_label", header: "Status", minWidth: 12, maxWidth: 20 },
        { key: "rma_relacionado", header: "RMA relacionado", minWidth: 12, maxWidth: 22 },
        { key: "created_at", header: "Data", type: "date", minWidth: 14, maxWidth: 18 },
      ],
      linhas: pecas.map((p) => ({ ...p, status_label: STATUS_LABEL[p.status] || p.status })),
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
    rmaRelacionado: "rma_relacionado",
    observacoes: "observacoes",
  })) {
    if (typeof b[key] === "string" && b[key] !== peca[column]) {
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }

  if (b.status && b.status !== peca.status) {
    if (!STATUS_LABEL[b.status]) return res.status(400).json({ error: "Status inválido." });
    fields.push("status = ?");
    values.push(b.status);
    eventos.push(`Status alterado para "${STATUS_LABEL[b.status]}".`);
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
