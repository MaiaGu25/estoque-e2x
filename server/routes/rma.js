const express = require("express");
const fs = require("fs");
const path = require("path");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp, saveBase64Image } = require("../util");

const router = express.Router();
router.use(requireAuth);

const FOTOS_DIR = path.join(__dirname, "..", "..", "data", "rma");

const STATUS_LABEL = {
  aguardando_devolucao: "Aguardando devolução",
  recebido: "Recebido, aguardando inspeção",
  em_inspecao: "Em inspeção",
  concluido: "Concluído",
};

function registrarEvento({ casoId, tipo, texto, foto, user }) {
  db.prepare(
    "INSERT INTO rma_eventos (caso_id,tipo,texto,foto,responsible,created_by,created_at) VALUES (?,?,?,?,?,?,?)"
  ).run(casoId, tipo, texto || "", foto || null, user.name, user.id, nowStamp());
}

router.get("/", (req, res) => {
  const { status, plataforma, busca, de, ate } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push("status = ?"); params.push(String(status)); }
  if (plataforma && plataforma !== "Todas") { where.push("plataforma = ?"); params.push(String(plataforma)); }
  if (busca) {
    where.push("(numero LIKE ? OR pedido LIKE ? OR produto LIKE ? OR cliente LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like);
  }
  if (de) { where.push("created_at >= ?"); params.push(String(de)); }
  if (ate) { where.push("created_at < datetime(?, '+1 day')"); params.push(String(ate)); }

  const sql = `SELECT * FROM rma_casos ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 500`;
  const casos = db.prepare(sql).all(...params);
  res.json({ casos });
});

router.get("/stats", (req, res) => {
  const porStatus = db.prepare("SELECT status, COUNT(*) AS n FROM rma_casos GROUP BY status").all();
  const hojeInicio = nowStamp().slice(0, 10);
  const abertosHoje = db.prepare("SELECT COUNT(*) AS n FROM rma_casos WHERE created_at >= ?").get(hojeInicio).n;
  const mesInicio = hojeInicio.slice(0, 7) + "-01";
  const totalMes = db.prepare("SELECT COUNT(*) AS n FROM rma_casos WHERE created_at >= ?").get(mesInicio).n;
  const reembolsadoMes = db
    .prepare("SELECT COALESCE(SUM(valor),0) AS v FROM rma_casos WHERE desfecho = 'reembolso_cliente' AND resolved_at >= ?")
    .get(mesInicio).v;
  const cobradoMes = db
    .prepare("SELECT COALESCE(SUM(valor),0) AS v FROM rma_casos WHERE desfecho = 'cobranca_plataforma' AND resolved_at >= ?")
    .get(mesInicio).v;
  const porPlataforma = db.prepare("SELECT plataforma, COUNT(*) AS n FROM rma_casos GROUP BY plataforma ORDER BY n DESC").all();

  res.json({ porStatus, abertosHoje, totalMes, reembolsadoMes, cobradoMes, porPlataforma });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const plataforma = String(b.plataforma || "").trim();
  const pedido = String(b.pedido || "").trim();
  const produto = String(b.produto || "").trim();
  if (!plataforma || !produto) {
    return res.status(400).json({ error: "Informe a plataforma e o produto." });
  }

  const run = transaction(() => {
    const now = nowStamp();
    const numero = `RMA-${now.slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    const result = db
      .prepare(
        `INSERT INTO rma_casos
         (numero,plataforma,pedido,produto,cliente,motivo_cliente,status,tecnico_responsavel,created_by,created_at,updated_at)
         VALUES (?,?,?,?,?,?,'aguardando_devolucao',?,?,?,?)`
      )
      .run(
        numero,
        plataforma,
        pedido,
        produto,
        String(b.cliente || "").trim(),
        String(b.motivoCliente || "").trim(),
        String(b.tecnicoResponsavel || "").trim(),
        req.user.id,
        now,
        now
      );
    const casoId = result.lastInsertRowid;
    registrarEvento({ casoId, tipo: "abertura", texto: "Caso aberto.", user: req.user });
    return { id: casoId, numero };
  });

  try {
    const { id, numero } = run();
    res.json({ ok: true, id, numero });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível criar o caso." });
  }
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const caso = db.prepare("SELECT * FROM rma_casos WHERE id = ?").get(id);
  if (!caso) return res.status(404).json({ error: "Caso não encontrado." });
  const eventos = db.prepare("SELECT * FROM rma_eventos WHERE caso_id = ? ORDER BY id ASC").all(id);
  res.json({ caso, eventos });
});

const CAMPOS_EDITAVEIS = {
  plataforma: "plataforma",
  pedido: "pedido",
  produto: "produto",
  cliente: "cliente",
  motivoCliente: "motivo_cliente",
  laudoTecnico: "laudo_tecnico",
  tecnicoResponsavel: "tecnico_responsavel",
};

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const caso = db.prepare("SELECT * FROM rma_casos WHERE id = ?").get(id);
  if (!caso) return res.status(404).json({ error: "Caso não encontrado." });

  const b = req.body || {};
  const fields = [];
  const values = [];
  const eventos = [];

  for (const [key, column] of Object.entries(CAMPOS_EDITAVEIS)) {
    if (typeof b[key] === "string" && b[key] !== caso[column]) {
      fields.push(`${column} = ?`);
      values.push(b[key].trim());
    }
  }

  if (b.status && b.status !== caso.status) {
    if (!STATUS_LABEL[b.status]) return res.status(400).json({ error: "Status inválido." });
    fields.push("status = ?");
    values.push(b.status);
    eventos.push(`Status alterado para "${STATUS_LABEL[b.status]}".`);
    if (b.status === "concluido") {
      fields.push("resolved_at = ?");
      values.push(nowStamp());
    }
  }

  if (b.culpa === "nossa" || b.culpa === "cliente") {
    if (b.culpa !== caso.culpa) {
      fields.push("culpa = ?");
      values.push(b.culpa);
      eventos.push(`Definido como culpa ${b.culpa === "nossa" ? "da E2X" : "do cliente"}.`);
    }
  }

  if (b.desfecho === "reembolso_cliente" || b.desfecho === "cobranca_plataforma") {
    if (b.desfecho !== caso.desfecho) {
      fields.push("desfecho = ?");
      values.push(b.desfecho);
      eventos.push(`Desfecho definido: ${b.desfecho === "reembolso_cliente" ? "reembolso ao cliente" : "cobrança da plataforma"}.`);
    }
  }

  if (b.valor !== undefined && b.valor !== null && b.valor !== "") {
    const valor = Number(b.valor);
    if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ error: "Valor inválido." });
    if (valor !== caso.valor) {
      fields.push("valor = ?");
      values.push(valor);
    }
  }

  if (b.disputaStatus && b.disputaStatus !== caso.disputa_status) {
    fields.push("disputa_status = ?");
    values.push(b.disputaStatus);
    const labels = { nao_aberta: "não aberta", aberta: "aberta", ganha: "ganha", perdida: "perdida" };
    eventos.push(`Disputa com a plataforma: ${labels[b.disputaStatus] || b.disputaStatus}.`);
  }

  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  const run = transaction(() => {
    fields.push("updated_at = ?");
    values.push(nowStamp());
    values.push(id);
    db.prepare(`UPDATE rma_casos SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    for (const texto of eventos) {
      registrarEvento({ casoId: id, tipo: "status", texto, user: req.user });
    }
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o caso." });
  }
});

router.post("/:id/eventos", (req, res) => {
  const id = Number(req.params.id);
  const caso = db.prepare("SELECT * FROM rma_casos WHERE id = ?").get(id);
  if (!caso) return res.status(404).json({ error: "Caso não encontrado." });

  const b = req.body || {};
  const texto = String(b.texto || "").trim();
  if (!texto && !b.foto) return res.status(400).json({ error: "Escreva um comentário ou anexe uma foto." });

  let fotoRelativa = null;
  if (b.foto) {
    try {
      const nomeArquivo = `${id}-${Date.now()}.jpg`;
      const caminho = saveBase64Image(FOTOS_DIR, nomeArquivo, b.foto);
      fotoRelativa = path.relative(FOTOS_DIR, caminho);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar a foto." });
    }
  }

  registrarEvento({ casoId: id, tipo: "comentario", texto, foto: fotoRelativa, user: req.user });
  db.prepare("UPDATE rma_casos SET updated_at = ? WHERE id = ?").run(nowStamp(), id);
  res.json({ ok: true });
});

router.get("/eventos/:eventoId/foto", (req, res) => {
  const evento = db.prepare("SELECT * FROM rma_eventos WHERE id = ?").get(Number(req.params.eventoId));
  if (!evento || !evento.foto) return res.status(404).end();
  const caminho = path.join(FOTOS_DIR, evento.foto);
  if (!caminho.startsWith(FOTOS_DIR) || !fs.existsSync(caminho)) return res.status(404).end();
  res.sendFile(caminho);
});

module.exports = router;
