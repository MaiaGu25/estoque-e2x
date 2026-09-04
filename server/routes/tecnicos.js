const express = require("express");
const { db, transaction } = require("../db");
const { requireAuth } = require("../auth");
const { nowStamp } = require("../util");

const router = express.Router();
router.use(requireAuth);

function registrar(tipo, alvo, quantidade, motivo, detalhe, user) {
  db.prepare(
    "INSERT INTO tec_movimentos (tipo,alvo,quantidade,motivo,detalhe,responsible,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(tipo, alvo, quantidade, motivo, detalhe || "", user.name, user.id, nowStamp());
}

router.get("/data", (req, res) => {
  const itens = db.prepare("SELECT * FROM tec_itens WHERE ativo = 1 ORDER BY categoria, nome").all();

  const configuracoes = db
    .prepare(
      `SELECT c.*, COALESCE(m.quantidade,0) AS estoque_maquinas
       FROM tec_configuracoes c
       LEFT JOIN tec_maquinas m ON m.configuracao_id = c.id
       WHERE c.ativo = 1 ORDER BY c.nome COLLATE NOCASE`
    )
    .all();

  const configItens = db
    .prepare(
      `SELECT ci.configuracao_id, ci.item_id, ci.quantidade, i.nome, i.categoria
       FROM tec_config_itens ci JOIN tec_itens i ON i.id = ci.item_id`
    )
    .all();

  const movimentos = db.prepare("SELECT * FROM tec_movimentos ORDER BY id DESC LIMIT 300").all();

  res.json({ itens, configuracoes, configItens, movimentos });
});

router.post("/movimentacao", (req, res) => {
  const b = req.body || {};
  const tipo = b.tipo === "ENTRADA" || b.tipo === "SAIDA" ? b.tipo : null;
  const itemId = Number(b.itemId);
  const qtd = Number(b.quantidade);
  const motivo = String(b.motivo || "").trim() || "Movimentação manual";

  if (!tipo || !itemId || !Number.isFinite(qtd) || qtd <= 0) {
    return res.status(400).json({ error: "Informe item, tipo e quantidade válida." });
  }

  const run = transaction(() => {
    const item = db.prepare("SELECT * FROM tec_itens WHERE id = ? AND ativo = 1").get(itemId);
    if (!item) throw new Error("Item não encontrado.");

    const next = tipo === "ENTRADA" ? item.quantidade + qtd : item.quantidade - qtd;
    if (next < 0) throw new Error(`Estoque insuficiente. Disponível: ${item.quantidade}.`);

    db.prepare("UPDATE tec_itens SET quantidade = ? WHERE id = ?").run(next, item.id);
    registrar(tipo, item.nome, qtd, motivo, "", req.user);
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível registrar." });
  }
});

router.post("/configuracoes", (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!nome) return res.status(400).json({ error: "Digite o nome da configuração." });

  const run = transaction(() => {
    const result = db
      .prepare(
        "INSERT INTO tec_configuracoes (nome,processador,ram,ssd,observacao) VALUES (?,?,?,?,?)"
      )
      .run(nome, String(b.processador || "").trim(), String(b.ram || "").trim(), String(b.ssd || "").trim(), String(b.observacao || "").trim());
    const id = result.lastInsertRowid;
    db.prepare("INSERT INTO tec_maquinas (configuracao_id, quantidade) VALUES (?, 0)").run(id);
    for (const it of itens) {
      const qtd = Number(it.quantidade);
      if (!it.itemId || !Number.isFinite(qtd) || qtd <= 0) throw new Error("Cada item marcado precisa ter quantidade maior que zero.");
      db.prepare("INSERT INTO tec_config_itens (configuracao_id,item_id,quantidade) VALUES (?,?,?)").run(id, Number(it.itemId), qtd);
    }
    return id;
  });

  try {
    const id = run();
    res.json({ ok: true, id });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Já existe uma configuração com esse nome." });
  }
});

router.post("/configuracoes/:id/duplicar", (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const nome = String(b.nome || "").trim();
  if (!nome) return res.status(400).json({ error: "Digite o nome da nova configuração." });

  const original = db.prepare("SELECT * FROM tec_configuracoes WHERE id = ?").get(id);
  if (!original) return res.status(404).json({ error: "Configuração não encontrada." });
  const itens = db.prepare("SELECT item_id, quantidade FROM tec_config_itens WHERE configuracao_id = ?").all(id);

  const run = transaction(() => {
    const result = db
      .prepare("INSERT INTO tec_configuracoes (nome,processador,ram,ssd,observacao) VALUES (?,?,?,?,?)")
      .run(nome, original.processador, original.ram, original.ssd, original.observacao);
    const newId = result.lastInsertRowid;
    db.prepare("INSERT INTO tec_maquinas (configuracao_id, quantidade) VALUES (?, 0)").run(newId);
    for (const it of itens) {
      db.prepare("INSERT INTO tec_config_itens (configuracao_id,item_id,quantidade) VALUES (?,?,?)").run(newId, it.item_id, it.quantidade);
    }
    return newId;
  });

  try {
    const newId = run();
    res.json({ ok: true, id: newId });
  } catch (error) {
    res.status(400).json({ error: "Já existe uma configuração com esse nome." });
  }
});

router.patch("/configuracoes/:id", (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const config = db.prepare("SELECT * FROM tec_configuracoes WHERE id = ?").get(id);
  if (!config) return res.status(404).json({ error: "Configuração não encontrada." });

  const maquinas = db.prepare("SELECT quantidade FROM tec_maquinas WHERE configuracao_id = ?").get(id);
  if (maquinas && maquinas.quantidade > 0) {
    return res.status(400).json({
      error: "Essa configuração possui máquinas montadas em estoque. Desmonte/retire as máquinas ou duplique a configuração antes de alterar a receita.",
    });
  }

  const nome = String(b.nome || "").trim() || config.nome;
  const itens = Array.isArray(b.itens) ? b.itens : null;

  const run = transaction(() => {
    db.prepare("UPDATE tec_configuracoes SET nome=?,processador=?,ram=?,ssd=?,observacao=? WHERE id=?").run(
      nome,
      String(b.processador ?? config.processador).trim(),
      String(b.ram ?? config.ram).trim(),
      String(b.ssd ?? config.ssd).trim(),
      String(b.observacao ?? config.observacao).trim(),
      id
    );
    if (itens) {
      db.prepare("DELETE FROM tec_config_itens WHERE configuracao_id = ?").run(id);
      for (const it of itens) {
        const qtd = Number(it.quantidade);
        if (!it.itemId || !Number.isFinite(qtd) || qtd <= 0) throw new Error("Cada item marcado precisa ter quantidade maior que zero.");
        db.prepare("INSERT INTO tec_config_itens (configuracao_id,item_id,quantidade) VALUES (?,?,?)").run(id, Number(it.itemId), qtd);
      }
    }
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Já existe uma configuração com esse nome." });
  }
});

router.post("/montar", (req, res) => {
  const b = req.body || {};
  const configuracaoId = Number(b.configuracaoId);
  const qtd = Number(b.quantidade);
  const motivo = String(b.motivo || "").trim() || "Montagem para estoque";
  if (!configuracaoId || !Number.isFinite(qtd) || qtd <= 0) {
    return res.status(400).json({ error: "Informe a configuração e uma quantidade válida." });
  }

  const run = transaction(() => {
    const cfg = db.prepare("SELECT * FROM tec_configuracoes WHERE id = ? AND ativo = 1").get(configuracaoId);
    if (!cfg) throw new Error("Configuração não encontrada.");

    const pecas = db
      .prepare(
        `SELECT i.id, i.nome, i.quantidade, ci.quantidade AS por_maquina
         FROM tec_config_itens ci JOIN tec_itens i ON i.id = ci.item_id
         WHERE ci.configuracao_id = ?`
      )
      .all(configuracaoId);

    const faltas = pecas.filter((p) => p.quantidade < p.por_maquina * qtd);
    if (faltas.length) {
      throw new Error(faltas.map((p) => `${p.nome}: precisa ${p.por_maquina * qtd}, disponível ${p.quantidade}`).join("; "));
    }

    for (const p of pecas) {
      db.prepare("UPDATE tec_itens SET quantidade = quantidade - ? WHERE id = ?").run(p.por_maquina * qtd, p.id);
    }
    db.prepare(
      "INSERT INTO tec_maquinas (configuracao_id, quantidade) VALUES (?, ?) ON CONFLICT(configuracao_id) DO UPDATE SET quantidade = quantidade + excluded.quantidade"
    ).run(configuracaoId, qtd);

    const detalhe = pecas.map((p) => `${p.por_maquina * qtd}x ${p.nome}`).join("; ");
    registrar("MONTAGEM", cfg.nome, qtd, motivo, detalhe, req.user);
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível montar." });
  }
});

router.post("/maquina-operacao", (req, res) => {
  const b = req.body || {};
  const configuracaoId = Number(b.configuracaoId);
  const qtd = Number(b.quantidade);
  const desmontar = !!b.desmontar;
  const motivo = String(b.motivo || "").trim() || (desmontar ? "Desmontagem" : "Saída de máquina");

  if (!configuracaoId || !Number.isFinite(qtd) || qtd <= 0) {
    return res.status(400).json({ error: "Informe a configuração e uma quantidade válida." });
  }

  const run = transaction(() => {
    const cfg = db.prepare("SELECT * FROM tec_configuracoes WHERE id = ?").get(configuracaoId);
    if (!cfg) throw new Error("Configuração não encontrada.");
    const estoque = db.prepare("SELECT quantidade FROM tec_maquinas WHERE configuracao_id = ?").get(configuracaoId);
    if (!estoque || qtd > estoque.quantidade) {
      throw new Error(`Estoque insuficiente. Disponível: ${estoque ? estoque.quantidade : 0}.`);
    }

    db.prepare("UPDATE tec_maquinas SET quantidade = quantidade - ? WHERE configuracao_id = ?").run(qtd, configuracaoId);

    let detalhe = "";
    if (desmontar) {
      const pecas = db
        .prepare(`SELECT i.id, i.nome, ci.quantidade FROM tec_config_itens ci JOIN tec_itens i ON i.id = ci.item_id WHERE ci.configuracao_id = ?`)
        .all(configuracaoId);
      for (const p of pecas) {
        db.prepare("UPDATE tec_itens SET quantidade = quantidade + ? WHERE id = ?").run(p.quantidade * qtd, p.id);
      }
      detalhe = pecas.map((p) => `${p.quantidade * qtd}x ${p.nome}`).join("; ");
      registrar("DESMONTAGEM", cfg.nome, qtd, motivo, detalhe, req.user);
    } else {
      registrar("SAIDA MAQUINA", cfg.nome, qtd, motivo, "", req.user);
    }
  });

  try {
    run();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação." });
  }
});

module.exports = router;
