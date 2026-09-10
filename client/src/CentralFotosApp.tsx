import { useState } from "react";
import { ArrowLeft, Camera, ImagePlus, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import type { User } from "./types";
import ProdutosTab from "./centralFotos/ProdutosTab";
import VisaoGeralTab from "./centralFotos/VisaoGeralTab";

export default function CentralFotosApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const isAdmin = user.role === "admin";
  const tabs = [
    ["painel", "Visão geral", LayoutDashboard],
    ["produtos", "Produtos", ImagePlus],
  ] as const;

  const [tab, setTab] = useState<string>("painel");
  const [mobile, setMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Camera size={22} />
          </div>
          <div>
            <strong>CENTRAL DE FOTOS</strong>
            <span>Fotos dos produtos por SKU</span>
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
            <p>Central de Fotos</p>
            <h1>{title}</h1>
          </div>
        </header>

        {tab === "painel" && <VisaoGeralTab isAdmin={isAdmin} refreshKey={refreshKey} />}
        {tab === "produtos" && <ProdutosTab isAdmin={isAdmin} refreshKey={refreshKey} onAlterado={() => setRefreshKey((k) => k + 1)} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}
