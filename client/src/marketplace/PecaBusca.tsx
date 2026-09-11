import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import type { MktStockPart } from "./types";
import { fmt } from "./ui";

export default function PecaBusca({ onSelect, placeholder }: { onSelect: (p: MktStockPart) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<MktStockPart[]>([]);
  const [aberto, setAberto] = useState(false);

  const buscar = async (q: string) => {
    setQuery(q);
    const r = await api.get<{ pecas: MktStockPart[] }>(`/api/marketplace/estoque?busca=${encodeURIComponent(q)}`);
    setResultados(r.pecas.slice(0, 20));
  };

  const selecionar = (p: MktStockPart) => {
    onSelect(p);
    setQuery("");
    setResultados([]);
    setAberto(false);
  };

  return (
    <div className="part-search">
      <Search />
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        onFocus={() => {
          setAberto(true);
          if (!query) buscar("");
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados.length) {
            e.preventDefault();
            selecionar(resultados[0]);
          }
        }}
        placeholder={placeholder || "Digite o SKU ou nome do produto"}
      />
      {aberto && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selecionar(p)}>
              <span>
                <b>{p.code}</b> · {p.name}
              </span>
              <small>
                Disponível: {fmt(p.saldo_disponivel)} {p.unit}
              </small>
            </button>
          ))}
          {!resultados.length && <p className="cart-empty">Nenhum produto encontrado.</p>}
        </div>
      )}
    </div>
  );
}
