import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import type { MktOrder } from "./types";
import { Empty, MARKETPLACE_LABEL, Panel, PrazoBadge, StatusBadge, dt, fmt } from "./ui";
import PedidoDetalhe from "./PedidoDetalhe";

const STATUS_OPCOES = [
  "novo",
  "aguardando_pagamento",
  "pago",
  "aguardando_separacao",
  "em_separacao",
  "separado",
  "aguardando_expedicao",
  "enviado",
  "entregue",
  "cancelado",
  "devolvido",
  "com_divergencia",
];

export default function PedidosTab({ refreshKey, onAtualizado }: { refreshKey: number; onAtualizado: () => void }) {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [pedidos, setPedidos] = useState<MktOrder[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [origem, setOrigem] = useState("");
  const [situacaoPrazo, setSituacaoPrazo] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    if (marketplace) params.set("marketplace", marketplace);
    if (origem) params.set("origem", origem);
    if (situacaoPrazo) params.set("situacaoPrazo", situacaoPrazo);
    const r = await api.get<{ pedidos: MktOrder[] }>(`/api/marketplace/pedidos?${params}`);
    setPedidos(r.pedidos);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, busca, status, marketplace, origem, situacaoPrazo]);

  if (selecionadoId) {
    return (
      <PedidoDetalhe
        id={selecionadoId}
        refreshKey={refreshKey}
        onVoltar={() => setSelecionadoId(null)}
        onAtualizado={() => {
          onAtualizado();
          carregar();
        }}
      />
    );
  }

  return (
    <Panel title="Fila de pedidos" subtitle="Pedidos de todas as lojas conectadas, mais os cadastrados manualmente.">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="Número, SKU, produto, comprador…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
          <option value="">Todos os marketplaces</option>
          <option value="mercado_livre">Mercado Livre</option>
          <option value="shopee">Shopee</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPCOES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
          <option value="">Automática e manual</option>
          <option value="automatica">Só automática</option>
          <option value="manual">Só manual</option>
        </select>
        <select value={situacaoPrazo} onChange={(e) => setSituacaoPrazo(e.target.value)}>
          <option value="">Qualquer prazo</option>
          <option value="atrasado">Atrasados</option>
          <option value="proximo">Próximos do prazo</option>
          <option value="no_prazo">No prazo</option>
        </select>
      </div>

      {carregando && <p className="cart-empty">Carregando…</p>}
      {!carregando && !pedidos.length && <Empty text="Nenhum pedido encontrado." />}
      {!carregando && !!pedidos.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Número</th>
                <th>Data</th>
                <th>Comprador</th>
                <th className="num">Itens</th>
                <th className="num">Total</th>
                <th>Prazo</th>
                <th>Status</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} onClick={() => setSelecionadoId(p.id)} style={{ cursor: "pointer" }}>
                  <td>
                    {MARKETPLACE_LABEL[p.marketplace]}
                    <br />
                    <small>{p.conta_apelido || p.conta_nome}</small>
                  </td>
                  <td className="code">{p.numero_visivel || p.id_externo}</td>
                  <td>{dt(p.importado_em)}</td>
                  <td>{p.comprador_nome || "-"}</td>
                  <td className="num">{fmt(p.total_unidades || 0)}</td>
                  <td className="num">{p.valor_total ? p.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}</td>
                  <td>
                    <PrazoBadge situacao={typeof p.situacao_prazo === "string" ? p.situacao_prazo : p.situacao_prazo.situacao} />
                  </td>
                  <td>
                    <StatusBadge status={p.status_interno} />
                  </td>
                  <td>{p.origem === "automatica" ? "Automática" : "Manual"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
