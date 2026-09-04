const express = require("express");
const fs = require("fs");
const path = require("path");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth);

const FOTOS_DIR = path.join(__dirname, "..", "..", "data", "testes");
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });

function pastaCodigo(codigo) {
  const seguro = String(codigo).replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(FOTOS_DIR, seguro);
}

function salvarFoto(codigo, tipo, dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error(`Foto de ${tipo} inválida.`);
  const pasta = pastaCodigo(codigo);
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${tipo}.jpg`);
  fs.writeFileSync(arquivo, Buffer.from(match[1], "base64"));
  return arquivo;
}

router.get("/verificar", (req, res) => {
  const codigo = String(req.query.codigo || "").trim();
  if (!codigo) return res.status(400).json({ error: "Informe o código." });
  const existe = !!db.prepare("SELECT id FROM testes WHERE codigo = ?").get(codigo);
  res.json({ existe });
});

router.post("/", (req, res) => {
  const b = req.body || {};
  const codigo = String(b.codigo || "").trim();
  if (!codigo) return res.status(400).json({ error: "Leia o código da máquina." });
  if (!b.fotoSerial) return res.status(400).json({ error: "Tire a foto do número de série." });
  if (!b.fotoTeste) return res.status(400).json({ error: "Tire a foto do resultado do teste." });

  if (db.prepare("SELECT id FROM testes WHERE codigo = ?").get(codigo)) {
    return res.status(400).json({ error: "Essa máquina já possui um teste registrado." });
  }

  let caminhoSerial, caminhoTeste;
  try {
    caminhoSerial = salvarFoto(codigo, "serial", b.fotoSerial);
    caminhoTeste = salvarFoto(codigo, "teste", b.fotoTeste);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar as fotos." });
  }

  const run = transaction(() => {
    const proximo = db.prepare("SELECT COALESCE(MAX(numero_teste),0) + 1 AS n FROM testes").get().n;
    const now = nowStamp();
    db.prepare(
      "INSERT INTO testes (codigo,numero_teste,responsible,created_by,created_at,foto_serial,foto_teste) VALUES (?,?,?,?,?,?,?)"
    ).run(codigo, proximo, req.user.name, req.user.id, now, path.relative(FOTOS_DIR, caminhoSerial), path.relative(FOTOS_DIR, caminhoTeste));
    return proximo;
  });

  try {
    const numero = run();
    res.json({ ok: true, numero });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar o teste." });
  }
});

router.get("/consultar", (req, res) => {
  const codigo = String(req.query.codigo || "").trim();
  if (!codigo) return res.status(400).json({ error: "Informe o código." });
  const teste = db.prepare("SELECT * FROM testes WHERE codigo = ?").get(codigo);
  if (!teste) return res.status(404).json({ error: "Nenhum teste encontrado para esse código." });
  res.json({ teste });
});

router.get("/", (req, res) => {
  const { codigo, responsavel, de, ate } = req.query;
  const where = [];
  const params = [];
  if (codigo) { where.push("codigo LIKE ?"); params.push(`%${codigo}%`); }
  if (responsavel && responsavel !== "Todos") { where.push("responsible = ?"); params.push(responsavel); }
  if (de) { where.push("created_at >= ?"); params.push(String(de)); }
  if (ate) { where.push("created_at < datetime(?, '+1 day')"); params.push(String(ate)); }
  const sql = `SELECT * FROM testes ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 500`;
  const testes = db.prepare(sql).all(...params);
  res.json({ testes });
});

router.get("/stats", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM testes").get().n;
  const hojeInicio = nowStamp().slice(0, 10);
  const hoje = db.prepare("SELECT COUNT(*) AS n FROM testes WHERE created_at >= ?").get(hojeInicio).n;
  const ultimo = db.prepare("SELECT * FROM testes ORDER BY id DESC LIMIT 1").get() || null;
  const porResponsavel = db
    .prepare("SELECT responsible, COUNT(*) AS quantidade FROM testes GROUP BY responsible ORDER BY quantidade DESC")
    .all();
  res.json({ total, hoje, ultimo, porResponsavel });
});

router.get("/export.csv", (req, res) => {
  const testes = db.prepare("SELECT * FROM testes ORDER BY id DESC").all();
  const linhas = [
    "Numero do Teste;Codigo;Responsavel;Data",
    ...testes.map((t) => `${String(t.numero_teste).padStart(6, "0")};${t.codigo};${t.responsible};${t.created_at}`),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="relatorio_testes_${hojeStamp()}.csv"`);
  res.send("﻿" + linhas.join("\r\n"));
});

function hojeStamp() {
  return nowStamp().slice(0, 10);
}

router.get("/:id/foto/:tipo", (req, res) => {
  const teste = db.prepare("SELECT * FROM testes WHERE id = ?").get(Number(req.params.id));
  if (!teste) return res.status(404).end();
  const relativo = req.params.tipo === "teste" ? teste.foto_teste : teste.foto_serial;
  const caminho = path.join(FOTOS_DIR, relativo);
  if (!caminho.startsWith(FOTOS_DIR) || !fs.existsSync(caminho)) return res.status(404).end();
  res.sendFile(caminho);
});

module.exports = router;
