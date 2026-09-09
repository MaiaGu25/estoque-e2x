import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronRight, ClipboardEdit } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogProduto, User } from "../types";
import { Field, fmt, Modal } from "./ui";
import { PosicaoSeletor, ProdutoBusca } from "./PosicaoSeletor";

type ModalTipo = null | "entrada" | "saida" | "transferencia" | "ajuste";

export default function MovimentacoesTab({ mapa, onRegistrado, usuario }: { mapa: LogMapa; onRegistrado: () => void; usuario: User }) {
  const [modal, setModal] = useState<ModalTipo>(null);

  const acoes: { tipo: ModalTipo; titulo: string; descricao: string; icon: any; classe: string }[] = [
    { tipo: "entrada", titulo: "Entrada", descricao: "Registrar chegada de mercadoria numa posição", icon: ArrowDownToLine, classe: "in" },
    { tipo: "saida", titulo: "Saída", descricao: "Registrar retirada de mercadoria de uma posição", icon: ArrowUpFromLine, classe: "out" },
    { tipo: "transferencia", titulo: "Transferência", descricao: "Mover produto de uma posição para outra", icon: ArrowLeftRight, classe: "in" },
    { tipo: "ajuste", titulo: "Ajuste de inventário", descricao: "Corrigir o saldo com a contagem física", icon: ClipboardEdit, classe: "out" },
  ];

  const fechar = () => setModal(null);
  const salvo = () => {
    setModal(null);
    onRegistrado();
  };

  return (
    <section>
      <div className="action-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {acoes.map((a) => (
          <button key={a.tipo} className={`big-action ${a.classe}`} onClick={() => setModal(a.tipo)}>
            <a.icon />
            <span>
              <b>{a.titulo}</b>
              <small>{a.descricao}</small>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>

      {modal === "entrada" && <EntradaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "saida" && <SaidaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "transferencia" && <TransferenciaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "ajuste" && <AjusteModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
    </section>
  );
}

function ProdutoSelecionado({ produto, onLimpar }: { produto: LogProduto; onLimpar: () => void }) {
  return (
    <div className="cart-row" style={{ gridTemplateColumns: "1fr 32px" }}>
      <span>
        <b>{produto.code}</b>
        <small>
          {produto.name} · saldo total {fmt(produto.saldo_total)} {produto.unit}
        </small>
      </span>
      <button onClick={onLimpar}>×</button>
    </div>
  );
}

function EntradaModal({ mapa, usuario, onClose, onSaved }: { mapa: LogMapa; usuario: User; onClose: () => void; onSaved: () => void }) {
  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(usuario.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!produto || !positionId || !reason.trim() || !responsible.trim() || quantity <= 0) {
      return setErr("Preencha produto, posição, quantidade, motivo e responsável.");
    }
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/entrada", { productId: produto.id, positionId, quantity, reason, responsible, notes });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar a entrada.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Entrada" subtitle="Registre a chegada de um produto numa posição do galpão." onClose={onClose}>
      {!produto ? (
        <Field label="Produto *">
          <ProdutoBusca onSelect={setProduto} />
        </Field>
      ) : (
        <div className="cart" style={{ marginBottom: 14 }}>
          <ProdutoSelecionado produto={produto} onLimpar={() => setProduto(null)} />
        </div>
      )}
      <PosicaoSeletor mapa={mapa} value={positionId} onChange={setPositionId} label="Posição de destino" />
      <div className="form-grid">
        <Field label="Quantidade *">
          <input type="number" min="0.01" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </Field>
        <Field label="Responsável *">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo *">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Recebimento de fornecedor" />
      </Field>
      <Field label="Observação">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Registrando…" : "Confirmar entrada"}
        </button>
      </div>
    </Modal>
  );
}

function SaidaModal({ mapa, usuario, onClose, onSaved }: { mapa: LogMapa; usuario: User; onClose: () => void; onSaved: () => void }) {
  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(usuario.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!produto || !positionId || !reason.trim() || !responsible.trim() || quantity <= 0) {
      return setErr("Preencha produto, posição, quantidade, motivo e responsável.");
    }
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/saida", { productId: produto.id, positionId, quantity, reason, responsible, notes });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar a saída.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Saída" subtitle="Registre a retirada de um produto de uma posição do galpão." onClose={onClose}>
      {!produto ? (
        <Field label="Produto *">
          <ProdutoBusca onSelect={setProduto} />
        </Field>
      ) : (
        <div className="cart" style={{ marginBottom: 14 }}>
          <ProdutoSelecionado produto={produto} onLimpar={() => setProduto(null)} />
        </div>
      )}
      <PosicaoSeletor mapa={mapa} value={positionId} onChange={setPositionId} label="Posição de origem" />
      <div className="form-grid">
        <Field label="Quantidade *">
          <input type="number" min="0.01" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </Field>
        <Field label="Responsável *">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo *">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Envio para expedição" />
      </Field>
      <Field label="Observação">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Registrando…" : "Confirmar saída"}
        </button>
      </div>
    </Modal>
  );
}

function TransferenciaModal({ mapa, usuario, onClose, onSaved }: { mapa: LogMapa; usuario: User; onClose: () => void; onSaved: () => void }) {
  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [fromPositionId, setFromPositionId] = useState<number | null>(null);
  const [toPositionId, setToPositionId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(usuario.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!produto || !fromPositionId || !toPositionId || !reason.trim() || !responsible.trim() || quantity <= 0) {
      return setErr("Preencha produto, origem, destino, quantidade, motivo e responsável.");
    }
    if (fromPositionId === toPositionId) return setErr("Origem e destino não podem ser iguais.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/transferencia", {
        productId: produto.id,
        fromPositionId,
        toPositionId,
        quantity,
        reason,
        responsible,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar a transferência.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Transferência" subtitle="Mova um produto de uma posição para outra, sem alterar o saldo total." onClose={onClose} wide>
      {!produto ? (
        <Field label="Produto *">
          <ProdutoBusca onSelect={setProduto} />
        </Field>
      ) : (
        <div className="cart" style={{ marginBottom: 14 }}>
          <ProdutoSelecionado produto={produto} onLimpar={() => setProduto(null)} />
        </div>
      )}
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 6px" }}>
        Origem
      </p>
      <PosicaoSeletor mapa={mapa} value={fromPositionId} onChange={setFromPositionId} label="Posição de origem" />
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "10px 0 6px" }}>
        Destino
      </p>
      <PosicaoSeletor mapa={mapa} value={toPositionId} onChange={setToPositionId} excludeId={fromPositionId} label="Posição de destino" />
      <div className="form-grid">
        <Field label="Quantidade *">
          <input type="number" min="0.01" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </Field>
        <Field label="Responsável *">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo *">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Reorganização do galpão" />
      </Field>
      <Field label="Observação">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Registrando…" : "Confirmar transferência"}
        </button>
      </div>
    </Modal>
  );
}

function AjusteModal({ mapa, usuario, onClose, onSaved }: { mapa: LogMapa; usuario: User; onClose: () => void; onSaved: () => void }) {
  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [saldoAtual, setSaldoAtual] = useState<number | null>(null);
  const [quantidadeFisica, setQuantidadeFisica] = useState(0);
  const [reason, setReason] = useState("");
  const [responsible, setResponsible] = useState(usuario.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!produto || !positionId) {
      setSaldoAtual(null);
      return;
    }
    api
      .get<{ posicoes: { position_id: number; quantity: number }[] }>(`/api/logistica/produtos/${produto.id}`)
      .then((r) => {
        const pos = r.posicoes.find((p) => p.position_id === positionId);
        setSaldoAtual(pos ? pos.quantity : 0);
        setQuantidadeFisica(pos ? pos.quantity : 0);
      })
      .catch(() => setSaldoAtual(null));
  }, [produto, positionId]);

  const diferenca = saldoAtual !== null ? quantidadeFisica - saldoAtual : null;

  const salvar = async () => {
    if (!produto || !positionId || !reason.trim() || !responsible.trim()) {
      return setErr("Preencha produto, posição, motivo e responsável.");
    }
    if (diferenca === 0) return setErr("A quantidade informada é igual à registrada. Não há o que ajustar.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/ajuste", { productId: produto.id, positionId, quantidadeFisica, reason, responsible, notes });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar o ajuste.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Ajuste de inventário" subtitle="Informe a quantidade física encontrada numa posição." onClose={onClose}>
      {!produto ? (
        <Field label="Produto *">
          <ProdutoBusca onSelect={setProduto} />
        </Field>
      ) : (
        <div className="cart" style={{ marginBottom: 14 }}>
          <ProdutoSelecionado produto={produto} onLimpar={() => setProduto(null)} />
        </div>
      )}
      <PosicaoSeletor mapa={mapa} value={positionId} onChange={setPositionId} label="Posição a conferir" />

      {positionId && saldoAtual !== null && (
        <div className="detail-meta" style={{ marginTop: 12 }}>
          <div>
            <span>Saldo registrado</span>
            <b>{fmt(saldoAtual)}</b>
          </div>
          <div>
            <span>Diferença</span>
            <b style={{ color: diferenca === 0 ? undefined : diferenca! > 0 ? "#078348" : "#b83224" }}>
              {diferenca !== null ? (diferenca > 0 ? `+${fmt(diferenca)}` : fmt(diferenca)) : "—"}
            </b>
          </div>
        </div>
      )}

      <Field label="Quantidade física encontrada *">
        <input type="number" min="0" step="1" value={quantidadeFisica} onChange={(e) => setQuantidadeFisica(Number(e.target.value))} />
      </Field>
      <div className="form-grid">
        <Field label="Responsável *">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </Field>
        <Field label="Motivo *">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Contagem física periódica" />
        </Field>
      </div>
      <Field label="Observação">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || diferenca === 0} onClick={salvar}>
          {saving ? "Registrando…" : "Confirmar ajuste"}
        </button>
      </div>
    </Modal>
  );
}
