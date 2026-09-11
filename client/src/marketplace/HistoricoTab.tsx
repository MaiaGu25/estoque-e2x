import { useEffect, useState } from "react";
import { api } from "../api";
import type { MktAuditLog } from "./types";
import { Empty, Panel, dt } from "./ui";

export default function HistoricoTab({ refreshKey }: { refreshKey: number }) {
  const [registros, setRegistros] = useState<MktAuditLog[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (busca) params.set("action", busca);
    api.get<{ registros: MktAuditLog[] }>(`/api/marketplace/auditoria?${params}`).then((r) => setRegistros(r.registros));
  }, [refreshKey, busca]);

  return (
    <Panel title="Histórico e auditoria" subtitle="Todo acesso administrativo importante fica registrado - usuários comuns não têm acesso a este módulo.">
      <div className="toolbar">
        <input placeholder="Filtrar por ação (ex.: pedido.cancelado)" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {!registros.length && <Empty text="Nenhum registro de auditoria ainda." />}
      {!!registros.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Usuário</th>
                <th>Resultado</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.action}</td>
                  <td>
                    {r.entity_type}
                    {r.entity_id ? ` #${r.entity_id}` : ""}
                  </td>
                  <td>{r.user_name}</td>
                  <td>{r.resultado}</td>
                  <td>{dt(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
