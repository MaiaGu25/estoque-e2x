import { useState } from "react";
import type { User } from "../../types";
import { useRealtime } from "../../useRealtime";
import SeparacaoLista from "./SeparacaoLista";
import SeparacaoDetalhe from "./SeparacaoDetalhe";

export default function SeparacaoTab({ isAdmin }: { usuario: User; isAdmin: boolean }) {
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const recarregar = () => setRefreshKey((k) => k + 1);
  useRealtime("logistica", recarregar);

  if (selecionadoId) {
    return (
      <SeparacaoDetalhe
        id={selecionadoId}
        isAdmin={isAdmin}
        refreshKey={refreshKey}
        onVoltar={() => setSelecionadoId(null)}
        onAtualizado={recarregar}
      />
    );
  }

  return <SeparacaoLista refreshKey={refreshKey} onAbrir={setSelecionadoId} onAtualizado={recarregar} />;
}
