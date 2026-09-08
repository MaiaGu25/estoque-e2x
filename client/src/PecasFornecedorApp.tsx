import { useEffect, useState } from "react";
import {
  Archive, ArrowLeft, BarChart3, ClipboardList, LogOut, Menu,
  MessageSquarePlus, Plus, RefreshCw, Search, ShieldCheck, Truck,
  TriangleAlert, X,
} from "lucide-react";
import { api } from "./api";
import type {
  Fornecedor, Part, PecaFornecedor, PecaFornecedorEvento, PecaFornecedorStatus,
  PecasFornecedorStats, User,
} from "./types";
import { useRealtime } from "./useRealtime";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const STATUS_LABEL: Record<PecaFornecedorStatus, string> = {
  aguardando_envio: "Aguardando envio",
  aguardando_fornecedor: "Aguardando fornecedor",
  trocada: "Trocada",
  recusada: "Recusada pelo fornecedor",
};
const STATUS_CLASS: Record<PecaFornecedorStatus, string> = {
  aguardando_envio: "warn",
  aguardando_fornecedor: "",
  trocada: "ok",
  recusada: "warn",
};

export default function PecasFornecedorApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["painel", "Painel", BarChart3],
    ["pecas", "Peças", ClipboardList],
    ["fornecedores", "Fornecedores", Truck],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [mobile, setMobile] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [pecaAberta, setPecaAberta] = useState<number | null>(null);
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
            {tab === "pecas" && (
              <button className="primary" onClick={() => setModalNova(true)} disabled={!fornecedores.length}>
                <Plus size={17} /> Nova peça
              </button>
            )}
          </div>
        </header>

        {tab === "painel" && <PainelTab refreshKey={refreshKey} onAbrirPeca={(id) => setPecaAberta(id)} />}
        {tab === "pecas" && <PecasTab refreshKey={refreshKey} fornecedores={fornecedores} onAbrirPeca={(id) => setPecaAberta(id)} />}
        {tab === "fornecedores" && <FornecedoresTab fornecedores={fornecedores} onAtualizado={recarregar} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}

      {modalNova && (
        <NovaPecaModal
          fornecedores={fornecedores}
          estoquePecas={estoquePecas}
          onClose={() => setModalNova(false)}
          onCriada={(ids) => {
            setModalNova(false);
            recarregar();
            if (ids.length === 1) setPecaAberta(ids[0]);
          }}
        />
      )}
      {pecaAberta !== null && (
        <DetalhePecaModal id={pecaAberta} onClose={() => setPecaAberta(null)} onAtualizado={recarregar} />
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

function StatusBadge({ status }: { status: PecaFornecedorStatus }) {
  return <span className={`status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
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

function PainelTab({ refreshKey, onAbrirPeca }: { refreshKey: number; onAbrirPeca: (id: number) => void }) {
  const [stats, setStats] = useState<PecasFornecedorStats | null>(null);
  const [recentes, setRecentes] = useState<PecaFornecedor[]>([]);

  useEffect(() => {
    api.get<PecasFornecedorStats>("/api/pecas-fornecedor/stats").then(setStats).catch(() => {});
    api.get<{ pecas: PecaFornecedor[] }>("/api/pecas-fornecedor/pecas").then((r) => setRecentes(r.pecas.slice(0, 8))).catch(() => {});
  }, [refreshKey]);

  const emAndamento = stats?.porStatus.filter((s) => s.status !== "trocada" && s.status !== "recusada").reduce((s, r) => s + r.n, 0) || 0;

  return (
    <section>
      <div className="stats">
        <Stat icon={TriangleAlert} label="Em andamento com fornecedor" value={fmt(emAndamento)} alert={!!emAndamento} />
        <Stat icon={ClipboardList} label="Registradas hoje" value={fmt(stats?.registradasHoje ?? 0)} />
        <Stat icon={Truck} label="Fornecedores com pendência" value={fmt(stats?.porFornecedor.length ?? 0)} />
      </div>

      <div className="grid-two">
        <Panel title="Peças recentes">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Fornecedor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((p) => (
                  <tr key={p.id} onClick={() => onAbrirPeca(p.id)} style={{ cursor: "pointer" }}>
                    <td>
                      <b className="code">{p.codigo || "—"}</b>
                    </td>
                    <td>{p.descricao}</td>
                    <td>{p.fornecedor_nome}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentes.length && <Empty text="Nenhuma peça registrada ainda." />}
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

function PecasTab({
  refreshKey,
  fornecedores,
  onAbrirPeca,
}: {
  refreshKey: number;
  fornecedores: Fornecedor[];
  onAbrirPeca: (id: number) => void;
}) {
  const [pecas, setPecas] = useState<PecaFornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  const carregar = async () => {
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    if (fornecedorId) params.set("fornecedorId", fornecedorId);
    const r = await api.get<{ pecas: PecaFornecedor[] }>(`/api/pecas-fornecedor/pecas?${params.toString()}`);
    setPecas(r.pecas);
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
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, serial, descrição, EAN" />
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
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Serial</th>
              <th>Descrição</th>
              <th>Marca</th>
              <th>Fornecedor</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {pecas.map((p) => (
              <tr key={p.id} onClick={() => onAbrirPeca(p.id)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{p.codigo || "—"}</b>
                </td>
                <td>{p.serial || "—"}</td>
                <td>
                  <strong>{p.descricao}</strong>
                  {p.defeito && <small>{p.defeito}</small>}
                </td>
                <td>{p.marca || "—"}</td>
                <td>{p.fornecedor_nome}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>{dt(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pecas.length && <Empty text="Nenhuma peça encontrada." />}
      </div>
    </section>
  );
}

function FornecedoresTab({ fornecedores, onAtualizado }: { fornecedores: Fornecedor[]; onAtualizado: () => void }) {
  const [showNovo, setShowNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [contato, setContato] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) return setErr("Digite o nome do fornecedor.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/pecas-fornecedor/fornecedores", { nome, identificacao, contato });
      setNome("");
      setIdentificacao("");
      setContato("");
      setShowNovo(false);
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (f: Fornecedor) => {
    if (!confirm(`Desativar o fornecedor ${f.nome}?`)) return;
    await api.patch(`/api/pecas-fornecedor/fornecedores/${f.id}`, { ativo: false });
    onAtualizado();
  };

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
              <th>Contato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.nome}</strong>
                </td>
                <td>{f.identificacao || "—"}</td>
                <td>{f.contato || "—"}</td>
                <td>
                  <button className="secondary" onClick={() => desativar(f)}>
                    Desativar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!fornecedores.length && <Empty text="Nenhum fornecedor cadastrado." />}
      </div>

      {showNovo && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <div>
                <h2>Novo fornecedor</h2>
                <p>Cadastre com uma identificação (CNPJ ou código interno) pra facilitar o controle.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowNovo(false)}>
                <X />
              </button>
            </div>
            <label className="field">
              <span>Nome *</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Identificação (CNPJ / código)</span>
                <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} />
              </label>
              <label className="field">
                <span>Contato</span>
                <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Telefone ou email" />
              </label>
            </div>
            {err && <div className="error">{err}</div>}
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowNovo(false)}>
                Cancelar
              </button>
              <button className="primary" disabled={saving} onClick={salvar}>
                {saving ? "Salvando…" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
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

type ItemLote = {
  key: number;
  codigo: string;
  descricao: string;
  serial: string;
  defeito: string;
};

let itemLoteSeq = 0;

function NovaPecaModal({
  fornecedores,
  estoquePecas,
  onClose,
  onCriada,
}: {
  fornecedores: Fornecedor[];
  estoquePecas: Part[];
  onClose: () => void;
  onCriada: (ids: number[]) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState(fornecedores[0]?.id || 0);
  const [rmaRelacionado, setRmaRelacionado] = useState("");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const encontradas = busca
    ? estoquePecas.filter((p) => (p.code + " " + p.name).toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];

  const adicionarDoEstoque = (p: Part) => {
    setItens((x) => [...x, { key: ++itemLoteSeq, codigo: p.code, descricao: p.name, serial: "", defeito: "" }]);
    setBusca("");
  };

  const adicionarAvulsa = () => {
    setItens((x) => [...x, { key: ++itemLoteSeq, codigo: "", descricao: "", serial: "", defeito: "" }]);
  };

  const atualizarItem = (key: number, patch: Partial<ItemLote>) => {
    setItens((x) => x.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const removerItem = (key: number) => {
    setItens((x) => x.filter((i) => i.key !== key));
  };

  const salvar = async () => {
    setErr("");
    if (!fornecedorId) return setErr("Selecione o fornecedor.");
    if (!itens.length) return setErr("Adicione ao menos uma peça na lista.");
    const semDescricao = itens.findIndex((i) => !i.descricao.trim());
    if (semDescricao !== -1) return setErr(`Peça ${semDescricao + 1} da lista está sem descrição.`);
    setSaving(true);
    try {
      const res = await api.post<{ ok: boolean; ids: number[] }>("/api/pecas-fornecedor/pecas/lote", {
        fornecedorId,
        rmaRelacionado,
        itens: itens.map(({ codigo, descricao, serial, defeito }) => ({ codigo, descricao, serial, defeito })),
      });
      onCriada(res.ids);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar as peças.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novas peças para o fornecedor" subtitle="Monte a lista de peças defeituosas antes de enviar ao fornecedor." onClose={onClose}>
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
          <div className="cart-row" key={item.key} style={{ gridTemplateColumns: "1fr 1fr 1fr 32px", alignItems: "start" }}>
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
        <StatusBadge status={peca.status} />
        {peca.rma_relacionado && <span className="pill in">RMA: {peca.rma_relacionado}</span>}
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

      <Field label="Status">
        <select value={peca.status} onChange={(e) => atualizar({ status: e.target.value })} disabled={salvando}>
          {Object.entries(STATUS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
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
