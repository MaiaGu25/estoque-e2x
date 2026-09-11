import { useState } from "react";
import type { LogMapa, User } from "../../types";
import { useRealtime } from "../../useRealtime";
import ConferenciaLista from "./ConferenciaLista";
import ConferenciaDetalhe from "./ConferenciaDetalhe";

export default function ConferenciaTab({ mapa, usuario, isAdmin }: { mapa: LogMapa; usuario: User; isAdmin: boolean }) {
  const [selecionadaId, setSelecionadaId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("logistica", recarregar);

  if (selecionadaId) {
    return (
      <ConferenciaDetalhe
        id={selecionadaId}
        mapa={mapa}
        usuario={usuario}
        isAdmin={isAdmin}
        refreshKey={refreshKey}
        onVoltar={() => setSelecionadaId(null)}
        onAtualizado={recarregar}
      />
    );
  }

  return <ConferenciaLista refreshKey={refreshKey} onAbrir={setSelecionadaId} onAtualizado={recarregar} />;
}
