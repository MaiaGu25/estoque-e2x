import { useEffect, useState } from "react";
import {
  ArrowLeft, BarChart3, ClipboardList, History, LogOut, Map as MapIcon,
  Menu, PackageSearch, RefreshCw, ShieldCheck, Warehouse, X,
} from "lucide-react";
import { api } from "../api";
import type { LogMapa, User } from "../types";
import { useRealtime } from "../useRealtime";
import DashboardTab from "./DashboardTab";
import ProdutosTab from "./ProdutosTab";
import MovimentacoesTab from "./MovimentacoesTab";
import HistoricoTab from "./HistoricoTab";
import MapaTab from "./MapaTab";

const empty: LogMapa = { racks: [] };

export default function LogisticaApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const isAdmin = user.role === "admin";
  const tabs = [
    ["painel", "Painel", BarChart3],
    ["produtos", "Produtos", PackageSearch],
    ["movimentar", "Movimentar", ClipboardList],
    ["historico", "Histórico", History],
    ["mapa", "Mapa do Galpão", MapIcon],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [mobile, setMobile] = useState(false);
  const [mapa, setMapa] = useState<LogMapa>(empty);
  const [refreshKey, setRefreshKey] = useState(0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("logistica", recarregar);

  const carregarMapa = async () => {
    const r = await api.get<LogMapa>("/api/logistica/mapa");
    setMapa(r);
  };

  useEffect(() => {
    carregarMapa();
  }, [refreshKey]);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Warehouse size={22} />
          </div>
          <div>
            <strong>LOGÍSTICA</strong>
            <span>Estoque do galpão</span>
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
            <p>Logística</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={recarregar}>
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </header>

        {tab === "painel" && <DashboardTab refreshKey={refreshKey} />}
        {tab === "produtos" && <ProdutosTab refreshKey={refreshKey} isAdmin={isAdmin} onAtualizado={recarregar} />}
        {tab === "movimentar" && <MovimentacoesTab mapa={mapa} onRegistrado={recarregar} usuario={user} />}
        {tab === "historico" && <HistoricoTab refreshKey={refreshKey} />}
        {tab === "mapa" && <MapaTab mapa={mapa} isAdmin={isAdmin} onAtualizado={recarregar} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}
