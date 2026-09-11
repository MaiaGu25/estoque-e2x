import { useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, FileSpreadsheet, LogOut, Menu, RotateCcw, ScanLine, Settings, ShieldCheck, X } from "lucide-react";
import type { User } from "./types";
import { useRealtime } from "./useRealtime";
import type { RmaOpcoesPorTipo } from "./rma/types";
import { rmaApi } from "./rma/rmaApi";
import ListaTab from "./rma/ListaTab";
import EtiquetaTab from "./rma/EtiquetaTab";
import ExcelTab from "./rma/ExcelTab";
import AdminOpcoesTab from "./rma/AdminOpcoesTab";

export default function RmaApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const isAdmin = user.role === "admin";
  const tabs = [
    ["protocolos", "Protocolos", ClipboardList],
    ["etiqueta", "Ler etiqueta", ScanLine],
    ["excel", "Importar/Exportar", FileSpreadsheet],
    ...(isAdmin ? [["opcoes", "Opções configuráveis", Settings] as const] : []),
  ] as const;

  const [tab, setTab] = useState<string>("protocolos");
  const [mobile, setMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [opcoes, setOpcoes] = useState<RmaOpcoesPorTipo | null>(null);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("rma", recarregar);

  useEffect(() => {
    rmaApi.opcoesAtivas().then((r) => setOpcoes(r.opcoes));
  }, [refreshKey]);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <RotateCcw size={22} />
          </div>
          <div>
            <strong>RMA / SAC</strong>
            <span>Reclamações & devoluções</span>
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
            <p>RMA / SAC</p>
            <h1>{title}</h1>
          </div>
        </header>

        {tab === "protocolos" && <ListaTab opcoes={opcoes} refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "etiqueta" && <EtiquetaTab opcoes={opcoes} onAtualizado={recarregar} onAbrirLista={() => setTab("protocolos")} />}
        {tab === "excel" && <ExcelTab onAtualizado={recarregar} />}
        {tab === "opcoes" && isAdmin && <AdminOpcoesTab onAtualizado={recarregar} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}
