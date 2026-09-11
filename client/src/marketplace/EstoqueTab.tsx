import { useEffect, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { Badge } from "../Badge";
import type { MktStockPart } from "./types";
import { EstoqueSituacaoBadge, Empty, Panel, dt, fmt } from "./ui";

export default function EstoqueTab({ refreshKey }: { refreshKey: number }) {
  const [pecas, setPecas] = useState<MktStockPart[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (status) params.set("status", status);
    api.get<{ pecas: MktStockPart[] }>(`/api/marketplace/estoque?${params}`).then((r) => setPecas(r.pecas));
  }, [refreshKey, busca, status]);

  return (
    <Panel title="Estoque geral" subtitle="Consulta - saldos só são alterados pelo módulo Estoque/Reservados, nunca por aqui.">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="SKU, código ou nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="disponivel">Disponível</option>
          <option value="baixo">Estoque baixo</option>
          <option value="sem_estoque">Sem estoque</option>
          <option value="com_reserva">Com reserva</option>
          <option value="nao_vinculado">Sem anúncio vinculado</option>
        </select>
      </div>

      {!pecas.length && <Empty text="Nenhum produto encontrado." />}
      {!!pecas.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th className="num">Físico</th>
                <th className="num">Reservado</th>
                <th className="num">Disponível</th>
                <th>Situação</th>
                <th>Última movimentação</th>
              </tr>
            </thead>
            <tbody>
              {pecas.map((p) => (
                <tr key={p.id}>
                  <td className="code">{p.code}</td>
                  <td>{p.name}</td>
                  <td className="num">{fmt(p.quantity)}</td>
                  <td className="num">{fmt(p.reserved_quantity)}</td>
                  <td className="num">{fmt(p.saldo_disponivel)}</td>
                  <td>
                    <EstoqueSituacaoBadge situacao={p.situacao} />
                    {p.nao_vinculado && (
                      <Badge icon={TriangleAlert} tone="warn">
                        Sem anúncio
                      </Badge>
                    )}
                  </td>
                  <td>{dt(p.ultima_movimentacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
