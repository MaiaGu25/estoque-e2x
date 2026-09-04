import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, BarChart3, ClipboardList, DollarSign, LogOut, Menu,
  MessageSquarePlus, Paperclip, Plus, RefreshCw, Search, ShieldCheck,
  TriangleAlert, X,
} from "lucide-react";
import { api } from "./api";
import type { RmaCaso, RmaEvento, RmaStats, RmaStatus, User } from "./types";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const fmtR$ = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const STATUS_LABEL: Record<RmaStatus, string> = {
  aguardando_devolucao: "Aguardando devolução",
  recebido: "Recebido",
  em_inspecao: "Em inspeção",
  concluido: "Concluído",
};
const STATUS_CLASS: Record<RmaStatus, string> = {
  aguardando_devolucao: "warn",
  recebido: "",
  em_inspecao: "warn",
  concluido: "ok",
};

const PLATAFORMAS = ["Mercado Livre", "Shopee", "Correios", "Outro"];

export default function RmaApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["painel", "Painel", BarChart3],
    ["casos", "Casos", ClipboardList],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [mobile, setMobile] = useState(false);
  const [modalNovo, setModalNovo] = useState(false);
  const [casoAberto, setCasoAberto] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>RMA / SAC</strong>
            <span>Devoluções &amp; disputas</span>
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
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>
              <ShieldCheck size={12} /> {user.role === "admin" ? "Administrador" : "Operador"}
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
            <p>RMA / SAC</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={recarregar}>
              <RefreshCw size={16} /> Atualizar
            </button>
            <button className="primary" onClick={() => setModalNovo(true)}>
              <Plus size={17} /> Novo caso
            </button>
          </div>
        </header>

        {tab === "painel" && <PainelTab refreshKey={refreshKey} onAbrirCaso={(id) => setCasoAberto(id)} />}
        {tab === "casos" && <CasosTab refreshKey={refreshKey} onAbrirCaso={(id) => setCasoAberto(id)} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}

      {modalNovo && (
        <NovoCasoModal
          onClose={() => setModalNovo(false)}
          onCriado={(id) => {
            setModalNovo(false);
            recarregar();
            setCasoAberto(id);
          }}
        />
      )}
      {casoAberto !== null && (
        <DetalheCasoModal
          id={casoAberto}
          onClose={() => setCasoAberto(null)}
          onAtualizado={recarregar}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, note, alert }: { icon: any; label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <article className={alert ? "stat alert-stat" : "stat"}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
      <Icon />
    </article>
  );
}

function StatusBadge({ status }: { status: RmaStatus }) {
  return <span className={`status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

function PainelTab({ refreshKey, onAbrirCaso }: { refreshKey: number; onAbrirCaso: (id: number) => void }) {
  const [stats, setStats] = useState<RmaStats | null>(null);
  const [recentes, setRecentes] = useState<RmaCaso[]>([]);

  useEffect(() => {
    api.get<RmaStats>("/api/rma/stats").then(setStats).catch(() => {});
    api.get<{ casos: RmaCaso[] }>("/api/rma").then((r) => setRecentes(r.casos.slice(0, 8))).catch(() => {});
  }, [refreshKey]);

  const emAberto = (stats?.porStatus.filter((s) => s.status !== "concluido").reduce((s, r) => s + r.n, 0)) || 0;

  return (
    <section>
      <div className="stats">
        <Stat icon={TriangleAlert} label="Casos em aberto" value={fmt(emAberto)} note="aguardando resolução" alert={!!emAberto} />
        <Stat icon={ClipboardList} label="Abertos hoje" value={fmt(stats?.abertosHoje ?? 0)} />
        <Stat icon={DollarSign} label="Reembolsado no mês" value={fmtR$(stats?.reembolsadoMes ?? 0)} note="para clientes" />
        <Stat icon={DollarSign} label="Cobrado da plataforma" value={fmtR$(stats?.cobradoMes ?? 0)} note="no mês" />
      </div>

      <div className="grid-two">
        <Panel title="Casos recentes">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Plataforma</th>
                  <th>Produto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((c) => (
                  <tr key={c.id} onClick={() => onAbrirCaso(c.id)} style={{ cursor: "pointer" }}>
                    <td>
                      <b className="code">{c.numero.replace("RMA-", "")}</b>
                    </td>
                    <td>{c.plataforma}</td>
                    <td>{c.produto}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentes.length && <Empty text="Nenhum caso registrado ainda." />}
          </div>
        </Panel>
        <Panel title="Por status">
          <div className="reason-list">
            {Object.entries(STATUS_LABEL).map(([key, label]) => {
              const n = stats?.porStatus.find((s) => s.status === key)?.n || 0;
              const max = Math.max(1, ...(stats?.porStatus.map((s) => s.n) || [1]));
              return (
                <div className="reason" key={key}>
                  <div>
                    <span>{label}</span>
                    <b>{n}</b>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
        </div>
      </div>
      {children}
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

function CasosTab({ refreshKey, onAbrirCaso }: { refreshKey: number; onAbrirCaso: (id: number) => void }) {
  const [casos, setCasos] = useState<RmaCaso[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [plataforma, setPlataforma] = useState("Todas");

  const carregar = async () => {
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    if (plataforma !== "Todas") params.set("plataforma", plataforma);
    const r = await api.get<{ casos: RmaCaso[] }>(`/api/rma?${params.toString()}`);
    setCasos(r.casos);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <section>
      <div className="filters">
        <div>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº, pedido, produto, cliente" />
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Plataforma</label>
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
            <option>Todas</option>
            {PLATAFORMAS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={carregar}>
          <Search size={15} /> Filtrar
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Plataforma</th>
              <th>Pedido</th>
              <th>Produto</th>
              <th>Motivo do cliente</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id} onClick={() => onAbrirCaso(c.id)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{c.numero.replace("RMA-", "")}</b>
                </td>
                <td>{c.plataforma}</td>
                <td>{c.pedido || "—"}</td>
                <td>
                  <strong>{c.produto}</strong>
                  {c.cliente && <small>{c.cliente}</small>}
                </td>
                <td>{c.motivo_cliente || "—"}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>{dt(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!casos.length && <Empty text="Nenhum caso encontrado." />}
      </div>
    </section>
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

function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={wide ? { width: "min(920px,100%)" } : undefined}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
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

function NovoCasoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: number) => void }) {
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0]);
  const [pedido, setPedido] = useState("");
  const [produto, setProduto] = useState("");
  const [cliente, setCliente] = useState("");
  const [motivoCliente, setMotivoCliente] = useState("");
  const [tecnicoResponsavel, setTecnicoResponsavel] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setErr("");
    if (!produto.trim()) return setErr("Descreva o produto.");
    setSaving(true);
    try {
      const res = await api.post<{ ok: boolean; id: number }>("/api/rma", {
        plataforma,
        pedido,
        produto,
        cliente,
        motivoCliente,
        tecnicoResponsavel,
      });
      onCriado(res.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o caso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo caso de devolução" subtitle="Registre assim que a plataforma avisar sobre a reclamação do cliente." onClose={onClose}>
      <div className="form-grid">
        <Field label="Plataforma">
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
            {PLATAFORMAS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Nº do pedido na plataforma">
          <input value={pedido} onChange={(e) => setPedido(e.target.value)} />
        </Field>
      </div>
      <Field label="Produto / máquina *">
        <input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Ex.: PC i5 2TH / 8GB / 480GB" />
      </Field>
      <div className="form-grid">
        <Field label="Cliente">
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </Field>
        <Field label="Técnico responsável">
          <input value={tecnicoResponsavel} onChange={(e) => setTecnicoResponsavel(e.target.value)} placeholder="Quem vai inspecionar" />
        </Field>
      </div>
      <Field label="Motivo alegado pelo cliente">
        <textarea value={motivoCliente} onChange={(e) => setMotivoCliente(e.target.value)} placeholder="O que o cliente disse na reclamação" />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Criando…" : "Criar caso"}
        </button>
      </div>
    </Modal>
  );
}

function DetalheCasoModal({ id, onClose, onAtualizado }: { id: number; onClose: () => void; onAtualizado: () => void }) {
  const [caso, setCaso] = useState<RmaCaso | null>(null);
  const [eventos, setEventos] = useState<RmaEvento[]>([]);
  const [err, setErr] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [comentario, setComentario] = useState("");
  const [fotoAnexo, setFotoAnexo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    try {
      const r = await api.get<{ caso: RmaCaso; eventos: RmaEvento[] }>(`/api/rma/${id}`);
      setCaso(r.caso);
      setEventos(r.eventos);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o caso.");
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const atualizar = async (patch: Record<string, unknown>) => {
    setSalvando(true);
    setErr("");
    try {
      await api.patch(`/api/rma/${id}`, patch);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const enviarComentario = async () => {
    if (!comentario.trim() && !fotoAnexo) return;
    setSalvando(true);
    setErr("");
    try {
      await api.post(`/api/rma/${id}/eventos`, { texto: comentario, foto: fotoAnexo });
      setComentario("");
      setFotoAnexo(null);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setSalvando(false);
    }
  };

  const escolherFoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setFotoAnexo(reader.result as string);
    reader.readAsDataURL(file);
  };

  if (!caso) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={caso.numero} subtitle={`${caso.plataforma} · aberto em ${dt(caso.created_at)}`} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <StatusBadge status={caso.status} />
        {caso.culpa && <span className="pill in">{caso.culpa === "nossa" ? "Culpa E2X" : "Culpa do cliente"}</span>}
        {caso.desfecho && (
          <span className="pill out">{caso.desfecho === "reembolso_cliente" ? "Reembolso ao cliente" : "Cobrança da plataforma"}</span>
        )}
        {caso.valor != null && <b style={{ marginLeft: "auto" }}>{fmtR$(caso.valor)}</b>}
      </div>

      <div className="form-grid">
        <Field label="Produto / máquina">
          <input defaultValue={caso.produto} onBlur={(e) => e.target.value !== caso.produto && atualizar({ produto: e.target.value })} />
        </Field>
        <Field label="Nº do pedido">
          <input defaultValue={caso.pedido} onBlur={(e) => e.target.value !== caso.pedido && atualizar({ pedido: e.target.value })} />
        </Field>
        <Field label="Cliente">
          <input defaultValue={caso.cliente} onBlur={(e) => e.target.value !== caso.cliente && atualizar({ cliente: e.target.value })} />
        </Field>
        <Field label="Técnico responsável">
          <input defaultValue={caso.tecnico_responsavel} onBlur={(e) => e.target.value !== caso.tecnico_responsavel && atualizar({ tecnicoResponsavel: e.target.value })} />
        </Field>
      </div>

      <Field label="Motivo alegado pelo cliente">
        <textarea defaultValue={caso.motivo_cliente} onBlur={(e) => e.target.value !== caso.motivo_cliente && atualizar({ motivoCliente: e.target.value })} />
      </Field>

      <Field label="Laudo técnico">
        <textarea
          defaultValue={caso.laudo_tecnico}
          placeholder="O que o técnico encontrou ao inspecionar"
          onBlur={(e) => e.target.value !== caso.laudo_tecnico && atualizar({ laudoTecnico: e.target.value })}
        />
      </Field>

      <div className="form-grid">
        <Field label="Status">
          <select value={caso.status} onChange={(e) => atualizar({ status: e.target.value })} disabled={salvando}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Culpa">
          <select value={caso.culpa || ""} onChange={(e) => atualizar({ culpa: e.target.value })} disabled={salvando}>
            <option value="">Ainda não definida</option>
            <option value="nossa">Nossa (E2X)</option>
            <option value="cliente">Do cliente</option>
          </select>
        </Field>
      </div>

      <div className="form-grid">
        <Field label="Desfecho financeiro">
          <select value={caso.desfecho || ""} onChange={(e) => atualizar({ desfecho: e.target.value })} disabled={salvando}>
            <option value="">Ainda não definido</option>
            <option value="reembolso_cliente">Reembolsar cliente</option>
            <option value="cobranca_plataforma">Cobrar da plataforma</option>
          </select>
        </Field>
        <Field label="Valor (R$)">
          <input
            type="number"
            step="0.01"
            defaultValue={caso.valor ?? ""}
            onBlur={(e) => e.target.value && Number(e.target.value) !== caso.valor && atualizar({ valor: e.target.value })}
          />
        </Field>
      </div>

      {caso.desfecho === "cobranca_plataforma" && (
        <Field label="Status da disputa com a plataforma">
          <select value={caso.disputa_status || "nao_aberta"} onChange={(e) => atualizar({ disputaStatus: e.target.value })} disabled={salvando}>
            <option value="nao_aberta">Ainda não aberta</option>
            <option value="aberta">Aberta, aguardando resposta</option>
            <option value="ganha">Ganha</option>
            <option value="perdida">Perdida</option>
          </select>
        </Field>
      )}

      {err && <div className="error">{err}</div>}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "20px 0 8px" }}>
        Histórico do caso
      </p>
      <div className="cart" style={{ maxHeight: 260 }}>
        {eventos.map((ev) => (
          <div className="cart-row" key={ev.id} style={{ gridTemplateColumns: "1fr", alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#778a81" }}>
                <span>
                  <b style={{ color: "#1b2b24" }}>{ev.responsible}</b> · {dt(ev.created_at)}
                </span>
              </div>
              {ev.texto && <p style={{ margin: "4px 0 0" }}>{ev.texto}</p>}
              {ev.foto && (
                <img
                  src={`/api/rma/eventos/${ev.id}/foto`}
                  alt="evidência"
                  style={{ maxWidth: 160, borderRadius: 8, marginTop: 6, display: "block" }}
                />
              )}
            </div>
          </div>
        ))}
        {!eventos.length && <p className="cart-empty">Nenhum evento ainda.</p>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Adicionar comentário sobre este caso…"
          style={{ flex: 1, minHeight: 42 }}
        />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && escolherFoto(e.target.files[0])} />
        <button className="secondary" onClick={() => fileRef.current?.click()} title="Anexar foto">
          <Paperclip size={16} />
        </button>
        <button className="primary" onClick={enviarComentario} disabled={salvando}>
          <MessageSquarePlus size={16} /> Enviar
        </button>
      </div>
      {fotoAnexo && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <img src={fotoAnexo} alt="anexo" style={{ height: 60, borderRadius: 6 }} />
          <button className="secondary" onClick={() => setFotoAnexo(null)}>
            Remover anexo
          </button>
        </div>
      )}

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
