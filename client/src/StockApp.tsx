import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, BarChart3, Boxes, ChevronRight,
  ClipboardList, Download, History, LayoutDashboard, LogOut, Menu, PackagePlus,
  Pencil, Plus, RefreshCw, Search, ShieldCheck, TriangleAlert, Users as UsersIcon, X,
} from "lucide-react";
import { api } from "./api";
import type { Data, Member, Movement, Order, Part, User } from "./types";
import UsersPanel from "./UsersPanel";

const empty: Data = { parts: [], movements: [], orders: [], members: [], reasons: [] };

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function StockApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const isAdmin = user.role === "admin";
  const tabs = [
    ["dashboard", "Visão geral", LayoutDashboard],
    ["estoque", "Estoque", Boxes],
    ["movimentar", "Movimentar", ArrowDownToLine],
    ["ordens", "Ordens", ClipboardList],
    ["historico", "Histórico", History],
    ["relatorios", "Relatórios", BarChart3],
    ...(isAdmin ? [["usuarios", "Usuários", UsersIcon] as const] : []),
  ] as const;

  const [tab, setTab] = useState<string>("dashboard");
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState<null | "order" | "part">(null);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const q = from && to ? `?from=${from}&to=${to}` : "";
      const d = await api.get<Data>("/api/data" + q);
      setData(d);
    } catch {
      setError("Não foi possível carregar os dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return !q
      ? data.parts
      : data.parts.filter((p) =>
          (p.code + " " + p.name + " " + p.category + " " + p.location).toLocaleLowerCase("pt-BR").includes(q)
        );
  }, [data.parts, search]);

  const low = data.parts.filter((p) => p.quantity <= p.minimum_stock);
  const total = data.parts.reduce((s, p) => s + p.quantity, 0);
  const week = data.movements.filter((m) => Date.now() - new Date(m.created_at.replace(" ", "T") + "Z").getTime() < 7 * 864e5);
  const outWeek = week.filter((m) => m.type === "SAIDA").reduce((s, m) => s + m.quantity, 0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>ESTOQUE E2X</strong>
            <span>Controle inteligente</span>
          </div>
          <button className="icon-btn close-nav" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <button className="nav-item back-to-hub" onClick={onHome}>
          <ArrowLeft size={17} />
          <span>Central E2X</span>
        </button>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setTab(id);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {tab === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>
              <ShieldCheck size={12} /> {isAdmin ? "Administrador" : "Operador"}
            </span>
          </div>
          <button className="icon-btn" title="Sair" onClick={onLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <button className="icon-btn menu-btn" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div>
            <p>Estoque E2X</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={load}>
              <RefreshCw size={16} /> Atualizar
            </button>
            {tab !== "usuarios" && (
              <button className="primary" onClick={() => setModal("order")}>
                <Plus size={17} /> Nova ordem
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="error">
            <TriangleAlert size={18} />
            {error}
          </div>
        )}
        {loading ? (
          <div className="loading">
            <RefreshCw className="spin" /> Sincronizando estoque…
          </div>
        ) : (
          <>
            {tab === "dashboard" && (
              <section>
                <div className="hero">
                  <div>
                    <span className="eyebrow">RESUMO OPERACIONAL</span>
                    <h2>Estoque sob controle, em tempo real.</h2>
                    <p>Acompanhe saldo, movimentações e alertas em uma única visão.</p>
                  </div>
                  <button
                    onClick={() => {
                      setTab("movimentar");
                      setModal("order");
                    }}
                  >
                    Registrar movimentação <ChevronRight size={18} />
                  </button>
                </div>
                <div className="stats">
                  <Stat icon={Boxes} label="Peças cadastradas" value={fmt(data.parts.length)} note="itens ativos" />
                  <Stat icon={Archive} label="Unidades em estoque" value={fmt(total)} note="saldo consolidado" />
                  <Stat
                    icon={ArrowUpFromLine}
                    label="Saídas em 7 dias"
                    value={fmt(outWeek)}
                    note={`${week.filter((m) => m.type === "SAIDA").length} registros`}
                  />
                  <Stat icon={TriangleAlert} label="Estoque baixo" value={fmt(low.length)} note="exigem atenção" alert={!!low.length} />
                </div>
                <div className="grid-two">
                  <Panel title="Movimentações recentes" action="Ver histórico" onAction={() => setTab("historico")}>
                    <MovementTable rows={data.movements.slice(0, 7)} />
                  </Panel>
                  <Panel title="Destino das saídas" subtitle="Volume acumulado por motivo">
                    <div className="reason-list">
                      {data.reasons.slice(0, 6).map((r) => {
                        const max = data.reasons[0]?.quantity || 1;
                        return (
                          <div className="reason" key={r.reason}>
                            <div>
                              <span>{r.reason}</span>
                              <b>{fmt(r.quantity)}</b>
                            </div>
                            <div className="bar">
                              <i style={{ width: `${Math.max(4, (r.quantity / max) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                </div>
              </section>
            )}
            {tab === "estoque" && (
              <section>
                <Toolbar search={search} setSearch={setSearch} placeholder="Pesquise por código, nome, categoria ou local…" action="Nova peça" onAction={() => setModal("part")} />
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Peça</th>
                        <th>Categoria</th>
                        <th>Local</th>
                        <th className="num">Saldo</th>
                        <th>Status</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <b className="code">{p.code}</b>
                          </td>
                          <td>
                            <strong>{p.name}</strong>
                            <small>{p.unit}</small>
                          </td>
                          <td>{p.category}</td>
                          <td>{p.location || "—"}</td>
                          <td className="num">
                            <b>{fmt(p.quantity)}</b>
                          </td>
                          <td>
                            <span className={p.quantity <= p.minimum_stock ? "status warn" : "status ok"}>
                              {p.quantity <= p.minimum_stock ? "Baixo" : "Disponível"}
                            </span>
                          </td>
                          {isAdmin && (
                            <td>
                              <button className="icon-btn" title="Editar" onClick={() => setEditingPart(p)}>
                                <Pencil size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && <Empty text="Nenhuma peça encontrada." />}
                </div>
              </section>
            )}
            {tab === "movimentar" && (
              <section>
                <div className="action-grid">
                  <button className="big-action in" onClick={() => setModal("order")}>
                    <ArrowDownToLine />
                    <span>
                      <b>Entrada em lote</b>
                      <small>Adicione várias peças de uma vez</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button className="big-action out" onClick={() => setModal("order")}>
                    <ArrowUpFromLine />
                    <span>
                      <b>Saída / Ordem de serviço</b>
                      <small>Monte uma lista completa para retirada</small>
                    </span>
                    <ChevronRight />
                  </button>
                </div>
                <Panel title="Últimas movimentações">
                  <MovementTable rows={data.movements.slice(0, 15)} />
                </Panel>
              </section>
            )}
            {tab === "ordens" && (
              <section>
                <Toolbar search={search} setSearch={setSearch} placeholder="Buscar número, motivo ou responsável…" action="Nova ordem" onAction={() => setModal("order")} />
                <div className="order-grid">
                  {data.orders
                    .filter((o) => (o.number + " " + o.reason + " " + o.responsible).toLowerCase().includes(search.toLowerCase()))
                    .map((o) => (
                      <button className="order-card" key={o.id} onClick={() => setSelectedOrder(o)}>
                        <div>
                          <span className={o.type === "ENTRADA" ? "pill in" : "pill out"}>{o.type}</span>
                          <small>{dt(o.created_at)}</small>
                        </div>
                        <h3>{o.number}</h3>
                        <p>{o.reason}</p>
                        <footer>
                          <span>{o.responsible}</span>
                          <b>
                            {o.item_count} itens · {fmt(o.total_quantity)} un.
                          </b>
                        </footer>
                      </button>
                    ))}
                </div>
                {!data.orders.length && <Empty text="As novas entradas e saídas em lote aparecerão aqui." />}
              </section>
            )}
            {tab === "historico" && (
              <section>
                <div className="filters">
                  <div>
                    <label>Data inicial</label>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div>
                    <label>Data final</label>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                  <button className="primary" onClick={load}>
                    Aplicar período
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                      setTimeout(load);
                    }}
                  >
                    Limpar
                  </button>
                </div>
                <Panel title="Histórico completo" subtitle={`${data.movements.length} movimentações encontradas`}>
                  <MovementTable rows={data.movements} />
                </Panel>
              </section>
            )}
            {tab === "relatorios" && <Reports data={data} from={from} to={to} />}
            {tab === "usuarios" && isAdmin && <UsersPanel currentUser={user} />}
          </>
        )}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      {modal === "order" && (
        <OrderModal
          parts={data.parts}
          members={data.members}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
            setTab("ordens");
          }}
        />
      )}
      {modal === "part" && (
        <PartModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {editingPart && (
        <EditPartModal
          part={editingPart}
          onClose={() => setEditingPart(null)}
          onSaved={() => {
            setEditingPart(null);
            load();
          }}
        />
      )}
      {selectedOrder && (
        <OrderDetails order={selectedOrder} rows={data.movements.filter((m) => m.order_id === selectedOrder.id)} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, note, alert }: { icon: any; label: string; value: string; note: string; alert?: boolean }) {
  return (
    <article className={alert ? "stat alert-stat" : "stat"}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <Icon />
    </article>
  );
}

function Panel({ title, subtitle, action, onAction, children }: { title: string; subtitle?: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && (
          <button onClick={onAction}>
            {action}
            <ChevronRight size={15} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Toolbar({ search, setSearch, placeholder, action, onAction }: { search: string; setSearch: (v: string) => void; placeholder: string; action: string; onAction: () => void }) {
  return (
    <div className="toolbar">
      <div className="search">
        <Search />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} />
        {search && (
          <button onClick={() => setSearch("")}>
            <X />
          </button>
        )}
      </div>
      <button className="primary" onClick={onAction}>
        <Plus size={17} />
        {action}
      </button>
    </div>
  );
}

function MovementTable({ rows }: { rows: Movement[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Peça</th>
            <th>Tipo</th>
            <th>Motivo</th>
            <th>Responsável</th>
            <th className="num">Qtd.</th>
            <th className="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{dt(m.created_at)}</td>
              <td>
                <b className="code">{m.code}</b>
                <small>{m.part_name}</small>
              </td>
              <td>
                <span className={m.type === "ENTRADA" ? "pill in" : "pill out"}>{m.type}</span>
              </td>
              <td>{m.reason}</td>
              <td>{m.responsible}</td>
              <td className="num">
                <b>
                  {m.type === "ENTRADA" ? "+" : "−"}
                  {fmt(m.quantity)}
                </b>
              </td>
              <td className="num">{fmt(m.new_balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Archive />
      <p>{text}</p>
    </div>
  );
}

function OrderModal({ parts, onClose, onSaved }: { parts: Part[]; members: Member[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"ENTRADA" | "SAIDA">("SAIDA");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ partId: number; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const found = parts.filter((p) => (p.code + " " + p.name).toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  const add = (id: number) => {
    setItems((x) => (x.some((i) => i.partId === id) ? x : [...x, { partId: id, quantity: 1 }]));
    setQuery("");
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/orders", { type, reason, notes, items });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar a ordem.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nova ordem de estoque" subtitle="Inclua quantos itens precisar antes de confirmar." onClose={onClose}>
      <div className="segmented">
        <button className={type === "ENTRADA" ? "active in" : ""} onClick={() => setType("ENTRADA")}>
          <ArrowDownToLine />
          Entrada
        </button>
        <button className={type === "SAIDA" ? "active out" : ""} onClick={() => setType("SAIDA")}>
          <ArrowUpFromLine />
          Saída / OS
        </button>
      </div>
      <Field label="Motivo *">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Shopee, Mercado Livre, RMA…" />
      </Field>
      <Field label="Adicionar peças">
        <div className="part-search">
          <Search />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite o código ou nome da peça" />
          {query && (
            <div className="results">
              {found.map((p) => (
                <button key={p.id} onClick={() => add(p.id)}>
                  <span>
                    <b>{p.code}</b> · {p.name}
                  </span>
                  <small>Saldo: {fmt(p.quantity)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <div className="cart">
        <div className="cart-head">
          <b>Itens da ordem</b>
          <span>{items.length} selecionados</span>
        </div>
        {items.map((i, idx) => {
          const p = parts.find((x) => x.id === i.partId)!;
          return (
            <div className="cart-row" key={i.partId}>
              <span>
                <b>{p.code}</b>
                <small>
                  {p.name} · saldo {fmt(p.quantity)}
                </small>
              </span>
              <input
                type="number"
                min="0.01"
                step="1"
                value={i.quantity}
                onChange={(e) => setItems((x) => x.map((z, j) => (j === idx ? { ...z, quantity: Number(e.target.value) } : z)))}
              />
              <button onClick={() => setItems((x) => x.filter((z) => z.partId !== i.partId))}>
                <X />
              </button>
            </div>
          );
        })}
        {!items.length && <p className="cart-empty">Pesquise uma peça acima para começar a lista.</p>}
      </div>
      <Field label="Observação">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: quem retirou, número do pedido, observações adicionais" />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !items.length || !reason.trim()} onClick={save}>
          {saving ? "Registrando…" : "Confirmar ordem"}
        </button>
      </div>
    </Modal>
  );
}

function PartModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ code: "", name: "", category: "", unit: "UN", location: "", quantity: 0, minimumStock: 0 });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/parts", v);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar a peça.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Cadastrar nova peça" subtitle="Crie o item e defina seu saldo inicial." onClose={onClose}>
      <div className="form-grid">
        <Field label="Código *">
          <input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
        </Field>
        <Field label="Nome *">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
        </Field>
        <Field label="Localização">
          <input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </Field>
        <Field label="Saldo inicial">
          <input type="number" min="0" value={v.quantity} onChange={(e) => setV({ ...v, quantity: Number(e.target.value) })} />
        </Field>
        <Field label="Estoque mínimo">
          <input type="number" min="0" value={v.minimumStock} onChange={(e) => setV({ ...v, minimumStock: Number(e.target.value) })} />
        </Field>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={save}>
          <PackagePlus size={17} />
          {saving ? "Salvando…" : "Cadastrar peça"}
        </button>
      </div>
    </Modal>
  );
}

function EditPartModal({ part, onClose, onSaved }: { part: Part; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    name: part.name,
    category: part.category,
    unit: part.unit,
    location: part.location,
    minimumStock: part.minimum_stock,
    notes: part.notes,
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/api/parts/${part.id}`, v);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirm(`Desativar a peça ${part.code} - ${part.name}? Ela deixará de aparecer no estoque ativo.`)) return;
    setSaving(true);
    try {
      await api.patch(`/api/parts/${part.id}`, { active: false });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível desativar a peça.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Editar peça — ${part.code}`} subtitle="Somente administradores podem alterar o cadastro." onClose={onClose}>
      <div className="form-grid">
        <Field label="Nome">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
        </Field>
        <Field label="Unidade">
          <input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} />
        </Field>
        <Field label="Localização">
          <input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </Field>
        <Field label="Estoque mínimo">
          <input type="number" min="0" value={v.minimumStock} onChange={(e) => setV({ ...v, minimumStock: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Observações">
        <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <p className="cart-empty" style={{ textAlign: "left" }}>
        Para corrigir o saldo, use uma ordem de Entrada ou Saída — assim o histórico fica registrado.
      </p>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={deactivate} style={{ color: "#b64a3c" }} disabled={saving}>
          Desativar peça
        </button>
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function OrderDetails({ order, rows, onClose }: { order: Order; rows: Movement[]; onClose: () => void }) {
  return (
    <Modal title={order.number} subtitle={`${order.type} · ${dt(order.created_at)}`} onClose={onClose}>
      <div className="detail-meta">
        <div>
          <span>Motivo</span>
          <b>{order.reason}</b>
        </div>
        <div>
          <span>Responsável</span>
          <b>{order.responsible}</b>
        </div>
      </div>
      {order.notes && (
        <div className="detail-meta">
          <div>
            <span>Observação</span>
            <b>{order.notes}</b>
          </div>
        </div>
      )}
      <MovementTable rows={rows} />
      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

function Reports({ data, from, to }: { data: Data; from: string; to: string }) {
  const download = () => {
    const lines = [
      "RELATÓRIO DE ESTOQUE E2X",
      `Período: ${from || "início"} a ${to || "hoje"}`,
      "",
      ...data.movements.map(
        (m) => `${dt(m.created_at)} | ${m.type} | ${m.code} - ${m.part_name} | ${m.quantity} ${m.unit} | ${m.reason} | ${m.responsible} | Saldo: ${m.new_balance}`
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio_estoque_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <section>
      <div className="report-hero">
        <div>
          <span className="eyebrow">EXPORTAÇÃO</span>
          <h2>Relatório de movimentações</h2>
          <p>Gere um arquivo TXT com todo o histórico do período aplicado.</p>
        </div>
        <button className="primary" onClick={download}>
          <Download />
          Baixar relatório .TXT
        </button>
      </div>
      <div className="stats">
        <Stat icon={ArrowDownToLine} label="Entradas" value={fmt(data.movements.filter((m) => m.type === "ENTRADA").reduce((s, m) => s + m.quantity, 0))} note="unidades no período" />
        <Stat icon={ArrowUpFromLine} label="Saídas" value={fmt(data.movements.filter((m) => m.type === "SAIDA").reduce((s, m) => s + m.quantity, 0))} note="unidades no período" />
        <Stat icon={ClipboardList} label="Ordens" value={fmt(data.orders.length)} note="ordens registradas" />
        <Stat icon={Boxes} label="Movimentações" value={fmt(data.movements.length)} note="linhas no relatório" />
      </div>
    </section>
  );
}
