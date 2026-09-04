import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Boxes, ChevronRight,
  ClipboardList, Cpu, History, LayoutDashboard, LogOut, Menu, Plus, RefreshCw,
  ShieldCheck, TriangleAlert, X,
} from "lucide-react";
import { api } from "./api";
import type { TecConfig, TecConfigItem, TecItem, TecMovimento, TecnicosData, User } from "./types";

const empty: TecnicosData = { itens: [], configuracoes: [], configItens: [], movimentos: [] };
const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function status(qtd: number, limite: number): ["CRITICO" | "BAIXO" | "NORMAL", string] {
  if (qtd <= 2) return ["CRITICO", "#ff5c5c"];
  if (qtd <= limite) return ["BAIXO", "#f1c84b"];
  return ["NORMAL", "#34e889"];
}

export default function TecnicosApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["painel", "Painel", LayoutDashboard],
    ["estoque", "Estoque", Boxes],
    ["maquinas", "Máquinas", Cpu],
    ["configuracoes", "Configurações", ClipboardList],
    ["historico", "Histórico", History],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [data, setData] = useState<TecnicosData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState<null | "entrada" | "saida" | "config" | "montar" | "retirar" | "desmontar">(null);
  const [editingConfig, setEditingConfig] = useState<{ config: TecConfig; duplicar: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api.get<TecnicosData>("/api/tecnicos/data");
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

  const totalPecas = data.itens.reduce((s, i) => s + i.quantidade, 0);
  const totalMaquinas = data.configuracoes.reduce((s, c) => s + c.estoque_maquinas, 0);
  const emAtencao = data.itens.filter((i) => i.quantidade <= i.limite_baixo).length;
  const categorias = useMemo(() => {
    const list: string[] = [];
    for (const item of data.itens) if (!list.includes(item.categoria)) list.push(item.categoria);
    return list;
  }, [data.itens]);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>ESTOQUE TÉCNICOS</strong>
            <span>Bancada &amp; montagem</span>
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
            <p>Estoque dos Técnicos</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={load}>
              <RefreshCw size={16} /> Atualizar
            </button>
            {tab === "estoque" && (
              <>
                <button className="secondary" onClick={() => setModal("saida")}>
                  <ArrowUpFromLine size={16} /> Saída
                </button>
                <button className="primary" onClick={() => setModal("entrada")}>
                  <ArrowDownToLine size={16} /> Entrada
                </button>
              </>
            )}
            {tab === "maquinas" && (
              <button className="primary" onClick={() => setModal("montar")}>
                <Plus size={17} /> Montar
              </button>
            )}
            {tab === "configuracoes" && (
              <button className="primary" onClick={() => setModal("config")}>
                <Plus size={17} /> Nova configuração
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
            <RefreshCw className="spin" /> Sincronizando…
          </div>
        ) : (
          <>
            {tab === "painel" && (
              <section>
                <div className="stats">
                  <Stat icon={Boxes} label="Peças no estoque" value={fmt(totalPecas)} note="unidades" />
                  <Stat icon={Cpu} label="Máquinas prontas" value={fmt(totalMaquinas)} note="em estoque" />
                  <Stat icon={TriangleAlert} label="Itens em atenção" value={fmt(emAtencao)} note="abaixo do mínimo" alert={!!emAtencao} />
                  <Stat icon={History} label="Movimentações" value={fmt(data.movimentos.length)} note="últimos registros" />
                </div>
                {categorias.map((cat) => {
                  const itens = data.itens.filter((i) => i.categoria === cat);
                  return (
                    <Panel key={cat} title={cat.toUpperCase()} subtitle={`${itens.reduce((s, i) => s + i.quantidade, 0)} un. no total`}>
                      <div className="tec-grid">
                        {itens.map((item) => {
                          const [label, cor] = status(item.quantidade, item.limite_baixo);
                          return (
                            <div className="tec-card" key={item.id}>
                              <span>{item.nome}</span>
                              <strong style={{ color: cor }}>{item.quantidade}</strong>
                              <small style={{ color: cor }}>{label}</small>
                            </div>
                          );
                        })}
                      </div>
                    </Panel>
                  );
                })}
              </section>
            )}
            {tab === "estoque" && (
              <section>
                {categorias.map((cat) => (
                  <Panel key={cat} title={cat.toUpperCase()}>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {data.itens
                            .filter((i) => i.categoria === cat)
                            .map((item) => {
                              const [label, cor] = status(item.quantidade, item.limite_baixo);
                              return (
                                <tr key={item.id}>
                                  <td>
                                    <strong>{item.nome}</strong>
                                  </td>
                                  <td className="num" style={{ color: cor }}>
                                    <b>{item.quantidade} unidades</b>
                                  </td>
                                  <td>
                                    <span className="status" style={{ background: cor + "22", color: cor }}>
                                      {label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                ))}
              </section>
            )}
            {tab === "maquinas" && (
              <section>
                <div className="action-grid">
                  <button className="big-action out" onClick={() => setModal("retirar")}>
                    <ArrowUpFromLine />
                    <span>
                      <b>Retirar máquinas</b>
                      <small>Reduz o estoque de máquinas prontas</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button className="big-action out" onClick={() => setModal("desmontar")}>
                    <Cpu />
                    <span>
                      <b>Desmontar máquinas</b>
                      <small>Devolve as peças vinculadas ao estoque</small>
                    </span>
                    <ChevronRight />
                  </button>
                </div>
                {!data.configuracoes.length && <Empty text="Nenhuma configuração cadastrada." />}
                {data.configuracoes.map((cfg) => (
                  <div className="order-card tec-machine-card" key={cfg.id}>
                    <div>
                      <h3>{cfg.nome}</h3>
                      <p>
                        CPU: {cfg.processador || "-"} · RAM: {cfg.ram || "-"} · SSD: {cfg.ssd || "-"}
                      </p>
                    </div>
                    <footer>
                      <span>{cfg.estoque_maquinas} prontas</span>
                    </footer>
                  </div>
                ))}
              </section>
            )}
            {tab === "configuracoes" && (
              <section>
                {!data.configuracoes.length && <Empty text="Nenhuma configuração cadastrada." />}
                {data.configuracoes.map((cfg) => {
                  const pecas = data.configItens.filter((ci) => ci.configuracao_id === cfg.id);
                  return (
                    <div className="order-card tec-machine-card" key={cfg.id}>
                      <div>
                        <h3>{cfg.nome}</h3>
                        <p>
                          CPU: {cfg.processador || "-"} · RAM: {cfg.ram || "-"} · SSD: {cfg.ssd || "-"}
                        </p>
                        <p>Peças: {pecas.map((p) => `${p.nome} x${p.quantidade}`).join(", ") || "nenhuma"}</p>
                        {cfg.observacao && <p>Obs.: {cfg.observacao}</p>}
                      </div>
                      <footer>
                        <span>{cfg.estoque_maquinas} prontas</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="secondary" onClick={() => setEditingConfig({ config: cfg, duplicar: false })}>
                            Editar
                          </button>
                          <button className="secondary" onClick={() => setEditingConfig({ config: cfg, duplicar: true })}>
                            Duplicar
                          </button>
                        </div>
                      </footer>
                    </div>
                  );
                })}
              </section>
            )}
            {tab === "historico" && (
              <Panel title="Histórico de movimentações" subtitle={`${data.movimentos.length} registros`}>
                <TecMovimentosTable rows={data.movimentos} />
              </Panel>
            )}
          </>
        )}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
      {(modal === "entrada" || modal === "saida") && (
        <MovimentacaoModal
          tipo={modal === "entrada" ? "ENTRADA" : "SAIDA"}
          itens={data.itens}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "config" && (
        <ConfigModal
          itens={data.itens}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {editingConfig && (
        <ConfigModal
          itens={data.itens}
          existente={editingConfig.config}
          existenteItens={data.configItens.filter((ci) => ci.configuracao_id === editingConfig.config.id)}
          duplicar={editingConfig.duplicar}
          onClose={() => setEditingConfig(null)}
          onSaved={() => {
            setEditingConfig(null);
            load();
          }}
        />
      )}
      {modal === "montar" && (
        <MontarModal
          configuracoes={data.configuracoes}
          configItens={data.configItens}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {(modal === "retirar" || modal === "desmontar") && (
        <RetirarModal
          desmontar={modal === "desmontar"}
          configuracoes={data.configuracoes.filter((c) => c.estoque_maquinas > 0)}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
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

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
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

function TecMovimentosTable({ rows }: { rows: TecMovimento[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Alvo</th>
            <th className="num">Qtd.</th>
            <th>Motivo</th>
            <th>Responsável</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{dt(m.created_at)}</td>
              <td>
                <span className={m.tipo === "ENTRADA" ? "pill in" : "pill out"}>{m.tipo}</span>
              </td>
              <td>{m.alvo}</td>
              <td className="num">{fmt(m.quantidade)}</td>
              <td>
                {m.motivo}
                {m.detalhe && <small style={{ display: "block", color: "#889a92" }}>{m.detalhe}</small>}
              </td>
              <td>{m.responsible}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function MovimentacaoModal({ tipo, itens, onClose, onSaved }: { tipo: "ENTRADA" | "SAIDA"; itens: TecItem[]; onClose: () => void; onSaved: () => void }) {
  const [itemId, setItemId] = useState(itens[0]?.id || 0);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/tecnicos/movimentacao", { itemId, tipo, quantidade: Number(quantidade), motivo });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={tipo === "ENTRADA" ? "Entrada de estoque" : "Saída de estoque"} subtitle="Peças do setor de técnicos." onClose={onClose}>
      <Field label="Item">
        <select value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
          {itens.map((i) => (
            <option key={i.id} value={i.id}>
              {i.categoria} — {i.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantidade">
        <input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="Ex.: 10" />
      </Field>
      <Field label="Motivo">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Recebimento, uso interno, ajuste…" />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !quantidade} onClick={save}>
          {saving ? "Registrando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

function ConfigModal({
  itens,
  existente,
  existenteItens,
  duplicar,
  onClose,
  onSaved,
}: {
  itens: TecItem[];
  existente?: TecConfig;
  existenteItens?: TecConfigItem[];
  duplicar?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(existente ? existente.nome + (duplicar ? " - cópia" : "") : "");
  const [processador, setProcessador] = useState(existente?.processador || "");
  const [ram, setRam] = useState(existente?.ram || "");
  const [ssd, setSsd] = useState(existente?.ssd || "");
  const [observacao, setObservacao] = useState(existente?.observacao || "");
  const [selecionados, setSelecionados] = useState<Record<number, { on: boolean; qtd: string }>>(() => {
    const base: Record<number, { on: boolean; qtd: string }> = {};
    for (const it of itens) {
      const existenteItem = existenteItens?.find((ei) => ei.item_id === it.id);
      base[it.id] = { on: !!existenteItem, qtd: String(existenteItem?.quantidade || 1) };
    }
    return base;
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const bloqueado = !!existente && !duplicar && existente.estoque_maquinas > 0;

  const categorias = useMemo(() => {
    const list: string[] = [];
    for (const item of itens) if (!list.includes(item.categoria)) list.push(item.categoria);
    return list;
  }, [itens]);

  const save = async () => {
    if (!nome.trim()) return setErr("Digite o nome da configuração.");
    const itensSelecionados = Object.entries(selecionados)
      .filter(([, v]) => v.on)
      .map(([itemId, v]) => ({ itemId: Number(itemId), quantidade: Number(v.qtd) }));

    setSaving(true);
    setErr("");
    try {
      const payload = { nome, processador, ram, ssd, observacao, itens: itensSelecionados };
      if (existente && duplicar) {
        await api.post(`/api/tecnicos/configuracoes/${existente.id}/duplicar`, payload);
      } else if (existente) {
        await api.patch(`/api/tecnicos/configuracoes/${existente.id}`, payload);
      } else {
        await api.post("/api/tecnicos/configuracoes", payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={duplicar ? "Duplicar configuração" : existente ? "Editar configuração" : "Nova configuração"}
      subtitle="Crie quantas configurações forem necessárias e vincule as peças do setor."
      onClose={onClose}
    >
      <Field label="Nome da configuração">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: i5 2TH / 8GB / 480GB" />
      </Field>
      <div className="form-grid">
        <Field label="Processador">
          <input value={processador} onChange={(e) => setProcessador(e.target.value)} />
        </Field>
        <Field label="Memória RAM">
          <input value={ram} onChange={(e) => setRam(e.target.value)} />
        </Field>
        <Field label="SSD">
          <input value={ssd} onChange={(e) => setSsd(e.target.value)} />
        </Field>
      </div>
      {bloqueado && (
        <div className="error">Essa configuração tem máquinas montadas em estoque — desmonte/retire antes de editar, ou use "Duplicar".</div>
      )}
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, marginBottom: 8 }}>
        Peças consumidas por máquina
      </p>
      <div className="cart" style={{ maxHeight: 260 }}>
        {categorias.map((cat) => (
          <div key={cat}>
            <div className="cart-head">
              <b>{cat.toUpperCase()}</b>
            </div>
            {itens
              .filter((i) => i.categoria === cat)
              .map((item) => (
                <div className="cart-row" key={item.id} style={{ gridTemplateColumns: "1fr 70px 24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selecionados[item.id]?.on || false}
                      disabled={bloqueado}
                      onChange={(e) =>
                        setSelecionados((s) => ({ ...s, [item.id]: { ...s[item.id], on: e.target.checked } }))
                      }
                    />
                    {item.nome}
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={bloqueado}
                    value={selecionados[item.id]?.qtd || "1"}
                    onChange={(e) => setSelecionados((s) => ({ ...s, [item.id]: { ...s[item.id], qtd: e.target.value } }))}
                  />
                  <span />
                </div>
              ))}
          </div>
        ))}
      </div>
      <Field label="Observação">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || bloqueado} onClick={save}>
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </Modal>
  );
}

function MontarModal({
  configuracoes,
  configItens,
  onClose,
  onSaved,
}: {
  configuracoes: TecConfig[];
  configItens: TecConfigItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [configuracaoId, setConfiguracaoId] = useState(configuracoes[0]?.id || 0);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const pecas = configItens.filter((ci) => ci.configuracao_id === configuracaoId);
  const qtd = Number(quantidade) || 0;

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/tecnicos/montar", { configuracaoId, quantidade: qtd, motivo });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível montar.");
    } finally {
      setSaving(false);
    }
  };

  if (!configuracoes.length) {
    return (
      <Modal title="Montar máquinas" subtitle="" onClose={onClose}>
        <Empty text="Crie uma configuração primeiro." />
      </Modal>
    );
  }

  return (
    <Modal title="Montar máquinas" subtitle="Consome as peças vinculadas à configuração escolhida." onClose={onClose}>
      <Field label="Configuração">
        <select value={configuracaoId} onChange={(e) => setConfiguracaoId(Number(e.target.value))}>
          {configuracoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantidade de máquinas">
        <input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      </Field>
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, marginBottom: 8 }}>
        Previsão de consumo
      </p>
      <div className="cart">
        {pecas.map((p) => (
          <div className="cart-row" key={p.item_id} style={{ gridTemplateColumns: "1fr 90px" }}>
            <span>{p.nome}</span>
            <b>{p.quantidade * qtd} un.</b>
          </div>
        ))}
        {!pecas.length && <p className="cart-empty">Essa configuração não consome itens controlados.</p>}
      </div>
      <Field label="Motivo / observação">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Montagem para estoque" />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !qtd} onClick={save}>
          {saving ? "Montando…" : "Confirmar montagem"}
        </button>
      </div>
    </Modal>
  );
}

function RetirarModal({
  desmontar,
  configuracoes,
  onClose,
  onSaved,
}: {
  desmontar: boolean;
  configuracoes: TecConfig[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [configuracaoId, setConfiguracaoId] = useState(configuracoes[0]?.id || 0);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/tecnicos/maquina-operacao", { configuracaoId, quantidade: Number(quantidade), motivo, desmontar });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setSaving(false);
    }
  };

  if (!configuracoes.length) {
    return (
      <Modal title={desmontar ? "Desmontar máquinas" : "Retirar máquinas"} subtitle="" onClose={onClose}>
        <Empty text="Não há máquinas montadas disponíveis." />
      </Modal>
    );
  }

  return (
    <Modal title={desmontar ? "Desmontar máquinas" : "Retirar máquinas"} subtitle="" onClose={onClose}>
      <Field label="Configuração">
        <select value={configuracaoId} onChange={(e) => setConfiguracaoId(Number(e.target.value))}>
          {configuracoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.estoque_maquinas} prontas)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantidade">
        <input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      </Field>
      <Field label="Motivo">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      {desmontar && <p style={{ color: "#f1c84b", padding: "0 4px" }}>Ao desmontar, as peças vinculadas voltam automaticamente ao estoque.</p>}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !quantidade} onClick={save}>
          {saving ? "Confirmando…" : "Confirmar operação"}
        </button>
      </div>
    </Modal>
  );
}
