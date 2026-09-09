import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronRight, ClipboardEdit, Inbox, PackagePlus } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogProduto, User } from "../types";
import { Empty, Field, fmt, Modal } from "./ui";
import { PosicaoSeletor, ProdutoBusca } from "./PosicaoSeletor";

type ModalTipo = null | "entrada" | "saida" | "transferencia" | "ajuste" | "organizar" | "chegada";

export default function MovimentacoesTab({ mapa, onRegistrado, usuario }: { mapa: LogMapa; onRegistrado: () => void; usuario: User }) {
  const [modal, setModal] = useState<ModalTipo>(null);

  const acoes: { tipo: ModalTipo; titulo: string; descricao: string; icon: any; classe: string }[] = [
    { tipo: "chegada", titulo: "Chegada de fornecedor", descricao: "Somar quantidade recebida de um produto que já existe", icon: PackagePlus, classe: "in" },
    { tipo: "entrada", titulo: "Entrada", descricao: "Registrar chegada de mercadoria numa posição", icon: ArrowDownToLine, classe: "in" },
    { tipo: "saida", titulo: "Saída", descricao: "Registrar retirada de mercadoria de uma posição", icon: ArrowUpFromLine, classe: "out" },
    { tipo: "transferencia", titulo: "Transferência", descricao: "Mover produto de uma posição para outra", icon: ArrowLeftRight, classe: "in" },
    { tipo: "ajuste", titulo: "Ajuste de inventário", descricao: "Corrigir o saldo com a contagem física", icon: ClipboardEdit, classe: "out" },
    { tipo: "organizar", titulo: "Organizar estoque não organizado", descricao: "Mover para o montante certo o que ainda está no recebimento", icon: Inbox, classe: "in" },
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

      {modal === "chegada" && <ChegadaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "entrada" && <EntradaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "saida" && <SaidaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "transferencia" && <TransferenciaModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "ajuste" && <AjusteModal mapa={mapa} usuario={usuario} onClose={fechar} onSaved={salvo} />}
      {modal === "organizar" && <OrganizarModal mapa={mapa} usuario={usuario} onClose={fechar} onRegistrado={onRegistrado} />}
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

// Atalho pra quando chega mais de um produto que já existe no cadastro:
// escolhe o produto, informa quanto chegou e pronto - entra direto no
// "Estoque não organizado", igual à quantidade inicial do cadastro, pra
// depois ser organizado no montante certo com o botão de Organizar.
function ChegadaModal({ mapa, usuario, onClose, onSaved }: { mapa: LogMapa; usuario: User; onClose: () => void; onSaved: () => void }) {
  const holdingPositionId = mapa.racks.find((r) => r.is_holding_area)?.sides[0]?.positions[0]?.id ?? null;

  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Chegada de fornecedor");
  const [responsible, setResponsible] = useState(usuario.name);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!produto || !holdingPositionId || !reason.trim() || !responsible.trim() || quantity <= 0) {
      return setErr("Escolha o produto, a quantidade, o motivo e o responsável.");
    }
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/entrada", {
        productId: produto.id,
        positionId: holdingPositionId,
        quantity,
        reason,
        responsible,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar a chegada.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Chegada de fornecedor" subtitle="Some mais unidades a um produto que já está cadastrado." onClose={onClose}>
      {!holdingPositionId ? (
        <Empty text="Não foi encontrada a posição de estoque não organizado." />
      ) : (
        <>
          {!produto ? (
            <Field label="Produto *">
              <ProdutoBusca onSelect={setProduto} />
            </Field>
          ) : (
            <div className="cart" style={{ marginBottom: 14 }}>
              <ProdutoSelecionado produto={produto} onLimpar={() => setProduto(null)} />
            </div>
          )}
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 14px" }}>
            Entra em "Estoque não organizado" - depois é só usar o botão Organizar pra colocar no montante certo.
          </p>
          <div className="form-grid">
            <Field label="Quantidade recebida *">
              <input type="number" min="0.01" step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </Field>
            <Field label="Responsável *">
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </Field>
          </div>
          <Field label="Motivo *">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
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
              {saving ? "Registrando…" : "Confirmar chegada"}
            </button>
          </div>
        </>
      )}
    </Modal>
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

type ItemNaoOrganizado = { id: number; code: string; name: string; unit: string; quantity: number };

// Estoque não organizado é só uma posição especial (o "recebimento"); mover
// um item dela pra posição certa é uma transferência normal, com origem
// travada. O modal fica aberto entre um item e outro pra organizar vários
// de uma vez sem precisar reabrir.
function OrganizarModal({
  mapa,
  usuario,
  onClose,
  onRegistrado,
}: {
  mapa: LogMapa;
  usuario: User;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const holdingPositionId = mapa.racks.find((r) => r.is_holding_area)?.sides[0]?.positions[0]?.id ?? null;

  const [itens, setItens] = useState<ItemNaoOrganizado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [item, setItem] = useState<ItemNaoOrganizado | null>(null);
  const [toPositionId, setToPositionId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Organização de estoque");
  const [responsible, setResponsible] = useState(usuario.name);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    if (!holdingPositionId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const r = await api.get<{ produtos: ItemNaoOrganizado[] }>(`/api/logistica/mapa/posicoes/${holdingPositionId}`);
      setItens(r.produtos);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingPositionId]);

  const escolher = (i: ItemNaoOrganizado) => {
    setItem(i);
    setToPositionId(null);
    setQuantity(i.quantity);
    setErr("");
  };

  const salvar = async () => {
    if (!item || !holdingPositionId || !toPositionId || !reason.trim() || !responsible.trim() || quantity <= 0) {
      return setErr("Escolha o destino, a quantidade, o motivo e o responsável.");
    }
    if (quantity > item.quantity) return setErr("A quantidade não pode ser maior do que a disponível.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/movimentacoes/transferencia", {
        productId: item.id,
        fromPositionId: holdingPositionId,
        toPositionId,
        quantity,
        reason,
        responsible,
      });
      setItem(null);
      onRegistrado();
      await carregar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível organizar esse item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Organizar estoque não organizado"
      subtitle="Mova cada item recebido para o montante, lado e prateleira certos."
      onClose={onClose}
      wide
    >
      {!holdingPositionId ? (
        <Empty text="Não foi encontrada a posição de estoque não organizado." />
      ) : carregando ? (
        <p className="cart-empty">Carregando…</p>
      ) : !item ? (
        itens.length ? (
          <div className="cart">
            {itens.map((i) => (
              <button key={i.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto", width: "100%", textAlign: "left" }} onClick={() => escolher(i)}>
                <span>
                  <b>{i.code}</b>
                  <small>{i.name}</small>
                </span>
                <b>
                  {fmt(i.quantity)} {i.unit}
                </b>
              </button>
            ))}
          </div>
        ) : (
          <Empty text="Não há produtos aguardando organização." />
        )
      ) : (
        <>
          <div className="cart" style={{ marginBottom: 14 }}>
            <div className="cart-row" style={{ gridTemplateColumns: "1fr 32px" }}>
              <span>
                <b>{item.code}</b>
                <small>
                  {item.name} · disponível {fmt(item.quantity)} {item.unit}
                </small>
              </span>
              <button onClick={() => setItem(null)}>×</button>
            </div>
          </div>
          <PosicaoSeletor mapa={mapa} value={toPositionId} onChange={setToPositionId} excludeId={holdingPositionId} label="Posição de destino" />
          <div className="form-grid">
            <Field label="Quantidade *">
              <input type="number" min="0.01" max={item.quantity} step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </Field>
            <Field label="Responsável *">
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </Field>
          </div>
          <Field label="Motivo *">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {err && <div className="error">{err}</div>}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setItem(null)}>
              Voltar
            </button>
            <button className="primary" disabled={saving} onClick={salvar}>
              {saving ? "Organizando…" : "Confirmar"}
            </button>
          </div>
        </>
      )}
      {!item && (
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
    </Modal>
  );
}
