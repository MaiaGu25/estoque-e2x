import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { api } from "../../api";
import type { LogPedidoSaida } from "../../types";
import { Empty, Panel } from "../ui";
import { CANAL_LABEL, PEDIDO_STATUS_CLASS, PEDIDO_STATUS_LABEL, PRIORIDADE_CLASS, PRIORIDADE_LABEL } from "./ui";
import NovoPedidoModal from "./NovoPedidoModal";

export default function SeparacaoLista({
  refreshKey,
  onAbrir,
  onAtualizado,
}: {
  refreshKey: number;
  onAbrir: (id: number) => void;
  onAtualizado: () => void;
}) {
  const [pedidos, setPedidos] = useState<LogPedidoSaida[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [canal, setCanal] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    if (canal) params.set("canal", canal);
    const r = await api.get<{ pedidos: LogPedidoSaida[] }>(`/api/logistica/separacao?${params}`);
    setPedidos(r.pedidos);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, busca, status, canal]);

  return (
    <div>
      <Panel title="Fila de separação de pedidos" subtitle="Pedidos de vendedores, marketplaces e manuais aguardando ou em separação.">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input placeholder="Buscar por número, cliente, vendedor, SKU…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(PEDIDO_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Todos os canais</option>
            {Object.entries(CANAL_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setNovoAberto(true)}>
            <Plus size={16} /> Novo pedido
          </button>
        </div>

        {carregando && <p className="cart-empty">Carregando…</p>}
        {!carregando && !pedidos.length && <Empty text="Nenhum pedido encontrado." />}
        {!carregando && !!pedidos.length && (
          <div className="order-grid">
            {pedidos.map((p) => (
              <button key={p.id} className="order-card" onClick={() => onAbrir(p.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <b className="code">{p.numero}</b>
                  <span className={`status ${PEDIDO_STATUS_CLASS[p.status]}`}>{PEDIDO_STATUS_LABEL[p.status]}</span>
                </div>
                <p style={{ margin: "6px 0 2px" }}>
                  {CANAL_LABEL[p.canal]} {p.cliente_nome ? `· ${p.cliente_nome}` : ""} {p.vendedor ? `· ${p.vendedor}` : ""}
                </p>
                <small>
                  {p.total_itens} item(ns) · {p.divergencias_abertas ? `${p.divergencias_abertas} divergência(s)` : "sem divergências"} ·{" "}
                  <span className={`status ${PRIORIDADE_CLASS[p.prioridade]}`}>{PRIORIDADE_LABEL[p.prioridade]}</span>
                </small>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {novoAberto && (
        <NovoPedidoModal
          onClose={() => setNovoAberto(false)}
          onCriado={(id) => {
            setNovoAberto(false);
            onAtualizado();
            onAbrir(id);
          }}
        />
      )}
    </div>
  );
}
