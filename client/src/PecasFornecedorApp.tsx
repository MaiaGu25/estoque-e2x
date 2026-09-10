import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, BarChart3, CheckCircle2, ClipboardList, FileSpreadsheet, LogOut, Menu,
  MessageSquarePlus, Plus, RefreshCw, Search, ShieldCheck, Trash2, Truck,
  TriangleAlert, X, XCircle,
} from "lucide-react";
import { api } from "./api";
import type {
  Fornecedor, Part, PecaFornecedor, PecaFornecedorDecisao, PecaFornecedorEvento,
  PecasFornecedorStats, PedidoFornecedor, PedidoFornecedorStatus, User,
} from "./types";
import { useRealtime } from "./useRealtime";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function baixarPlanilha(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  window.open(`/api/pecas-fornecedor/planilha${qs ? "?" + qs : ""}`, "_blank");
}

function resumoDecisoesPedido(p: Pick<PedidoFornecedor, "pendentes" | "aceitas" | "recusadas">) {
  const partes: string[] = [];
  if (p.pendentes) partes.push(`${p.pendentes} pendente${p.pendentes > 1 ? "s" : ""}`);
  if (p.aceitas) partes.push(`${p.aceitas} aceita${p.aceitas > 1 ? "s" : ""}`);
  if (p.recusadas) partes.push(`${p.recusadas} recusada${p.recusadas > 1 ? "s" : ""}`);
  return partes.join(", ") || "—";
}

const STATUS_LABEL: Record<PedidoFornecedorStatus, string> = {
  em_aberto: "Em aberto",
  registrado: "Registrado",
  em_analise: "Em análise",
  revisar: "Revisar",
  liberado: "Liberado",
  concluido: "Concluído",
};
const STATUS_CLASS: Record<PedidoFornecedorStatus, string> = {
  em_aberto: "warn",
  registrado: "",
  em_analise: "transfer",
  revisar: "warn",
  liberado: "adjust",
  concluido: "ok",
};

const DECISAO_LABEL: Record<PecaFornecedorDecisao, string> = {
  pendente: "Pendente",
  aceita: "Aceita",
  recusada: "Recusada",
};

export default function PecasFornecedorApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["painel", "Painel", BarChart3],
    ["ordens", "Ordens", ClipboardList],
    ["fornecedores", "Fornecedores", Truck],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [mobile, setMobile] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [estoquePecas, setEstoquePecas] = useState<Part[]>([]);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("pecasFornecedor", recarregar);

  const carregarFornecedores = async () => {
    const r = await api.get<{ fornecedores: Fornecedor[] }>("/api/pecas-fornecedor/fornecedores");
    setFornecedores(r.fornecedores);
  };
  useEffect(() => {
    carregarFornecedores();
  }, [refreshKey]);

  useEffect(() => {
    api.get<{ parts: Part[] }>("/api/data").then((r) => setEstoquePecas(r.parts)).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>PEÇAS / FORNECEDORES</strong>
            <span>Trocas com fornecedor</span>
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
            <p>Peças / Fornecedores</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={recarregar}>
              <RefreshCw size={16} /> Atualizar
            </button>
            {tab === "ordens" && (
              <button
                className="primary"
                onClick={() => setModalNova(true)}
                disabled={!fornecedores.length}
                title={fornecedores.length ? undefined : "Cadastre um fornecedor primeiro, na aba Fornecedores"}
              >
                <Plus size={17} /> Nova ordem
              </button>
            )}
          </div>
        </header>

        {tab === "painel" && <PainelTab refreshKey={refreshKey} onAbrirPedido={(numero) => setPedidoAberto(numero)} />}
        {tab === "ordens" && (
          <OrdensTab refreshKey={refreshKey} fornecedores={fornecedores} onAbrirPedido={(numero) => setPedidoAberto(numero)} />
        )}
        {tab === "fornecedores" && <FornecedoresTab fornecedores={fornecedores} onAtualizado={recarregar} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}

      {modalNova && (
        <NovaPecaModal
          fornecedores={fornecedores}
          estoquePecas={estoquePecas}
          onClose={() => setModalNova(false)}
          onCriada={(pedidoNumero) => {
            setModalNova(false);
            recarregar();
            setPedidoAberto(pedidoNumero);
          }}
        />
      )}
      {pedidoAberto !== null && (
        <PedidoDetalheModal
          numero={pedidoAberto}
          isAdmin={user.role === "admin"}
          onClose={() => setPedidoAberto(null)}
          onAtualizado={recarregar}
          onExcluido={() => {
            setPedidoAberto(null);
            recarregar();
          }}
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

function StatusBadge({ status }: { status: PedidoFornecedorStatus }) {
  return <span className={`status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

const DECISAO_CLASS: Record<PecaFornecedorDecisao, string> = { pendente: "", aceita: "ok", recusada: "warn" };

function DecisaoBadge({ decisao }: { decisao: PecaFornecedorDecisao }) {
  return <span className={`status ${DECISAO_CLASS[decisao]}`}>{DECISAO_LABEL[decisao]}</span>;
}

// Tiquinho verde/vermelho pra marcar se o fornecedor aceitou ou recusou
// aquela peça na troca - clicar de novo no que já está marcado volta pra
// "pendente".
function DecisaoToggle({ decisao, onChange, disabled }: { decisao: PecaFornecedorDecisao; onChange: (d: PecaFornecedorDecisao) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button
        className="icon-btn"
        title="Aceita pelo fornecedor"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(decisao === "aceita" ? "pendente" : "aceita");
        }}
        style={{ color: decisao === "aceita" ? "#078348" : "#c3cdc8", background: decisao === "aceita" ? "#def8e9" : "transparent", borderRadius: 8 }}
      >
        <CheckCircle2 size={20} />
      </button>
      <button
        className="icon-btn"
        title="Recusada pelo fornecedor"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(decisao === "recusada" ? "pendente" : "recusada");
        }}
        style={{ color: decisao === "recusada" ? "#b83224" : "#c3cdc8", background: decisao === "recusada" ? "#fff0ee" : "transparent", borderRadius: 8 }}
      >
        <XCircle size={20} />
      </button>
    </div>
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

function PainelTab({ refreshKey, onAbrirPedido }: { refreshKey: number; onAbrirPedido: (numero: string) => void }) {
  const [stats, setStats] = useState<PecasFornecedorStats | null>(null);
  const [recentes, setRecentes] = useState<PedidoFornecedor[]>([]);

  useEffect(() => {
    api.get<PecasFornecedorStats>("/api/pecas-fornecedor/stats").then(setStats).catch(() => {});
    api.get<{ pedidos: PedidoFornecedor[] }>("/api/pecas-fornecedor/pedidos").then((r) => setRecentes(r.pedidos.slice(0, 8))).catch(() => {});
  }, [refreshKey]);

  const emAndamento = stats?.porStatus.filter((s) => s.status !== "concluido").reduce((s, r) => s + r.n, 0) || 0;

  return (
    <section>
      <div className="stats">
        <Stat icon={TriangleAlert} label="Em andamento com fornecedor" value={fmt(emAndamento)} alert={!!emAndamento} />
        <Stat icon={ClipboardList} label="Registradas hoje" value={fmt(stats?.registradasHoje ?? 0)} />
        <Stat icon={Truck} label="Fornecedores com pendência" value={fmt(stats?.porFornecedor.length ?? 0)} />
      </div>

      <div className="grid-two">
        <Panel title="Ordens recentes">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fornecedor</th>
                  <th>Peças</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((p) => (
                  <tr key={p.pedido_numero} onClick={() => onAbrirPedido(p.pedido_numero)} style={{ cursor: "pointer" }}>
                    <td>
                      <b className="code">{p.pedido_numero}</b>
                    </td>
                    <td>{p.fornecedor_nome}</td>
                    <td>{fmt(p.total_pecas)}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentes.length && <Empty text="Nenhuma ordem registrada ainda." />}
          </div>
        </Panel>
        <Panel title="Fornecedores que mais dão RMA">
          <div className="reason-list">
            {(stats?.porFornecedor || []).map((f) => {
              const max = Math.max(1, ...(stats?.porFornecedor.map((x) => x.n) || [1]));
              return (
                <div className="reason" key={f.fornecedor}>
                  <div>
                    <span>{f.fornecedor}</span>
                    <b>{f.n}</b>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${Math.max(4, (f.n / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {!stats?.porFornecedor.length && <p className="cart-empty">Sem dados ainda.</p>}
          </div>
        </Panel>
      </div>

      <div className="grid-two">
        <Panel title="Peças que mais dão RMA">
          <div className="reason-list">
            {(stats?.porPeca || []).map((p) => {
              const max = Math.max(1, ...(stats?.porPeca.map((x) => x.n) || [1]));
              return (
                <div className="reason" key={p.codigo + p.descricao}>
                  <div>
                    <span>
                      {p.codigo ? <b className="code">{p.codigo}</b> : null} {p.descricao}
                    </span>
                    <b>{p.n}</b>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${Math.max(4, (p.n / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {!stats?.porPeca.length && <p className="cart-empty">Sem dados ainda.</p>}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function OrdensTab({
  refreshKey,
  fornecedores,
  onAbrirPedido,
}: {
  refreshKey: number;
  fornecedores: Fornecedor[];
  onAbrirPedido: (numero: string) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoFornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  const filtros = () => {
    const params: Record<string, string> = {};
    if (busca) params.busca = busca;
    if (status) params.status = status;
    if (fornecedorId) params.fornecedorId = fornecedorId;
    return params;
  };

  const carregar = async () => {
    const params = new URLSearchParams(filtros());
    const r = await api.get<{ pedidos: PedidoFornecedor[] }>(`/api/pecas-fornecedor/pedidos?${params.toString()}`);
    setPedidos(r.pedidos);
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
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pedido, código, serial, descrição, EAN" />
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
          <label>Fornecedor</label>
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">Todos</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={carregar}>
          <Search size={15} /> Filtrar
        </button>
        <button className="secondary" onClick={() => baixarPlanilha(filtros())}>
          <FileSpreadsheet size={16} /> Gerar planilha
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fornecedor</th>
              <th>Peças</th>
              <th>Status</th>
              <th>Decisões</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.pedido_numero} onClick={() => onAbrirPedido(p.pedido_numero)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{p.pedido_numero}</b>
                </td>
                <td>{p.fornecedor_nome}</td>
                <td>{fmt(p.total_pecas)}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>{resumoDecisoesPedido(p)}</td>
                <td>{dt(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pedidos.length && <Empty text="Nenhum pedido encontrado." />}
      </div>
    </section>
  );
}

function resumoContatos(f: Fornecedor) {
  if (f.contatos.length) {
    const [primeiro, ...resto] = f.contatos;
    const label = [primeiro.nome, primeiro.telefone || primeiro.email].filter(Boolean).join(" · ") || "—";
    return resto.length ? `${label} (+${resto.length})` : label;
  }
  return f.contato || "—";
}

function FornecedoresTab({ fornecedores, onAtualizado }: { fornecedores: Fornecedor[]; onAtualizado: () => void }) {
  const [showNovo, setShowNovo] = useState(false);
  const [fornecedorAberto, setFornecedorAberto] = useState<Fornecedor | null>(null);

  return (
    <section>
      <div className="toolbar">
        <div />
        <button className="primary" onClick={() => setShowNovo(true)}>
          <Plus size={17} /> Novo fornecedor
        </button>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Identificação</th>
              <th>Cidade/UF</th>
              <th>Contato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => (
              <tr key={f.id} onClick={() => setFornecedorAberto(f)} style={{ cursor: "pointer" }}>
                <td>
                  <strong>{f.nome}</strong>
                </td>
                <td>{f.identificacao || "—"}</td>
                <td>{f.cidade ? `${f.cidade}${f.estado ? "/" + f.estado : ""}` : "—"}</td>
                <td>{resumoContatos(f)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!fornecedores.length && <Empty text="Nenhum fornecedor cadastrado." />}
      </div>

      {showNovo && (
        <NovoFornecedorModal
          onClose={() => setShowNovo(false)}
          onCriado={() => {
            setShowNovo(false);
            onAtualizado();
          }}
        />
      )}
      {fornecedorAberto && (
        <DetalheFornecedorModal
          fornecedor={fornecedorAberto}
          onClose={() => setFornecedorAberto(null)}
          onAtualizado={onAtualizado}
          onDesativado={() => {
            setFornecedorAberto(null);
            onAtualizado();
          }}
        />
      )}
    </section>
  );
}

type ContatoLinha = { key: number; nome: string; telefone: string; email: string };
let contatoLinhaSeq = 0;

function CamposEndereco({
  v,
  onChange,
}: {
  v: { endereco: string; numero: string; cep: string; cidade: string; estado: string };
  onChange: (patch: Partial<typeof v>) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="Endereço">
        <input value={v.endereco} onChange={(e) => onChange({ endereco: e.target.value })} />
      </Field>
      <Field label="Número">
        <input value={v.numero} onChange={(e) => onChange({ numero: e.target.value })} />
      </Field>
      <Field label="CEP">
        <input value={v.cep} onChange={(e) => onChange({ cep: e.target.value })} />
      </Field>
      <Field label="Cidade">
        <input value={v.cidade} onChange={(e) => onChange({ cidade: e.target.value })} />
      </Field>
      <Field label="Estado">
        <input value={v.estado} onChange={(e) => onChange({ estado: e.target.value })} placeholder="Ex.: SP" maxLength={2} />
      </Field>
    </div>
  );
}

function NovoFornecedorModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [endereco, setEndereco] = useState({ endereco: "", numero: "", cep: "", cidade: "", estado: "" });
  const [contatos, setContatos] = useState<ContatoLinha[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const adicionarContato = () => setContatos((x) => [...x, { key: ++contatoLinhaSeq, nome: "", telefone: "", email: "" }]);
  const atualizarContato = (key: number, patch: Partial<ContatoLinha>) =>
    setContatos((x) => x.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removerContato = (key: number) => setContatos((x) => x.filter((c) => c.key !== key));

  const salvar = async () => {
    if (!nome.trim()) return setErr("Digite o nome do fornecedor.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/pecas-fornecedor/fornecedores", {
        nome,
        identificacao,
        ...endereco,
        contatos: contatos.map(({ nome, telefone, email }) => ({ nome, telefone, email })),
      });
      onCriado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo fornecedor" subtitle="Cadastre com uma identificação (CNPJ ou código interno) pra facilitar o controle." onClose={onClose}>
      <div className="form-grid">
        <Field label="Nome *">
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="Identificação (CNPJ / código)">
          <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} />
        </Field>
      </div>

      <CamposEndereco v={endereco} onChange={(patch) => setEndereco((x) => ({ ...x, ...patch }))} />

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "6px 0 8px" }}>
        Contatos (podem ser pessoas diferentes)
      </p>
      <div className="cart" style={{ marginBottom: 10 }}>
        {contatos.map((c) => (
          <div className="cart-row" key={c.key} style={{ gridTemplateColumns: "1fr 1fr 1fr 32px" }}>
            <input value={c.nome} onChange={(e) => atualizarContato(c.key, { nome: e.target.value })} placeholder="Nome" />
            <input value={c.telefone} onChange={(e) => atualizarContato(c.key, { telefone: e.target.value })} placeholder="Telefone" />
            <input value={c.email} onChange={(e) => atualizarContato(c.key, { email: e.target.value })} placeholder="E-mail" />
            <button onClick={() => removerContato(c.key)}>
              <X />
            </button>
          </div>
        ))}
        {!contatos.length && <p className="cart-empty">Nenhum contato adicionado ainda.</p>}
      </div>
      <button className="secondary" onClick={adicionarContato} style={{ marginBottom: 14 }}>
        <Plus size={15} /> Adicionar contato
      </button>

      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
    </Modal>
  );
}

function DetalheFornecedorModal({
  fornecedor,
  onClose,
  onAtualizado,
  onDesativado,
}: {
  fornecedor: Fornecedor;
  onClose: () => void;
  onAtualizado: () => void;
  onDesativado: () => void;
}) {
  const [f, setF] = useState(fornecedor);
  const [novoContato, setNovoContato] = useState({ nome: "", telefone: "", email: "" });
  const [err, setErr] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregarContatos = async () => {
    const r = await api.get<{ fornecedores: Fornecedor[] }>("/api/pecas-fornecedor/fornecedores");
    const atualizado = r.fornecedores.find((x) => x.id === f.id);
    if (atualizado) setF(atualizado);
    onAtualizado();
  };

  const salvarCampo = async (patch: Record<string, string>) => {
    setSalvando(true);
    setErr("");
    try {
      await api.patch(`/api/pecas-fornecedor/fornecedores/${f.id}`, patch);
      setF((x) => ({ ...x, ...patch }));
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarContato = async () => {
    if (!novoContato.nome.trim() && !novoContato.telefone.trim() && !novoContato.email.trim()) return;
    setSalvando(true);
    setErr("");
    try {
      await api.post(`/api/pecas-fornecedor/fornecedores/${f.id}/contatos`, novoContato);
      setNovoContato({ nome: "", telefone: "", email: "" });
      await recarregarContatos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível adicionar o contato.");
    } finally {
      setSalvando(false);
    }
  };

  const removerContato = async (contatoId: number) => {
    setSalvando(true);
    setErr("");
    try {
      await api.del(`/api/pecas-fornecedor/fornecedores/${f.id}/contatos/${contatoId}`);
      await recarregarContatos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível remover o contato.");
    } finally {
      setSalvando(false);
    }
  };

  const desativar = async () => {
    if (!confirm(`Desativar o fornecedor ${f.nome}?`)) return;
    await api.patch(`/api/pecas-fornecedor/fornecedores/${f.id}`, { ativo: false });
    onDesativado();
  };

  return (
    <Modal title={f.nome} subtitle={f.identificacao || undefined} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Nome">
          <input defaultValue={f.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== f.nome && salvarCampo({ nome: e.target.value })} />
        </Field>
        <Field label="Identificação (CNPJ / código)">
          <input
            defaultValue={f.identificacao}
            onBlur={(e) => e.target.value !== f.identificacao && salvarCampo({ identificacao: e.target.value })}
          />
        </Field>
      </div>

      <div className="form-grid">
        <Field label="Endereço">
          <input defaultValue={f.endereco} onBlur={(e) => e.target.value !== f.endereco && salvarCampo({ endereco: e.target.value })} />
        </Field>
        <Field label="Número">
          <input defaultValue={f.numero} onBlur={(e) => e.target.value !== f.numero && salvarCampo({ numero: e.target.value })} />
        </Field>
        <Field label="CEP">
          <input defaultValue={f.cep} onBlur={(e) => e.target.value !== f.cep && salvarCampo({ cep: e.target.value })} />
        </Field>
        <Field label="Cidade">
          <input defaultValue={f.cidade} onBlur={(e) => e.target.value !== f.cidade && salvarCampo({ cidade: e.target.value })} />
        </Field>
        <Field label="Estado">
          <input
            defaultValue={f.estado}
            onBlur={(e) => e.target.value !== f.estado && salvarCampo({ estado: e.target.value })}
            placeholder="Ex.: SP"
            maxLength={2}
          />
        </Field>
      </div>

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "6px 0 8px" }}>
        Contatos
      </p>
      <div className="cart" style={{ marginBottom: 10 }}>
        {f.contatos.map((c) => (
          <div className="cart-row" key={c.id} style={{ gridTemplateColumns: "1fr 1fr 32px" }}>
            <span>
              <b>{c.nome || "Sem nome"}</b>
              <small>{[c.telefone, c.email].filter(Boolean).join(" · ") || "—"}</small>
            </span>
            <span />
            <button onClick={() => removerContato(c.id)} disabled={salvando}>
              <X />
            </button>
          </div>
        ))}
        {!f.contatos.length && <p className="cart-empty">Nenhum contato cadastrado ainda.</p>}
      </div>
      <div className="cart-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 32px", padding: "0 0 14px" }}>
        <input value={novoContato.nome} onChange={(e) => setNovoContato((x) => ({ ...x, nome: e.target.value }))} placeholder="Nome" />
        <input value={novoContato.telefone} onChange={(e) => setNovoContato((x) => ({ ...x, telefone: e.target.value }))} placeholder="Telefone" />
        <input value={novoContato.email} onChange={(e) => setNovoContato((x) => ({ ...x, email: e.target.value }))} placeholder="E-mail" />
        <button onClick={adicionarContato} disabled={salvando}>
          <Plus size={15} />
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={desativar}>
          Desativar fornecedor
        </button>
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
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

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={wide ? { width: "min(960px,100%)" } : undefined}>
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

type ItemPecaForm = {
  key: number;
  codigo: string;
  descricao: string;
  serial: string;
  ean: string;
  defeito: string;
};

let itemPecaFormSeq = 0;

// Busca no estoque + carrinho de peças, usado tanto pra montar uma ordem
// nova quanto pra incluir mais peças numa ordem já existente.
function ListaPecasForm({
  estoquePecas,
  itens,
  onChange,
}: {
  estoquePecas: Part[];
  itens: ItemPecaForm[];
  onChange: (itens: ItemPecaForm[]) => void;
}) {
  const [busca, setBusca] = useState("");

  const encontradas = busca
    ? estoquePecas.filter((p) => (p.code + " " + p.name).toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];

  const adicionarDoEstoque = (p: Part) => {
    onChange([...itens, { key: ++itemPecaFormSeq, codigo: p.code, descricao: p.name, serial: "", ean: "", defeito: "" }]);
    setBusca("");
  };

  const adicionarAvulsa = () => {
    onChange([...itens, { key: ++itemPecaFormSeq, codigo: "", descricao: "", serial: "", ean: "", defeito: "" }]);
  };

  const atualizarItem = (key: number, patch: Partial<ItemPecaForm>) => {
    onChange(itens.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const removerItem = (key: number) => {
    onChange(itens.filter((i) => i.key !== key));
  };

  return (
    <>
      <Field label="Adicionar peça (digite o código ou nome)">
        <div className="part-search">
          <Search />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: 4129 ou CORE i5" />
          {busca && (
            <div className="results">
              {encontradas.map((p) => (
                <button key={p.id} onClick={() => adicionarDoEstoque(p)}>
                  <span>
                    <b>{p.code}</b> · {p.name}
                  </span>
                  <small>Saldo: {fmt(p.quantity)}</small>
                </button>
              ))}
              {!encontradas.length && <p className="cart-empty">Nenhuma peça do estoque encontrada com esse código/nome.</p>}
            </div>
          )}
        </div>
      </Field>
      <button className="secondary" onClick={adicionarAvulsa} style={{ marginBottom: 14 }}>
        <Plus size={15} /> Adicionar peça avulsa (fora do estoque)
      </button>

      <div className="cart" style={{ maxHeight: 320 }}>
        <div className="cart-head">
          <b>Peças da lista</b>
          <span>{itens.length} selecionadas</span>
        </div>
        {itens.map((item, idx) => (
          <div className="cart-row" key={item.key} style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 32px", alignItems: "start" }}>
            <span>
              <b>{item.codigo || `Peça ${idx + 1}`}</b>
              <input
                value={item.descricao}
                onChange={(e) => atualizarItem(item.key, { descricao: e.target.value })}
                placeholder="Descrição *"
                style={{ marginTop: 6 }}
              />
            </span>
            <input
              value={item.serial}
              onChange={(e) => atualizarItem(item.key, { serial: e.target.value })}
              placeholder="Serial (opcional)"
            />
            <input value={item.ean} onChange={(e) => atualizarItem(item.key, { ean: e.target.value })} placeholder="EAN (opcional)" />
            <input
              value={item.defeito}
              onChange={(e) => atualizarItem(item.key, { defeito: e.target.value })}
              placeholder="Defeito identificado"
            />
            <button onClick={() => removerItem(item.key)}>
              <X />
            </button>
          </div>
        ))}
        {!itens.length && <p className="cart-empty">Pesquise uma peça do estoque acima, ou adicione uma peça avulsa.</p>}
      </div>
    </>
  );
}

function NovaPecaModal({
  fornecedores,
  estoquePecas,
  onClose,
  onCriada,
}: {
  fornecedores: Fornecedor[];
  estoquePecas: Part[];
  onClose: () => void;
  onCriada: (pedidoNumero: string) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState(fornecedores[0]?.id || 0);
  const [rmaRelacionado, setRmaRelacionado] = useState("");
  const [itens, setItens] = useState<ItemPecaForm[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setErr("");
    if (!fornecedorId) return setErr("Selecione o fornecedor.");
    if (!itens.length) return setErr("Adicione ao menos uma peça na lista.");
    const semDescricao = itens.findIndex((i) => !i.descricao.trim());
    if (semDescricao !== -1) return setErr(`Peça ${semDescricao + 1} da lista está sem descrição.`);
    setSaving(true);
    try {
      const res = await api.post<{ ok: boolean; pedidoNumero: string; ids: number[] }>("/api/pecas-fornecedor/pecas/lote", {
        fornecedorId,
        rmaRelacionado,
        itens: itens.map(({ codigo, descricao, serial, ean, defeito }) => ({ codigo, descricao, serial, ean, defeito })),
      });
      onCriada(res.pedidoNumero);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar as peças.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nova ordem para o fornecedor" subtitle="Monte a lista de peças defeituosas antes de enviar ao fornecedor." onClose={onClose}>
      <div className="form-grid">
        <Field label="Fornecedor *">
          <select value={fornecedorId} onChange={(e) => setFornecedorId(Number(e.target.value))}>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nº do caso RMA relacionado (opcional)">
          <input value={rmaRelacionado} onChange={(e) => setRmaRelacionado(e.target.value)} placeholder="Ex.: RMA-20260904-95889" />
        </Field>
      </div>

      <ListaPecasForm estoquePecas={estoquePecas} itens={itens} onChange={setItens} />

      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !itens.length} onClick={salvar}>
          {saving ? "Cadastrando…" : `Cadastrar ${itens.length || ""} peça${itens.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

function PedidoDetalheModal({
  numero,
  isAdmin,
  onClose,
  onAtualizado,
  onExcluido,
}: {
  numero: string;
  isAdmin: boolean;
  onClose: () => void;
  onAtualizado: () => void;
  onExcluido: () => void;
}) {
  const [pedido, setPedido] = useState<{
    pedidoNumero: string;
    fornecedorNome: string;
    rmaRelacionado: string;
    status: PedidoFornecedorStatus;
    createdAt: string;
    pecas: PecaFornecedor[];
  } | null>(null);
  const [err, setErr] = useState("");
  const [excluirErr, setExcluirErr] = useState("");
  const [pecaAberta, setPecaAberta] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get<{
        pedidoNumero: string;
        fornecedorNome: string;
        rmaRelacionado: string;
        status: PedidoFornecedorStatus;
        createdAt: string;
        pecas: PecaFornecedor[];
      }>(`/api/pecas-fornecedor/pedidos/${numero}`);
      setPedido(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o pedido.");
    }
  };

  const salvarPedido = async (patch: Record<string, unknown>) => {
    setSalvando(true);
    try {
      await api.patch(`/api/pecas-fornecedor/pedidos/${numero}`, patch);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const marcarDecisao = async (pecaId: number, decisao: PecaFornecedorDecisao) => {
    setSalvando(true);
    try {
      await api.patch(`/api/pecas-fornecedor/pecas/${pecaId}`, { decisao });
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível marcar a decisão.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o pedido ${numero} e todas as ${pedido?.pecas.length || 0} peças dele? Essa ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    setExcluirErr("");
    try {
      await api.del(`/api/pecas-fornecedor/pedidos/${numero}`);
      onExcluido();
    } catch (e) {
      setExcluirErr(e instanceof Error ? e.message : "Não foi possível excluir o pedido.");
      setExcluindo(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numero]);

  if (err && !pedido) {
    return (
      <Modal title="Pedido" onClose={onClose}>
        <div className="error">{err}</div>
      </Modal>
    );
  }

  if (!pedido) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title={pedido.pedidoNumero}
        subtitle={`Fornecedor: ${pedido.fornecedorNome} · registrado em ${dt(pedido.createdAt)} · ${pedido.pecas.length} peça${pedido.pecas.length === 1 ? "" : "s"}`}
        onClose={onClose}
        wide
      >
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <Field label="Status do pedido">
            <select value={pedido.status} onChange={(e) => salvarPedido({ status: e.target.value })} disabled={salvando}>
              {Object.entries(STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="RMA relacionado">
            <input
              defaultValue={pedido.rmaRelacionado}
              onBlur={(e) => e.target.value.trim() !== pedido.rmaRelacionado && salvarPedido({ rmaRelacionado: e.target.value })}
              placeholder="Ex.: RMA-20260904"
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 8px" }}>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: 0 }}>
            Marque o que o fornecedor aceitou trocar
          </p>
          <button
            className="secondary"
            onClick={() => setAdicionando(true)}
            disabled={pedido.status === "concluido"}
            title={pedido.status === "concluido" ? "Pedido concluído, não é possível adicionar peças." : undefined}
          >
            <Plus size={15} /> Adicionar peças
          </button>
        </div>
        <div className="table-card" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Serial</th>
                <th>Defeito</th>
                <th>Decisão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pedido.pecas.map((p) => (
                <tr key={p.id} onClick={() => setPecaAberta(p.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <b className="code">{p.codigo || "—"}</b>
                  </td>
                  <td>{p.descricao}</td>
                  <td>{p.serial || "—"}</td>
                  <td>{p.defeito || "—"}</td>
                  <td>
                    <DecisaoBadge decisao={p.decisao} />
                  </td>
                  <td>
                    <DecisaoToggle decisao={p.decisao} disabled={salvando} onChange={(d) => marcarDecisao(p.id, d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(err || excluirErr) && <div className="error">{err || excluirErr}</div>}
        <div className="modal-actions">
          {isAdmin && (
            <button className="secondary" onClick={excluir} disabled={excluindo}>
              <Trash2 size={16} /> {excluindo ? "Excluindo…" : "Excluir pedido"}
            </button>
          )}
          <button className="secondary" onClick={() => baixarPlanilha({ pedidoNumero: pedido.pedidoNumero })}>
            <FileSpreadsheet size={16} /> Gerar planilha
          </button>
          <button className="primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </Modal>
      {pecaAberta !== null && (
        <DetalhePecaModal
          id={pecaAberta}
          onClose={() => setPecaAberta(null)}
          onAtualizado={() => {
            carregar();
            onAtualizado();
          }}
        />
      )}
      {adicionando && (
        <AdicionarPecasModal
          numero={numero}
          onClose={() => setAdicionando(false)}
          onAdicionado={() => {
            setAdicionando(false);
            carregar();
            onAtualizado();
          }}
        />
      )}
    </>
  );
}

function AdicionarPecasModal({
  numero,
  onClose,
  onAdicionado,
}: {
  numero: string;
  onClose: () => void;
  onAdicionado: () => void;
}) {
  const [estoquePecas, setEstoquePecas] = useState<Part[]>([]);
  const [itens, setItens] = useState<ItemPecaForm[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ parts: Part[] }>("/api/data").then((r) => setEstoquePecas(r.parts)).catch(() => {});
  }, []);

  const salvar = async () => {
    setErr("");
    if (!itens.length) return setErr("Adicione ao menos uma peça na lista.");
    const semDescricao = itens.findIndex((i) => !i.descricao.trim());
    if (semDescricao !== -1) return setErr(`Peça ${semDescricao + 1} da lista está sem descrição.`);
    setSaving(true);
    try {
      await api.post(`/api/pecas-fornecedor/pedidos/${numero}/pecas`, {
        itens: itens.map(({ codigo, descricao, serial, ean, defeito }) => ({ codigo, descricao, serial, ean, defeito })),
      });
      onAdicionado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível adicionar as peças.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Adicionar peças · ${numero}`} subtitle="Inclua mais peças nessa mesma ordem, antes de ela ser concluída." onClose={onClose}>
      <ListaPecasForm estoquePecas={estoquePecas} itens={itens} onChange={setItens} />

      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !itens.length} onClick={salvar}>
          {saving ? "Adicionando…" : `Adicionar ${itens.length || ""} peça${itens.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

function DetalhePecaModal({ id, onClose, onAtualizado }: { id: number; onClose: () => void; onAtualizado: () => void }) {
  const [peca, setPeca] = useState<PecaFornecedor | null>(null);
  const [eventos, setEventos] = useState<PecaFornecedorEvento[]>([]);
  const [err, setErr] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [comentario, setComentario] = useState("");

  const carregar = async () => {
    try {
      const r = await api.get<{ peca: PecaFornecedor; eventos: PecaFornecedorEvento[] }>(`/api/pecas-fornecedor/pecas/${id}`);
      setPeca(r.peca);
      setEventos(r.eventos);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar a peça.");
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
      await api.patch(`/api/pecas-fornecedor/pecas/${id}`, patch);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const enviarComentario = async () => {
    if (!comentario.trim()) return;
    setSalvando(true);
    try {
      await api.post(`/api/pecas-fornecedor/pecas/${id}/eventos`, { texto: comentario });
      setComentario("");
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setSalvando(false);
    }
  };

  if (!peca) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${peca.codigo || peca.descricao}`} subtitle={`Fornecedor: ${peca.fornecedor_nome} · registrada em ${dt(peca.created_at)}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <DecisaoBadge decisao={peca.decisao} />
        <DecisaoToggle decisao={peca.decisao} disabled={salvando} onChange={(d) => atualizar({ decisao: d })} />
      </div>

      <div className="form-grid">
        <Field label="Descrição">
          <input defaultValue={peca.descricao} onBlur={(e) => e.target.value !== peca.descricao && atualizar({ descricao: e.target.value })} />
        </Field>
        <Field label="Código interno">
          <input defaultValue={peca.codigo} onBlur={(e) => e.target.value !== peca.codigo && atualizar({ codigo: e.target.value })} />
        </Field>
        <Field label="Serial">
          <input defaultValue={peca.serial} onBlur={(e) => e.target.value !== peca.serial && atualizar({ serial: e.target.value })} />
        </Field>
        <Field label="Marca">
          <input defaultValue={peca.marca} onBlur={(e) => e.target.value !== peca.marca && atualizar({ marca: e.target.value })} />
        </Field>
      </div>
      <Field label="Defeito">
        <textarea defaultValue={peca.defeito} onBlur={(e) => e.target.value !== peca.defeito && atualizar({ defeito: e.target.value })} />
      </Field>

      {err && <div className="error">{err}</div>}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "20px 0 8px" }}>
        Histórico
      </p>
      <div className="cart" style={{ maxHeight: 220 }}>
        {eventos.map((ev) => (
          <div className="cart-row" key={ev.id} style={{ gridTemplateColumns: "1fr", alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 12, color: "#778a81" }}>
                <b style={{ color: "#1b2b24" }}>{ev.responsible}</b> · {dt(ev.created_at)}
              </div>
              <p style={{ margin: "4px 0 0" }}>{ev.texto}</p>
            </div>
          </div>
        ))}
        {!eventos.length && <p className="cart-empty">Nenhum evento ainda.</p>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ex.: enviado via transportadora X, código de rastreio…"
          style={{ flex: 1, minHeight: 42 }}
        />
        <button className="primary" onClick={enviarComentario} disabled={salvando}>
          <MessageSquarePlus size={16} /> Enviar
        </button>
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
