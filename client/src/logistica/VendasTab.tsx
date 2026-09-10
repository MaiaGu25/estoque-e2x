import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { api } from "../api";
import type { LogOrcamento, LogOrcamentoItem, LogOrcamentoStatus, LogProduto, User } from "../types";
import { Empty, Field, fmt, Modal } from "./ui";
import { LocalizacaoAtual, PosicaoEstoque } from "./PosicaoSeletor";

const STATUS_LABEL: Record<LogOrcamentoStatus, string> = {
  aberto: "Aberto",
  aguardando_aprovacao: "Aguardando aprovação",
  fechado: "Fechado",
  cancelado: "Cancelado",
};

const STATUS_CLASS: Record<LogOrcamentoStatus, string> = {
  aberto: "transfer",
  aguardando_aprovacao: "warn",
  fechado: "ok",
  cancelado: "",
};

function StatusBadge({ status }: { status: LogOrcamentoStatus }) {
  return <span className={`status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

type ItemCarrinho = {
  productId: number;
  code: string;
  name: string;
  unit: string;
  notes: string;
  unitPrice: number;
  quantity: number;
  discountPct: number;
};

type OrcamentoCompleto = { orcamento: LogOrcamento; itens: LogOrcamentoItem[] };

export default function VendasTab({
  refreshKey,
  isAdmin,
  usuario,
  onAtualizado,
}: {
  refreshKey: number;
  isAdmin: boolean;
  usuario: User;
  onAtualizado: () => void;
}) {
  const [orcamentos, setOrcamentos] = useState<LogOrcamento[]>([]);
  const [descontoLimite, setDescontoLimite] = useState(10);
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [apenasMeus, setApenasMeus] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);
  const [abertoId, setAbertoId] = useState<number | null>(null);

  const carregar = async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (busca) params.set("busca", busca);
    if (apenasMeus) params.set("criadoPor", String(usuario.id));
    const r = await api.get<{ orcamentos: LogOrcamento[]; descontoLimiteSemAprovacao: number }>(`/api/logistica/orcamentos?${params.toString()}`);
    setOrcamentos(r.orcamentos);
    setDescontoLimite(r.descontoLimiteSemAprovacao);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, status, apenasMeus]);

  return (
    <section>
      <div className="segmented" style={{ maxWidth: 320 }}>
        <button className={apenasMeus ? "active in" : ""} onClick={() => setApenasMeus(true)}>
          Meus orçamentos
        </button>
        <button className={!apenasMeus ? "active in" : ""} onClick={() => setApenasMeus(false)}>
          Todos
        </button>
      </div>
      <div className="filters">
        <div>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número ou cliente" onKeyDown={(e) => e.key === "Enter" && carregar()} />
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={carregar}>
          <Search size={15} /> Filtrar
        </button>
        <button className="secondary" onClick={() => setModalNovo(true)}>
          <Plus size={16} /> Novo orçamento
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Responsável</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orcamentos.map((o) => (
              <tr key={o.id} onClick={() => setAbertoId(o.id)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{o.numero}</b>
                </td>
                <td>{o.customer_name || "—"}</td>
                <td>{o.responsible}</td>
                <td className="num">R$ {fmt(o.total)}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orcamentos.length && <Empty text="Nenhum orçamento por aqui ainda." />}
      </div>

      {modalNovo && (
        <OrcamentoModal
          usuario={usuario}
          descontoLimite={descontoLimite}
          existente={null}
          onClose={() => setModalNovo(false)}
          onSaved={() => {
            setModalNovo(false);
            carregar();
            onAtualizado();
          }}
        />
      )}
      {abertoId != null && (
        <DetalheOrcamentoModal
          id={abertoId}
          isAdmin={isAdmin}
          usuario={usuario}
          descontoLimite={descontoLimite}
          onClose={() => setAbertoId(null)}
          onAtualizado={() => {
            carregar();
            onAtualizado();
          }}
        />
      )}
    </section>
  );
}

// Busca de produto pensada pro vendedor: mostra preço e observação do
// produto já na lista suspensa, pra ele decidir na hora sem abrir mais
// telas.
function BuscaProdutoVenda({ onSelect }: { onSelect: (p: LogProduto) => void }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<LogProduto[]>([]);
  const [aberto, setAberto] = useState(false);

  const buscar = async (q: string) => {
    setQuery(q);
    const r = await api.get<{ produtos: LogProduto[] }>(`/api/logistica/produtos/busca?q=${encodeURIComponent(q)}`);
    setResultados(r.produtos);
  };

  const selecionar = (p: LogProduto) => {
    onSelect(p);
    setQuery("");
    setResultados([]);
    setAberto(false);
  };

  return (
    <div className="part-search">
      <Search />
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => {
          setAberto(true);
          if (!query) buscar("");
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados.length) {
            e.preventDefault();
            selecionar(resultados[0]);
          }
        }}
        placeholder="Digite ou clique para ver os produtos"
      />
      {aberto && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selecionar(p)}>
              <span>
                <b>{p.code}</b> · {p.name}
                {p.notes && <small style={{ display: "block" }}>{p.notes}</small>}
              </span>
              <small>
                R$ {fmt(p.sale_price)} · saldo {fmt(p.saldo_total)} {p.unit}
              </small>
            </button>
          ))}
          {!resultados.length && <p className="cart-empty">Nenhum produto encontrado.</p>}
        </div>
      )}
    </div>
  );
}

// Monta e edita o orçamento. Não mexe em estoque nenhum - só quando a
// venda é fechada de verdade (FecharOrcamentoModal) é que sai alguma
// coisa do galpão.
function OrcamentoModal({
  usuario,
  descontoLimite,
  existente,
  onClose,
  onSaved,
}: {
  usuario: User;
  descontoLimite: number;
  existente: OrcamentoCompleto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState(existente?.orcamento.customer_name || "");
  const [customerContact, setCustomerContact] = useState(existente?.orcamento.customer_contact || "");
  const [notes, setNotes] = useState(existente?.orcamento.notes || "");
  const [responsible, setResponsible] = useState(existente?.orcamento.responsible || usuario.name);
  const [itens, setItens] = useState<ItemCarrinho[]>(
    (existente?.itens || []).map((i) => ({
      productId: i.product_id,
      code: i.product_code,
      name: i.product_name,
      unit: i.product_unit,
      notes: i.product_notes,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      discountPct: i.discount_pct,
    }))
  );
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const adicionar = (p: LogProduto) => {
    setItens((atual) => {
      const idx = atual.findIndex((i) => i.productId === p.id);
      if (idx >= 0) {
        const copia = [...atual];
        copia[idx] = { ...copia[idx], quantity: copia[idx].quantity + 1 };
        return copia;
      }
      return [...atual, { productId: p.id, code: p.code, name: p.name, unit: p.unit, notes: p.notes, unitPrice: p.sale_price, quantity: 1, discountPct: 0 }];
    });
  };

  const atualizarItem = (idx: number, patch: Partial<ItemCarrinho>) => {
    setItens((atual) => atual.map((i, ix) => (ix === idx ? { ...i, ...patch } : i)));
  };

  const removerItem = (idx: number) => setItens((atual) => atual.filter((_, ix) => ix !== idx));

  const linhaTotal = (i: ItemCarrinho) => i.quantity * i.unitPrice * (1 - i.discountPct / 100);
  const subtotal = itens.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = itens.reduce((s, i) => s + linhaTotal(i), 0);
  const descontoTotal = subtotal - total;
  const maiorDesconto = itens.reduce((m, i) => Math.max(m, i.discountPct), 0);

  const salvar = async () => {
    if (!itens.length) return setErr("Adicione ao menos um item.");
    if (!responsible.trim()) return setErr("Informe o responsável.");
    setSaving(true);
    setErr("");
    try {
      const body = {
        customerName,
        customerContact,
        notes,
        responsible,
        itens: itens.map((i) => ({ productId: i.productId, quantity: i.quantity, discountPct: i.discountPct })),
      };
      if (existente) {
        await api.patch(`/api/logistica/orcamentos/${existente.orcamento.id}`, body);
      } else {
        await api.post("/api/logistica/orcamentos", body);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={existente ? `Editar orçamento ${existente.orcamento.numero}` : "Novo orçamento"}
      subtitle="Monte a simulação com os produtos e o desconto - isso ainda não mexe no estoque."
      onClose={onClose}
      wide
    >
      <div className="form-grid">
        <Field label="Cliente">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" />
        </Field>
        <Field label="Contato">
          <input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} placeholder="Telefone ou e-mail" />
        </Field>
      </div>

      <Field label="Adicionar produto">
        <BuscaProdutoVenda onSelect={adicionar} />
      </Field>

      {itens.length > 0 && (
        <div className="cart" style={{ margin: "4px 0 16px" }}>
          {itens.map((i, idx) => (
            <div key={i.productId} className="cart-row" style={{ gridTemplateColumns: "1fr 80px 80px 110px 32px" }}>
              <span>
                <b>{i.code}</b> · {i.name}
                {i.notes && <small style={{ display: "block" }}>{i.notes}</small>}
              </span>
              <input
                type="number"
                min="0.01"
                step="1"
                value={i.quantity}
                onChange={(e) => atualizarItem(idx, { quantity: Number(e.target.value) })}
                title="Quantidade"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={i.discountPct}
                onChange={(e) => atualizarItem(idx, { discountPct: Number(e.target.value) })}
                title="Desconto %"
              />
              <b style={{ textAlign: "right" }}>R$ {fmt(linhaTotal(i))}</b>
              <button onClick={() => removerItem(idx)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="detail-meta" style={{ marginBottom: 14 }}>
        <div>
          <span>Subtotal</span>
          <b>R$ {fmt(subtotal)}</b>
        </div>
        <div>
          <span>Desconto</span>
          <b>R$ {fmt(descontoTotal)}</b>
        </div>
        <div>
          <span>Total</span>
          <b>R$ {fmt(total)}</b>
        </div>
      </div>

      {maiorDesconto > descontoLimite && (
        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 14px", color: "#b66a00" }}>
          O desconto de {maiorDesconto}% passa do limite de {descontoLimite}% sem aprovação - esse orçamento vai ficar aguardando um administrador liberar
          antes de poder ser fechado.
        </p>
      )}

      <div className="form-grid">
        <Field label="Responsável *">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
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
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Salvando…" : "Salvar orçamento"}
        </button>
      </div>
    </Modal>
  );
}

function DetalheOrcamentoModal({
  id,
  isAdmin,
  usuario,
  descontoLimite,
  onClose,
  onAtualizado,
}: {
  id: number;
  isAdmin: boolean;
  usuario: User;
  descontoLimite: number;
  onClose: () => void;
  onAtualizado: () => void;
}) {
  const [dados, setDados] = useState<OrcamentoCompleto | null>(null);
  const [editando, setEditando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [err, setErr] = useState("");
  const [processando, setProcessando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get<OrcamentoCompleto>(`/api/logistica/orcamentos/${id}`);
      setDados(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o orçamento.");
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const aprovar = async () => {
    setProcessando(true);
    setErr("");
    try {
      await api.post(`/api/logistica/orcamentos/${id}/aprovar`);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível aprovar o orçamento.");
    } finally {
      setProcessando(false);
    }
  };

  const cancelar = async () => {
    setProcessando(true);
    setErr("");
    try {
      await api.post(`/api/logistica/orcamentos/${id}/cancelar`);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cancelar o orçamento.");
    } finally {
      setProcessando(false);
    }
  };

  if (!dados) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  if (editando) {
    return (
      <OrcamentoModal
        usuario={usuario}
        descontoLimite={descontoLimite}
        existente={dados}
        onClose={() => setEditando(false)}
        onSaved={async () => {
          setEditando(false);
          await carregar();
          onAtualizado();
        }}
      />
    );
  }

  if (fechando) {
    return (
      <FecharOrcamentoModal
        orcamento={dados.orcamento}
        itens={dados.itens}
        onClose={() => setFechando(false)}
        onFechado={async () => {
          setFechando(false);
          await carregar();
          onAtualizado();
        }}
      />
    );
  }

  const { orcamento, itens } = dados;

  return (
    <Modal title={`Orçamento ${orcamento.numero}`} subtitle={orcamento.customer_name || "Sem cliente informado"} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <StatusBadge status={orcamento.status} />
      </div>

      <div className="table-card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Qtd.</th>
              <th className="num">Preço</th>
              <th className="num">Desconto</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td>
                  <b className="code">{i.product_code}</b>
                  <small>
                    {i.product_name}
                    {i.product_notes ? ` · ${i.product_notes}` : ""}
                  </small>
                </td>
                <td className="num">
                  {fmt(i.quantity)} {i.product_unit}
                </td>
                <td className="num">R$ {fmt(i.unit_price)}</td>
                <td className="num">{i.discount_pct > 0 ? `${i.discount_pct}%` : "—"}</td>
                <td className="num">R$ {fmt(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="detail-meta" style={{ marginBottom: 14 }}>
        <div>
          <span>Subtotal</span>
          <b>R$ {fmt(orcamento.subtotal)}</b>
        </div>
        <div>
          <span>Desconto</span>
          <b>R$ {fmt(orcamento.discount_total)}</b>
        </div>
        <div>
          <span>Total</span>
          <b>R$ {fmt(orcamento.total)}</b>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="modal-actions" style={{ flexWrap: "wrap" }}>
        <button className="secondary" onClick={onClose}>
          Fechar
        </button>
        {(orcamento.status === "aberto" || orcamento.status === "aguardando_aprovacao") && (
          <>
            <button className="secondary" onClick={() => setEditando(true)}>
              Editar
            </button>
            <button className="secondary" onClick={cancelar} disabled={processando}>
              Cancelar orçamento
            </button>
          </>
        )}
        {orcamento.status === "aguardando_aprovacao" && isAdmin && (
          <button className="primary" onClick={aprovar} disabled={processando}>
            Aprovar desconto
          </button>
        )}
        {orcamento.status === "aberto" && (
          <button className="primary" onClick={() => setFechando(true)}>
            Fechar venda
          </button>
        )}
      </div>
    </Modal>
  );
}

// Passo final: escolhe de qual posição sai cada item vendido (sozinho se
// só tiver um lugar) e só então dá baixa de verdade no estoque.
function FecharOrcamentoModal({
  orcamento,
  itens,
  onClose,
  onFechado,
}: {
  orcamento: LogOrcamento;
  itens: LogOrcamentoItem[];
  onClose: () => void;
  onFechado: () => void;
}) {
  const [posicoes, setPosicoes] = useState<Record<number, number>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const escolher = (itemId: number, p: PosicaoEstoque) => {
    setPosicoes((atual) => ({ ...atual, [itemId]: p.position_id }));
  };

  const tudoResolvido = itens.every((i) => posicoes[i.id]);

  const confirmar = async () => {
    if (!tudoResolvido) return setErr("Escolha a posição de origem de todos os itens.");
    setSaving(true);
    setErr("");
    try {
      await api.post(`/api/logistica/orcamentos/${orcamento.id}/fechar`, {
        itens: itens.map((i) => ({ itemId: i.id, positionId: posicoes[i.id] })),
      });
      onFechado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível fechar a venda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Fechar venda · ${orcamento.numero}`} subtitle="Confirme de onde cada item vai sair do estoque." onClose={onClose} wide>
      {itens.map((i) => (
        <div key={i.id} style={{ marginBottom: 18 }}>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 6px" }}>
            <b>{i.product_code}</b> · {i.product_name} · {fmt(i.quantity)} {i.product_unit}
          </p>
          <LocalizacaoAtual
            produtoId={i.product_id}
            selecionadaId={posicoes[i.id] ?? null}
            onSelecionar={(p) => escolher(i.id, p)}
            vazio="Esse produto não está guardado em nenhuma posição no momento."
          />
        </div>
      ))}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Voltar
        </button>
        <button className="primary" disabled={saving || !tudoResolvido} onClick={confirmar}>
          {saving ? "Fechando…" : "Confirmar fechamento"}
        </button>
      </div>
    </Modal>
  );
}
