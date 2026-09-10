const express = require("express");
const { db, transaction, getMeta, setMeta } = require("../db");
const { nowStamp } = require("../util");
const { broadcast } = require("../realtime");

const router = express.Router();

// Numeração legível, sequencial por dia (reinicia a cada dia): INV-TEC-20260910-0001.
// Mesmo esquema de app_meta usado pelo número sequencial do RMA fornecedor.
function gerarNumeroInventario() {
  const dia = nowStamp().slice(0, 10).replaceAll("-", "");
  const chave = `tec_inventario_seq_${dia}`;
  const proximo = (Number(getMeta(chave)) || 0) + 1;
  setMeta(chave, String(proximo));
  return `INV-TEC-${dia}-${String(proximo).padStart(4, "0")}`;
}

function nomeUsuario(id) {
  if (!id) return null;
  const u = db.prepare("SELECT name FROM users WHERE id = ?").get(id);
  return u ? u.name : null;
}

function situacaoDe(contado, diferenca) {
  if (!contado) return "PENDENTE";
  if (diferenca === 0) return "CORRETO";
  return diferenca < 0 ? "FALTA" : "SOBRA";
}

// Monta o payload completo de um inventário (cabeçalho + itens com saldo
// atual ao vivo + resumo), usado tanto pra tela de contagem quanto pra
// revisão e pro histórico. saldo_atual vem sempre do tec_itens ao vivo -
// só congela em saldo_revisao/diferenca/saldo_posterior quando finaliza.
function carregarInventario(inventarioId) {
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(inventarioId);
  if (!inv) return null;

  const linhas = db
    .prepare(
      `SELECT tii.*, ti.nome, ti.categoria, ti.quantidade AS saldo_atual
       FROM tec_inventario_itens tii
       JOIN tec_itens ti ON ti.id = tii.item_id
       WHERE tii.inventario_id = ?
       ORDER BY ti.categoria COLLATE NOCASE, ti.nome COLLATE NOCASE`
    )
    .all(inventarioId);

  const contagensPorItem = new Map();
  if (linhas.length) {
    const ids = linhas.map((l) => l.id);
    const contagens = db
      .prepare(`SELECT * FROM tec_inventario_contagens WHERE inventario_item_id IN (${ids.map(() => "?").join(",")}) ORDER BY ordem ASC`)
      .all(...ids);
    for (const c of contagens) {
      if (!contagensPorItem.has(c.inventario_item_id)) contagensPorItem.set(c.inventario_item_id, []);
      contagensPorItem.get(c.inventario_item_id).push({
        id: c.id,
        valor: c.valor,
        ordem: c.ordem,
        createdAt: c.created_at,
      });
    }
  }

  // Enquanto em andamento, saldo atual/diferença são sempre ao vivo (o
  // estoque pode mudar por outra via durante a contagem). Depois de
  // finalizado, o próprio ato de finalizar já alterou o saldo do sistema -
  // então o histórico tem que mostrar a "foto" congelada de quando o
  // inventário foi concluído (saldo_revisao/diferenca/saldo_posterior),
  // nunca recalcular contra o saldo atual, que já é outro.
  const finalizado = inv.status !== "em_andamento";
  const itens = linhas.map((l) => {
    const contado = !!l.contado;
    const saldoReferencia = finalizado ? l.saldo_revisao : l.saldo_atual;
    const diferenca = finalizado ? l.diferenca : contado ? l.quantidade_contada - l.saldo_atual : null;
    return {
      id: l.id,
      itemId: l.item_id,
      categoria: l.categoria,
      nome: l.nome,
      saldoInicial: l.saldo_inicial,
      saldoAtual: contado && finalizado ? saldoReferencia : l.saldo_atual,
      saldoAlterado: finalizado ? false : l.saldo_atual !== l.saldo_inicial,
      modo: l.modo,
      contado,
      quantidadeContada: contado ? l.quantidade_contada : null,
      diferenca,
      situacao: situacaoDe(contado, diferenca),
      observacao: l.observacao,
      contagens: contagensPorItem.get(l.id) || [],
    };
  });

  const resumo = {
    total: itens.length,
    contados: itens.filter((i) => i.contado).length,
    naoContados: itens.filter((i) => !i.contado).length,
    semDiferenca: itens.filter((i) => i.contado && i.diferenca === 0).length,
    comFalta: itens.filter((i) => i.contado && i.diferenca < 0).length,
    comSobra: itens.filter((i) => i.contado && i.diferenca > 0).length,
    comSaldoAlterado: itens.filter((i) => i.contado && i.saldoAlterado).length,
  };

  return {
    inventario: {
      id: inv.id,
      numero: inv.numero,
      status: inv.status,
      motivo: inv.motivo,
      observacao: inv.observacao,
      createdBy: inv.created_by,
      createdByNome: nomeUsuario(inv.created_by),
      finalizedBy: inv.finalized_by,
      finalizedByNome: nomeUsuario(inv.finalized_by),
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      concludedAt: inv.concluded_at,
    },
    itens,
    resumo,
  };
}

function exigirEmAndamento(inv, res) {
  if (!inv) {
    res.status(404).json({ error: "Inventário não encontrado." });
    return false;
  }
  if (inv.status !== "em_andamento") {
    res.status(400).json({ error: "Este inventário já foi finalizado ou cancelado." });
    return false;
  }
  return true;
}

// ---- Histórico ----

router.get("/", (req, res) => {
  const inventarios = db.prepare("SELECT * FROM tec_inventarios ORDER BY id DESC LIMIT 200").all();
  const lista = inventarios.map((inv) => {
    const itens = db.prepare("SELECT contado, diferenca FROM tec_inventario_itens WHERE inventario_id = ?").all(inv.id);
    const contados = itens.filter((i) => i.contado).length;
    const divergencias = itens.filter((i) => i.contado && i.diferenca !== null && i.diferenca !== 0).length;
    return {
      id: inv.id,
      numero: inv.numero,
      status: inv.status,
      responsavelNome: nomeUsuario(inv.created_by),
      createdByNome: nomeUsuario(inv.created_by),
      finalizedByNome: nomeUsuario(inv.finalized_by),
      createdAt: inv.created_at,
      concludedAt: inv.concluded_at,
      totalProdutos: itens.length,
      produtosContados: contados,
      divergencias,
    };
  });
  res.json({ inventarios: lista });
});

router.get("/ativo", (req, res) => {
  const inv = db.prepare("SELECT id FROM tec_inventarios WHERE status = 'em_andamento' ORDER BY id DESC LIMIT 1").get();
  res.json(inv ? carregarInventario(inv.id) : { inventario: null, itens: [], resumo: null });
});

router.get("/:id", (req, res) => {
  const payload = carregarInventario(Number(req.params.id));
  if (!payload) return res.status(404).json({ error: "Inventário não encontrado." });
  res.json(payload);
});

// ---- Ciclo de vida ----

router.post("/", (req, res) => {
  const jaEmAndamento = db.prepare("SELECT id FROM tec_inventarios WHERE status = 'em_andamento'").get();
  if (jaEmAndamento) {
    return res.status(409).json({ error: "Já existe um inventário em andamento. Conclua ou cancele antes de iniciar outro." });
  }

  const b = req.body || {};
  const motivo = String(b.motivo || "").trim();
  const observacao = String(b.observacao || "").trim();

  const run = transaction(() => {
    const now = nowStamp();
    const numero = gerarNumeroInventario();
    const result = db
      .prepare(
        "INSERT INTO tec_inventarios (numero,status,motivo,observacao,created_by,created_at,updated_at) VALUES (?,'em_andamento',?,?,?,?,?)"
      )
      .run(numero, motivo, observacao, req.user.id, now, now);
    const inventarioId = result.lastInsertRowid;

    const itensAtivos = db.prepare("SELECT id, quantidade FROM tec_itens WHERE ativo = 1").all();
    for (const item of itensAtivos) {
      db.prepare(
        "INSERT INTO tec_inventario_itens (inventario_id,item_id,saldo_inicial,modo,contado,updated_at) VALUES (?,?,?,'final',0,?)"
      ).run(inventarioId, item.id, item.quantidade, now);
    }
    return inventarioId;
  });

  try {
    const inventarioId = run();
    broadcast("tecnicos");
    res.json(carregarInventario(inventarioId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível iniciar o inventário." });
  }
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const b = req.body || {};
  const fields = [];
  const values = [];
  if (typeof b.motivo === "string") { fields.push("motivo = ?"); values.push(b.motivo.trim()); }
  if (typeof b.observacao === "string") { fields.push("observacao = ?"); values.push(b.observacao.trim()); }
  if (!fields.length) return res.status(400).json({ error: "Nada para atualizar." });

  fields.push("updated_at = ?");
  values.push(nowStamp());
  values.push(id);
  db.prepare(`UPDATE tec_inventarios SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  broadcast("tecnicos");
  res.json(carregarInventario(id));
});

router.post("/:id/cancelar", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  db.prepare("UPDATE tec_inventarios SET status = 'cancelado', updated_at = ? WHERE id = ?").run(nowStamp(), id);
  broadcast("tecnicos");
  res.json({ ok: true });
});

// ---- Contagem por item ----

router.patch("/:id/itens/:itemId", (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const linha = db.prepare("SELECT * FROM tec_inventario_itens WHERE inventario_id = ? AND item_id = ?").get(id, itemId);
  if (!linha) return res.status(404).json({ error: "Esse item não faz parte deste inventário." });

  const b = req.body || {};
  const now = nowStamp();

  const run = transaction(() => {
    if (Object.prototype.hasOwnProperty.call(b, "quantidadeContada")) {
      if (b.quantidadeContada === null) {
        db.prepare("DELETE FROM tec_inventario_contagens WHERE inventario_item_id = ?").run(linha.id);
        db.prepare(
          "UPDATE tec_inventario_itens SET modo='final', contado=0, quantidade_contada=NULL, updated_at=? WHERE id=?"
        ).run(now, linha.id);
      } else {
        const v = Number(b.quantidadeContada);
        if (!Number.isInteger(v) || v < 0) throw new Error("Quantidade contada inválida.");
        db.prepare("DELETE FROM tec_inventario_contagens WHERE inventario_item_id = ?").run(linha.id);
        db.prepare(
          "UPDATE tec_inventario_itens SET modo='final', contado=1, quantidade_contada=?, updated_at=? WHERE id=?"
        ).run(v, now, linha.id);
      }
    }
    if (typeof b.observacao === "string") {
      db.prepare("UPDATE tec_inventario_itens SET observacao=?, updated_at=? WHERE id=?").run(b.observacao.trim(), now, linha.id);
    }
  });

  try {
    run();
    db.prepare("UPDATE tec_inventarios SET updated_at = ? WHERE id = ?").run(now, id);
    broadcast("tecnicos");
    res.json(carregarInventario(id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível salvar a contagem." });
  }
});

router.post("/:id/itens/:itemId/contagens", (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const linha = db.prepare("SELECT * FROM tec_inventario_itens WHERE inventario_id = ? AND item_id = ?").get(id, itemId);
  if (!linha) return res.status(404).json({ error: "Esse item não faz parte deste inventário." });

  const valor = Number((req.body || {}).valor);
  if (!Number.isInteger(valor) || valor <= 0) {
    return res.status(400).json({ error: "Informe uma quantidade válida (maior que zero) para somar." });
  }

  const run = transaction(() => {
    const now = nowStamp();
    // Trocar pra "somar aos poucos" limpa qualquer contagem final anterior
    // desse item - os dois modos não convivem no mesmo item.
    if (linha.modo !== "soma") {
      db.prepare("DELETE FROM tec_inventario_contagens WHERE inventario_item_id = ?").run(linha.id);
    }
    const ultima = db
      .prepare("SELECT COALESCE(MAX(ordem),0) AS n FROM tec_inventario_contagens WHERE inventario_item_id = ?")
      .get(linha.id).n;
    db.prepare(
      "INSERT INTO tec_inventario_contagens (inventario_item_id,valor,ordem,created_by,created_at) VALUES (?,?,?,?,?)"
    ).run(linha.id, valor, ultima + 1, req.user.id, now);

    const total = db
      .prepare("SELECT COALESCE(SUM(valor),0) AS soma FROM tec_inventario_contagens WHERE inventario_item_id = ?")
      .get(linha.id).soma;
    db.prepare(
      "UPDATE tec_inventario_itens SET modo='soma', contado=1, quantidade_contada=?, updated_at=? WHERE id=?"
    ).run(total, now, linha.id);
    db.prepare("UPDATE tec_inventarios SET updated_at = ? WHERE id = ?").run(now, id);
  });

  try {
    run();
    broadcast("tecnicos");
    res.json(carregarInventario(id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível somar a contagem." });
  }
});

router.delete("/:id/itens/:itemId/contagens/ultima", (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const linha = db.prepare("SELECT * FROM tec_inventario_itens WHERE inventario_id = ? AND item_id = ?").get(id, itemId);
  if (!linha) return res.status(404).json({ error: "Esse item não faz parte deste inventário." });
  if (linha.modo !== "soma") return res.status(400).json({ error: "Esse item não está no modo de somar aos poucos." });

  const ultima = db
    .prepare("SELECT * FROM tec_inventario_contagens WHERE inventario_item_id = ? ORDER BY ordem DESC LIMIT 1")
    .get(linha.id);
  if (!ultima) return res.status(400).json({ error: "Não há nenhuma parcela para desfazer." });

  const run = transaction(() => {
    const now = nowStamp();
    db.prepare("DELETE FROM tec_inventario_contagens WHERE id = ?").run(ultima.id);
    const total = db
      .prepare("SELECT COALESCE(SUM(valor),0) AS soma, COUNT(*) AS n FROM tec_inventario_contagens WHERE inventario_item_id = ?")
      .get(linha.id);
    if (total.n > 0) {
      db.prepare("UPDATE tec_inventario_itens SET quantidade_contada=?, updated_at=? WHERE id=?").run(total.soma, now, linha.id);
    } else {
      db.prepare("UPDATE tec_inventario_itens SET contado=0, quantidade_contada=NULL, updated_at=? WHERE id=?").run(now, linha.id);
    }
    db.prepare("UPDATE tec_inventarios SET updated_at = ? WHERE id = ?").run(now, id);
  });

  run();
  broadcast("tecnicos");
  res.json(carregarInventario(id));
});

router.post("/:id/itens/:itemId/zerar", (req, res) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const linha = db.prepare("SELECT * FROM tec_inventario_itens WHERE inventario_id = ? AND item_id = ?").get(id, itemId);
  if (!linha) return res.status(404).json({ error: "Esse item não faz parte deste inventário." });

  const run = transaction(() => {
    const now = nowStamp();
    db.prepare("DELETE FROM tec_inventario_contagens WHERE inventario_item_id = ?").run(linha.id);
    db.prepare(
      "UPDATE tec_inventario_itens SET modo='final', contado=0, quantidade_contada=NULL, updated_at=? WHERE id=?"
    ).run(now, linha.id);
    db.prepare("UPDATE tec_inventarios SET updated_at = ? WHERE id = ?").run(now, id);
  });

  run();
  broadcast("tecnicos");
  res.json(carregarInventario(id));
});

// ---- Finalização ----

router.post("/:id/finalizar", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM tec_inventarios WHERE id = ?").get(id);
  if (!exigirEmAndamento(inv, res)) return;

  const aceitarSaldoAlterado = !!(req.body || {}).aceitarSaldoAlterado;

  const linhas = db
    .prepare(
      `SELECT tii.*, ti.nome, ti.quantidade AS saldo_atual
       FROM tec_inventario_itens tii JOIN tec_itens ti ON ti.id = tii.item_id
       WHERE tii.inventario_id = ? AND tii.contado = 1`
    )
    .all(id);

  const alterados = linhas.filter((l) => l.saldo_atual !== l.saldo_inicial);
  if (alterados.length && !aceitarSaldoAlterado) {
    return res.status(409).json({
      error: "O saldo de alguns itens mudou desde o início da contagem (outra movimentação aconteceu). Revise antes de finalizar.",
      itensComSaldoAlterado: alterados.map((l) => ({
        itemId: l.item_id,
        nome: l.nome,
        saldoInicial: l.saldo_inicial,
        saldoAtual: l.saldo_atual,
        quantidadeContada: l.quantidade_contada,
      })),
    });
  }

  const run = transaction(() => {
    const now = nowStamp();
    const motivo = inv.motivo || "Inventário físico";
    for (const l of linhas) {
      const saldoAtual = l.saldo_atual;
      const diferenca = l.quantidade_contada - saldoAtual;
      if (diferenca !== 0) {
        db.prepare("UPDATE tec_itens SET quantidade = ? WHERE id = ?").run(l.quantidade_contada, l.item_id);
        const direcao = diferenca > 0 ? "Sobra" : "Falta";
        db.prepare(
          "INSERT INTO tec_movimentos (tipo,alvo,quantidade,motivo,detalhe,responsible,created_by,created_at) VALUES ('AJUSTE_INVENTARIO',?,?,?,?,?,?,?)"
        ).run(
          l.nome,
          diferenca,
          motivo,
          `${direcao} de ${Math.abs(diferenca)} · Inventário ${inv.numero} · Contagem: ${l.quantidade_contada} · Saldo anterior: ${saldoAtual}`,
          req.user.name,
          req.user.id,
          now
        );
      }
      db.prepare(
        "UPDATE tec_inventario_itens SET saldo_revisao=?, diferenca=?, saldo_posterior=? WHERE id=?"
      ).run(saldoAtual, diferenca, l.quantidade_contada, l.id);
    }
    db.prepare(
      "UPDATE tec_inventarios SET status='concluido', finalized_by=?, concluded_at=?, updated_at=? WHERE id=?"
    ).run(req.user.id, now, now, id);
  });

  try {
    run();
    broadcast("tecnicos");
    res.json(carregarInventario(id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Não foi possível finalizar o inventário." });
  }
});

module.exports = router;
