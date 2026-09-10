import { useState } from "react";
import { ArrowLeft, ClipboardList, LogOut, Menu, RefreshCw, ShieldCheck, ShoppingCart, Search, X } from "lucide-react";
import type { User } from "../types";
import { useRealtime } from "../useRealtime";
import ConsultaTab from "./ConsultaTab";
import VendasTab from "./VendasTab";

export default function VendasApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const isAdmin = user.role === "admin";
  const tabs = [
    ["consulta", "Consulta", Search],
    ["orcamentos", "Orçamentos", ClipboardList],
  ] as const;

  const [tab, setTab] = useState<string>("consulta");
  const [mobile, setMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("logistica", recarregar);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <ShoppingCart size={22} />
          </div>
          <div>
            <strong>VENDAS</strong>
            <span>Consulta e orçamentos</span>
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
            <p>Vendas</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={recarregar}>
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </header>

        {tab === "consulta" && <ConsultaTab refreshKey={refreshKey} />}
        {tab === "orcamentos" && <VendasTab refreshKey={refreshKey} isAdmin={isAdmin} usuario={user} onAtualizado={recarregar} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}
