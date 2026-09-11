import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "../../api";
import type { LogConferencia } from "../../types";
import { Empty, Panel } from "../ui";
import { CONFERENCIA_STATUS_LABEL, ConferenciaStatusBadge } from "./ui";
import NovaConferenciaModal from "./NovaConferenciaModal";

export default function ConferenciaLista({
  refreshKey,
  onAbrir,
  onAtualizado,
}: {
  refreshKey: number;
  onAbrir: (id: number) => void;
  onAtualizado: () => void;
}) {
  const [conferencias, setConferencias] = useState<LogConferencia[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    const r = await api.get<{ conferencias: LogConferencia[] }>(`/api/logistica/conferencia?${params}`);
    setConferencias(r.conferencias);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, busca, status]);

  return (
    <div>
      <Panel title="Fila de conferência de entrada" subtitle="Pedidos aguardando ou em conferência do fornecedor.">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input placeholder="Buscar por número, fornecedor, SKU ou nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(CONFERENCIA_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setNovaAberta(true)}>
            <Plus size={16} /> Nova conferência
          </button>
        </div>

        {carregando && <p className="cart-empty">Carregando…</p>}
        {!carregando && !conferencias.length && <Empty text="Nenhuma conferência encontrada." />}
        {!carregando && !!conferencias.length && (
          <div className="order-grid">
            {conferencias.map((c) => (
              <button key={c.id} className="order-card" onClick={() => onAbrir(c.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <b className="code">{c.numero}</b>
                  <ConferenciaStatusBadge status={c.status} />
                </div>
                <p style={{ margin: "6px 0 2px" }}>{c.fornecedor_nome}</p>
                <small>
                  {c.total_itens} item(ns) · {c.divergencias_abertas ? `${c.divergencias_abertas} divergência(s) aberta(s)` : "sem divergências"}
                </small>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {novaAberta && (
        <NovaConferenciaModal
          onClose={() => setNovaAberta(false)}
          onCriado={(id) => {
            setNovaAberta(false);
            onAtualizado();
            onAbrir(id);
          }}
        />
      )}
    </div>
  );
}
