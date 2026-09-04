import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowLeft, BarChart3, Camera, CheckCircle2, ClipboardList, Download,
  LogOut, Menu, RefreshCw, RotateCcw, Search, ShieldCheck, TriangleAlert, X,
} from "lucide-react";
import { api } from "./api";
import type { Teste, TestesStats, User } from "./types";

const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function TestesApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["registrar", "Registrar teste", Camera],
    ["consultar", "Consultar", Search],
    ["painel", "Painel", BarChart3],
  ] as const;

  const [tab, setTab] = useState<string>("registrar");
  const [mobile, setMobile] = useState(false);
  const [consultaInicial, setConsultaInicial] = useState("");
  const title = tabs.find((t) => t[0] === tab)?.[1];

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Archive size={22} />
          </div>
          <div>
            <strong>CENTRAL DE TESTES</strong>
            <span>Registro &amp; evidências</span>
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
            <p>Central de Testes</p>
            <h1>{title}</h1>
          </div>
        </header>
        {tab === "registrar" && <RegistrarTab user={user} />}
        {tab === "consultar" && <ConsultarTab codigoInicial={consultaInicial} />}
        {tab === "painel" && (
          <PainelTab
            onAbrirConsulta={(codigo) => {
              setConsultaInicial(codigo);
              setTab("consultar");
            }}
          />
        )}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}

function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"iniciando" | "ok" | "erro">("iniciando");
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!active) return;
    let cancelado = false;

    async function iniciar() {
      setStatus("iniciando");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Câmera indisponível neste endereço. Acesse pelo http://localhost:3000 no computador que tem a webcam conectada."
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ok");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível acessar a webcam.");
        setStatus("erro");
      }
    }
    iniciar();

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active]);

  const capturar = (): string | null => {
    const video = videoRef.current;
    if (!video || status !== "ok") return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  };

  return { videoRef, status, erro, capturar };
}

function RegistrarTab({ user }: { user: User }) {
  const { videoRef, status, erro, capturar } = useCamera(true);
  const [codigo, setCodigo] = useState("");
  const [codigoStatus, setCodigoStatus] = useState<"" | "ok" | "bloqueado" | "verificando">("");
  const [fotoSerial, setFotoSerial] = useState<string | null>(null);
  const [fotoTeste, setFotoTeste] = useState<string | null>(null);
  const [numeroAtual, setNumeroAtual] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [err, setErr] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    api.get<TestesStats>("/api/testes/stats").then((s) => setNumeroAtual(s.total + 1)).catch(() => {});
  }, []);

  const verificarCodigo = async () => {
    const c = codigo.trim();
    if (!c) return;
    setCodigoStatus("verificando");
    try {
      const res = await api.get<{ existe: boolean }>(`/api/testes/verificar?codigo=${encodeURIComponent(c)}`);
      setCodigoStatus(res.existe ? "bloqueado" : "ok");
    } catch {
      setCodigoStatus("");
    }
  };

  const finalizar = async () => {
    setErr("");
    if (!codigo.trim()) return setErr("Leia o código da máquina.");
    if (codigoStatus === "bloqueado") return setErr("Essa máquina já possui um teste registrado.");
    if (!fotoSerial) return setErr("Tire a foto do número de série.");
    if (!fotoTeste) return setErr("Tire a foto do resultado do teste.");

    setSalvando(true);
    try {
      const res = await api.post<{ ok: boolean; numero: number }>("/api/testes", {
        codigo: codigo.trim(),
        fotoSerial,
        fotoTeste,
      });
      setSucesso(`Teste nº ${String(res.numero).padStart(6, "0")} registrado para ${codigo.trim()}.`);
      setCodigo("");
      setCodigoStatus("");
      setFotoSerial(null);
      setFotoTeste(null);
      setNumeroAtual(res.numero + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar o teste.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="testes-registrar">
      <div className="testes-lado">
        <p className="tec-field-label">CÓDIGO DA MÁQUINA</p>
        <input
          autoFocus
          className="testes-codigo-input"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setCodigoStatus("");
          }}
          onKeyDown={(e) => e.key === "Enter" && verificarCodigo()}
          onBlur={verificarCodigo}
          placeholder="Passe o leitor aqui"
        />
        <p className={`testes-status ${codigoStatus === "bloqueado" ? "warn" : codigoStatus === "ok" ? "ok" : ""}`}>
          {codigoStatus === "bloqueado" && "⚠ Máquina já testada"}
          {codigoStatus === "ok" && "✓ Máquina disponível"}
          {codigoStatus === "verificando" && "Verificando…"}
          {!codigoStatus && "Aguardando código…"}
        </p>

        <p className="tec-field-label" style={{ marginTop: 20 }}>
          RESPONSÁVEL
        </p>
        <p className="testes-responsavel">{user.name}</p>

        <p className="tec-field-label" style={{ marginTop: 20 }}>
          NÚMERO DO TESTE
        </p>
        <p className="testes-numero">{numeroAtual !== null ? String(numeroAtual).padStart(6, "0") : "------"}</p>

        {err && <div className="error">{err}</div>}
        {sucesso && (
          <div className="testes-sucesso">
            <CheckCircle2 size={18} /> {sucesso}
          </div>
        )}

        <button
          className="primary testes-finalizar"
          disabled={salvando || !fotoSerial || !fotoTeste || !codigo.trim() || codigoStatus === "bloqueado"}
          onClick={finalizar}
        >
          <CheckCircle2 size={18} /> {salvando ? "Salvando…" : "Finalizar teste"}
        </button>
      </div>

      <div className="testes-direita">
        <p className="tec-field-label" style={{ textAlign: "center" }}>
          WEBCAM
        </p>
        <p className={`testes-status ${status === "ok" ? "ok" : status === "erro" ? "warn" : ""}`} style={{ textAlign: "center" }}>
          {status === "iniciando" && "Iniciando webcam…"}
          {status === "ok" && "● Webcam conectada"}
          {status === "erro" && `⚠ ${erro}`}
        </p>
        <div className="testes-video-wrap">
          <video ref={videoRef} autoPlay muted playsInline />
        </div>

        <div className="testes-fotos">
          <FotoBox
            titulo="📷 Número de série"
            foto={fotoSerial}
            onCapturar={() => setFotoSerial(capturar())}
            onRefazer={() => setFotoSerial(null)}
            disabled={status !== "ok"}
          />
          <FotoBox
            titulo="📷 Resultado do teste"
            foto={fotoTeste}
            onCapturar={() => setFotoTeste(capturar())}
            onRefazer={() => setFotoTeste(null)}
            disabled={status !== "ok"}
          />
        </div>
      </div>
    </section>
  );
}

function FotoBox({
  titulo,
  foto,
  onCapturar,
  onRefazer,
  disabled,
}: {
  titulo: string;
  foto: string | null;
  onCapturar: () => void;
  onRefazer: () => void;
  disabled: boolean;
}) {
  return (
    <div className="testes-foto-box">
      <p className="tec-field-label" style={{ textAlign: "center" }}>
        {titulo}
      </p>
      <div className="testes-foto-preview">
        {foto ? <img src={foto} alt={titulo} /> : <span>Aguardando foto</span>}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="secondary" onClick={onCapturar} disabled={disabled}>
          <Camera size={15} /> Tirar foto
        </button>
        <button className="secondary" onClick={onRefazer} disabled={!foto}>
          <RotateCcw size={15} /> Refazer
        </button>
      </div>
    </div>
  );
}

function ConsultarTab({ codigoInicial }: { codigoInicial: string }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [teste, setTeste] = useState<Teste | null>(null);
  const [status, setStatus] = useState("Aguardando código…");
  const [erro, setErro] = useState(false);

  const consultar = async (c?: string) => {
    const alvo = (c ?? codigo).trim();
    if (!alvo) return;
    try {
      const res = await api.get<{ teste: Teste }>(`/api/testes/consultar?codigo=${encodeURIComponent(alvo)}`);
      setTeste(res.teste);
      setStatus("✓ Teste encontrado");
      setErro(false);
    } catch (e) {
      setTeste(null);
      setStatus(e instanceof Error ? e.message : "Nenhum teste encontrado.");
      setErro(true);
    }
  };

  useEffect(() => {
    if (codigoInicial) consultar(codigoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInicial]);

  return (
    <section>
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && consultar()}
            placeholder="Passe o leitor ou digite o código"
          />
        </div>
        <button className="primary" onClick={() => consultar()}>
          Consultar
        </button>
      </div>
      <p className={erro ? "testes-status warn" : "testes-status ok"}>{status}</p>

      {teste && (
        <>
          <div className="detail-meta" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <div>
              <span>Código</span>
              <b>{teste.codigo}</b>
            </div>
            <div>
              <span>Nº Teste</span>
              <b>{String(teste.numero_teste).padStart(6, "0")}</b>
            </div>
            <div>
              <span>Responsável</span>
              <b>{teste.responsible}</b>
            </div>
            <div>
              <span>Data</span>
              <b>{dt(teste.created_at)}</b>
            </div>
          </div>
          <div className="testes-fotos" style={{ marginTop: 16 }}>
            <div className="testes-foto-box">
              <p className="tec-field-label" style={{ textAlign: "center" }}>
                📷 Número de série
              </p>
              <div className="testes-foto-preview">
                <img src={`/api/testes/${teste.id}/foto/serial`} alt="Serial" />
              </div>
            </div>
            <div className="testes-foto-box">
              <p className="tec-field-label" style={{ textAlign: "center" }}>
                📷 Resultado do teste
              </p>
              <div className="testes-foto-preview">
                <img src={`/api/testes/${teste.id}/foto/teste`} alt="Teste" />
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PainelTab({ onAbrirConsulta }: { onAbrirConsulta: (codigo: string) => void }) {
  const [stats, setStats] = useState<TestesStats | null>(null);
  const [testes, setTestes] = useState<Teste[]>([]);
  const [codigo, setCodigo] = useState("");
  const [responsavel, setResponsavel] = useState("Todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const responsaveis = useMemo(() => {
    const set = new Set(stats?.porResponsavel.map((r) => r.responsible) || []);
    return ["Todos", ...Array.from(set)];
  }, [stats]);

  const carregar = async () => {
    const s = await api.get<TestesStats>("/api/testes/stats");
    setStats(s);
    const params = new URLSearchParams();
    if (codigo) params.set("codigo", codigo);
    if (responsavel !== "Todos") params.set("responsavel", responsavel);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const res = await api.get<{ testes: Teste[] }>(`/api/testes?${params.toString()}`);
    setTestes(res.testes);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <div className="stats">
        <StatCard label="Testes totais" value={stats?.total ?? 0} />
        <StatCard label="Testes hoje" value={stats?.hoje ?? 0} />
        <div className="stat">
          <div>
            <span>ÚLTIMO TESTE</span>
            <strong style={{ fontSize: 18 }}>{stats?.ultimo?.codigo || "Nenhum"}</strong>
            {stats?.ultimo && (
              <small>
                {stats.ultimo.responsible} · {dt(stats.ultimo.created_at)}
              </small>
            )}
          </div>
          <ClipboardList />
        </div>
      </div>

      <div className="filters">
        <div>
          <label>Código</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <div>
          <label>Responsável</label>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            {responsaveis.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Data inicial</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <label>Data final</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <button className="primary" onClick={carregar}>
          <RefreshCw size={15} /> Pesquisar
        </button>
        <a className="secondary" href="/api/testes/export.csv" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Download size={15} /> CSV
        </a>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Teste</th>
              <th>Código</th>
              <th>Responsável</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {testes.map((t) => (
              <tr key={t.id}>
                <td>
                  <b className="code">{String(t.numero_teste).padStart(6, "0")}</b>
                </td>
                <td>{t.codigo}</td>
                <td>{t.responsible}</td>
                <td>{dt(t.created_at)}</td>
                <td>
                  <button className="icon-btn" title="Consultar" onClick={() => onAbrirConsulta(t.codigo)}>
                    <Search size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!testes.length && (
          <div className="empty">
            <TriangleAlert />
            <p>Nenhum resultado encontrado.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div>
        <span>{label.toUpperCase()}</span>
        <strong>{value}</strong>
      </div>
      <BarChart3 />
    </div>
  );
}
