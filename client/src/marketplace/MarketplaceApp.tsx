import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, BarChart3, ClipboardList, History, LogOut, Menu,
  PackagePlus, PackageSearch, RefreshCw, ShieldCheck, ShoppingBag, Store, X,
} from "lucide-react";
import type { User } from "../types";
import { useRealtime } from "../useRealtime";
import DashboardTab from "./DashboardTab";
import PedidosTab from "./PedidosTab";
import PedidoManualTab from "./PedidoManualTab";
import ProdutosTab from "./ProdutosTab";
import EstoqueTab from "./EstoqueTab";
import LojasTab from "./LojasTab";
import SincronizacaoTab from "./SincronizacaoTab";
import AlertasTab from "./AlertasTab";
import HistoricoTab from "./HistoricoTab";

export default function MarketplaceApp({ user, onLogout, onHome }: { user: User; onLogout: () => void; onHome: () => void }) {
  const tabs = [
    ["visao-geral", "Visão geral", BarChart3],
    ["pedidos", "Pedidos", ClipboardList],
    ["manual", "Pedido manual", PackagePlus],
    ["produtos", "Produtos", PackageSearch],
    ["estoque", "Estoque", ShoppingBag],
    ["lojas", "Lojas", Store],
    ["sincronizacao", "Sincronização", RefreshCw],
    ["alertas", "Alertas", AlertTriangle],
    ["historico", "Histórico", History],
  ] as const;

  const [tab, setTab] = useState<string>("visao-geral");
  const [mobile, setMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const title = tabs.find((t) => t[0] === tab)?.[1];

  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("marketplace", recarregar);

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <ShoppingBag size={22} />
          </div>
          <div>
            <strong>MARKETPLACE</strong>
            <span>Mercado Livre · Shopee</span>
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
              <ShieldCheck size={12} /> Administrador
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
            <p>Marketplace</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={recarregar}>
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </header>

        {tab === "visao-geral" && <DashboardTab refreshKey={refreshKey} />}
        {tab === "pedidos" && <PedidosTab refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "manual" && <PedidoManualTab onCriado={recarregar} />}
        {tab === "produtos" && <ProdutosTab refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "estoque" && <EstoqueTab refreshKey={refreshKey} />}
        {tab === "lojas" && <LojasTab refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "sincronizacao" && <SincronizacaoTab refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "alertas" && <AlertasTab refreshKey={refreshKey} onAtualizado={recarregar} />}
        {tab === "historico" && <HistoricoTab refreshKey={refreshKey} />}
      </main>
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}
