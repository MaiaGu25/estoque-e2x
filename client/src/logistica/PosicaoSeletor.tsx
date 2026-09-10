import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogProduto } from "../types";
import { Empty, Field, fmt } from "./ui";

type PosicaoResultado = { id: number; code: string; name: string };

export type PosicaoEstoque = {
  position_id: number;
  position_code: string;
  position_name: string;
  side_code: string;
  side_name: string;
  rack_name: string;
  quantity: number;
};

// Mostra só onde o produto já está guardado (com o saldo de cada posição),
// pra escolher clicando - sem precisar saber de cor os códigos de montante,
// lado e prateleira. Se só tem um lugar, já seleciona sozinho. Usada na
// Saída/Ajuste (montante da posição a mexer) e no fechamento de orçamentos
// de venda (de onde tirar cada item vendido).
export function LocalizacaoAtual({
  produtoId,
  selecionadaId,
  onSelecionar,
  vazio,
}: {
  produtoId: number;
  selecionadaId: number | null;
  onSelecionar: (p: PosicaoEstoque) => void;
  vazio: string;
}) {
  const [posicoes, setPosicoes] = useState<PosicaoEstoque[] | null>(null);

  useEffect(() => {
    setPosicoes(null);
    api.get<{ posicoes: PosicaoEstoque[] }>(`/api/logistica/produtos/${produtoId}`).then((r) => {
      setPosicoes(r.posicoes);
      if (r.posicoes.length === 1) onSelecionar(r.posicoes[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  if (posicoes === null) return <p className="cart-empty">Carregando localização…</p>;
  if (!posicoes.length) return <Empty text={vazio} />;

  return (
    <div className="cart">
      {posicoes.map((p) => (
        <button
          key={p.position_id}
          className="cart-row"
          style={{
            gridTemplateColumns: "1fr auto",
            width: "100%",
            textAlign: "left",
            background: selecionadaId === p.position_id ? "#edf8f2" : undefined,
          }}
          onClick={() => onSelecionar(p)}
        >
          <span>
            <b>
              {p.rack_name} · {p.side_name} ({p.side_code})
            </b>
            <small>
              {p.position_code}
              {p.position_name ? ` - ${p.position_name}` : ""}
            </small>
          </span>
          <b>{fmt(p.quantity)}</b>
        </button>
      ))}
    </div>
  );
}

// Seletor em cascata (montante -> lado -> prateleira). Simples de qualquer
// pessoa entender, e as posições que dá pra escolher já vêm sempre dos
// montantes desenhados no mapa.
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
  const [rackId, setRackId] = useState<number | null>(null);
  const [sideId, setSideId] = useState<number | null>(null);

  const rack = mapa.racks.find((r) => r.id === rackId);
  const side = rack?.sides.find((s) => s.id === sideId);

  return (
    <div className="form-grid">
      <Field label="Montante">
        <select
          value={rackId ?? ""}
          onChange={(e) => {
            setRackId(Number(e.target.value) || null);
            setSideId(null);
            onChange(null);
          }}
        >
          <option value="">Selecione…</option>
          {mapa.racks
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.is_holding_area ? "📦 " : ""}
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

// Busca de produto com resultados imediatos, Enter para selecionar o
// primeiro resultado, e lista suspensa com sugestões assim que o campo é
// clicado (mesmo sem digitar nada).
export function ProdutoBusca({ onSelect, placeholder }: { onSelect: (p: LogProduto) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<LogProduto[]>([]);
  const [aberto, setAberto] = useState(false);

  const buscar = async (q: string) => {
    setQuery(q);
    const r = await api.get<{ produtos: LogProduto[] }>(`/api/logistica/produtos/busca?q=${encodeURIComponent(q)}`);
    setResultados(r.produtos);
  };

  const selecionar = (p: LogProduto) => {
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
        placeholder={placeholder || "Digite ou clique para ver os produtos"}
      />
      {aberto && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selecionar(p)}>
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

// Busca direta por identificador ou nome de posição (ex.: MA-A-P003),
// usada nos filtros de histórico e na busca do mapa - com a mesma lista
// suspensa ao clicar do ProdutoBusca acima.
export function PosicaoBusca({ onSelect, placeholder }: { onSelect: (p: PosicaoResultado) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PosicaoResultado[]>([]);
  const [aberto, setAberto] = useState(false);

  const buscar = async (q: string) => {
    setQuery(q);
    const r = await api.get<{ posicoes: PosicaoResultado[] }>(`/api/logistica/mapa/buscar?q=${encodeURIComponent(q)}`);
    setResultados(r.posicoes);
  };

  const selecionar = (p: PosicaoResultado) => {
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
        placeholder={placeholder || "Digite ou clique para ver as posições"}
      />
      {aberto && (
        <div className="results">
          {resultados.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selecionar(p)}>
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
