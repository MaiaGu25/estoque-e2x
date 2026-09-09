import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogProduto } from "../types";
import { Field, fmt } from "./ui";

type PosicaoResultado = { id: number; code: string; name: string };

// Seletor em cascata (fileira -> corredor -> montante -> lado -> prateleira).
// Simples de qualquer pessoa entender e evita a complexidade de um mapa
// livre para escolher uma posição num galpão pequeno/médio.
export function PosicaoSeletor({
  mapa,
  value,
  onChange,
  excludeId,
  label = "Posição",
}: {
  mapa: LogMapa;
  value: number | null;
  onChange: (id: number | null) => void;
  excludeId?: number | null;
  label?: string;
}) {
  const [rowId, setRowId] = useState<number | null>(null);
  const [aisleId, setAisleId] = useState<number | null>(null);
  const [rackId, setRackId] = useState<number | null>(null);
  const [sideId, setSideId] = useState<number | null>(null);

  const row = mapa.rows.find((r) => r.id === rowId);
  const aisle = row?.aisles.find((a) => a.id === aisleId);
  const rack = aisle?.racks.find((r) => r.id === rackId);
  const side = rack?.sides.find((s) => s.id === sideId);

  return (
    <div className="form-grid">
      <Field label="Fileira">
        <select
          value={rowId ?? ""}
          onChange={(e) => {
            setRowId(Number(e.target.value) || null);
            setAisleId(null);
            setRackId(null);
            setSideId(null);
            onChange(null);
          }}
        >
          <option value="">Selecione…</option>
          {mapa.rows
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Corredor">
        <select
          disabled={!row}
          value={aisleId ?? ""}
          onChange={(e) => {
            setAisleId(Number(e.target.value) || null);
            setRackId(null);
            setSideId(null);
            onChange(null);
          }}
        >
          <option value="">Selecione…</option>
          {(row?.aisles || [])
            .filter((a) => a.active)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Montante">
        <select
          disabled={!aisle}
          value={rackId ?? ""}
          onChange={(e) => {
            setRackId(Number(e.target.value) || null);
            setSideId(null);
            onChange(null);
          }}
        >
          <option value="">Selecione…</option>
          {(aisle?.racks || [])
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Lado">
        <select
          disabled={!rack}
          value={sideId ?? ""}
          onChange={(e) => {
            setSideId(Number(e.target.value) || null);
            onChange(null);
          }}
        >
          <option value="">Selecione…</option>
          {(rack?.sides || [])
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
        </select>
      </Field>
      <Field label={label}>
        <select disabled={!side} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value) || null)}>
          <option value="">Selecione…</option>
          {(side?.positions || [])
            .filter((p) => p.active && !p.blocked && p.id !== excludeId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
                {p.name ? ` - ${p.name}` : ""} · saldo {fmt(p.total_quantity)}
              </option>
            ))}
        </select>
      </Field>
    </div>
  );
}

// Busca de produto com resultados imediatos e Enter para selecionar o
// primeiro resultado.
export function ProdutoBusca({ onSelect, placeholder }: { onSelect: (p: LogProduto) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<LogProduto[]>([]);

  const buscar = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    const r = await api.get<{ produtos: LogProduto[] }>(`/api/logistica/produtos/busca?q=${encodeURIComponent(q)}`);
    setResultados(r.produtos);
  };

  const selecionar = (p: LogProduto) => {
    onSelect(p);
    setQuery("");
    setResultados([]);
  };

  return (
    <div className="part-search">
      <Search />
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados.length) {
            e.preventDefault();
            selecionar(resultados[0]);
          }
        }}
        placeholder={placeholder || "Digite o código ou nome do produto"}
      />
      {query && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onClick={() => selecionar(p)}>
              <span>
                <b>{p.code}</b> · {p.name}
              </span>
              <small>
                Saldo: {fmt(p.saldo_total)} {p.unit}
              </small>
            </button>
          ))}
          {!resultados.length && <p className="cart-empty">Nenhum produto encontrado.</p>}
        </div>
      )}
    </div>
  );
}

// Busca direta por identificador ou nome de posição (ex.: F01-C02-M05-A-P003),
// usada nos filtros de histórico e na busca do mapa.
export function PosicaoBusca({ onSelect, placeholder }: { onSelect: (p: PosicaoResultado) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PosicaoResultado[]>([]);

  const buscar = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    const r = await api.get<{ posicoes: PosicaoResultado[] }>(`/api/logistica/mapa/buscar?q=${encodeURIComponent(q)}`);
    setResultados(r.posicoes);
  };

  const selecionar = (p: PosicaoResultado) => {
    onSelect(p);
    setQuery("");
    setResultados([]);
  };

  return (
    <div className="part-search">
      <Search />
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados.length) {
            e.preventDefault();
            selecionar(resultados[0]);
          }
        }}
        placeholder={placeholder || "Digite o identificador da posição (ex.: F01-C02-M05-A-P003)"}
      />
      {query && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onClick={() => selecionar(p)}>
              <span>
                <b className="code">{p.code}</b>
              </span>
              <small>{p.name || "Sem nome"}</small>
            </button>
          ))}
          {!resultados.length && <p className="cart-empty">Nenhuma posição encontrada.</p>}
        </div>
      )}
    </div>
  );
}
