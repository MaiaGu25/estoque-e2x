import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { Badge } from "../Badge";
import type { MktAlert } from "./types";
import { Empty, Panel, SeveridadeBadge, dt } from "./ui";

export default function AlertasTab({ refreshKey, onAtualizado }: { refreshKey: number; onAtualizado: () => void }) {
  const [alertas, setAlertas] = useState<MktAlert[]>([]);
  const [status, setStatus] = useState("aberto");

  const carregar = async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const r = await api.get<{ alertas: MktAlert[] }>(`/api/marketplace/alertas?${params}`);
    setAlertas(r.alertas);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, status]);

  const marcarVisto = async (id: number) => {
    await api.patch(`/api/marketplace/alertas/${id}/visto`);
    onAtualizado();
    carregar();
  };

  const resolver = async (id: number) => {
    await api.patch(`/api/marketplace/alertas/${id}/resolver`);
    onAtualizado();
    carregar();
  };

  return (
    <Panel title="Alertas" subtitle="Falhas, divergências e situações que precisam de atenção administrativa.">
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="aberto">Abertos</option>
          <option value="visto">Vistos</option>
          <option value="resolvido">Resolvidos</option>
          <option value="">Todos</option>
        </select>
      </div>

      {!alertas.length && <Empty text="Nenhum alerta nessa situação." />}
      {!!alertas.length && (
        <div className="cart">
          {alertas.map((a) => (
            <div key={a.id} className="cart-row" style={{ gridTemplateColumns: "auto 1fr auto" }}>
              <SeveridadeBadge severidade={a.severidade} />
              <span>
                <b>{a.titulo}</b>
                <small>{a.descricao}</small>
                <small>
                  {a.conta_nome ? `${a.conta_nome} · ` : ""}
                  {a.numero_visivel || a.id_externo || ""} · {dt(a.created_at)}
                </small>
              </span>
              {a.status !== "resolvido" && (
                <div style={{ display: "flex", gap: 4 }}>
                  {a.status === "aberto" && (
                    <button className="secondary" onClick={() => marcarVisto(a.id)}>
                      Marcar visto
                    </button>
                  )}
                  <button className="primary" onClick={() => resolver(a.id)}>
                    Resolver
                  </button>
                </div>
              )}
              {a.status === "resolvido" && <Badge icon={CheckCircle2} tone="ok">Resolvido</Badge>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
