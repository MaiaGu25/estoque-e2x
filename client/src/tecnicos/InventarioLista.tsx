import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { TecInventarioDetalhe, TecInventarioItem } from "../types";
import { Empty } from "./ui";
import InventarioItemLinha from "./InventarioItemLinha";

type FiltroRapido = "todos" | "pendentes" | "divergencias";

// Busca, filtros e a lista de produtos pra contar. Também controla o
// "próximo produto": guarda uma referência de input por item e, quando
// uma linha confirma um valor com Enter, foca o campo do próximo item
// visível na lista atual (respeitando busca/filtro/ordem da tela).
export default function InventarioLista({
  inventarioId,
  itens,
  onMutated,
}: {
  inventarioId: number;
  itens: TecInventarioItem[];
  onMutated: (detalhe: TecInventarioDetalhe) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [filtro, setFiltro] = useState<FiltroRapido>("todos");
  const inputRefs = useRef(new Map<number, HTMLInputElement>());

  const categorias = useMemo(() => {
    const list: string[] = [];
    for (const i of itens) if (!list.includes(i.categoria)) list.push(i.categoria);
    return list;
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    let lista = itens;
    if (categoria) lista = lista.filter((i) => i.categoria === categoria);
    if (filtro === "pendentes") lista = lista.filter((i) => !i.contado);
    if (filtro === "divergencias") lista = lista.filter((i) => i.contado && i.diferenca !== 0);

    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter((i) => (i.categoria + " " + i.nome).toLowerCase().includes(termo));
      // produto com nome exatamente igual à busca aparece primeiro
      lista = [...lista].sort((a, b) => {
        const ea = a.nome.toLowerCase() === termo ? 0 : 1;
        const eb = b.nome.toLowerCase() === termo ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
    }
    return lista;
  }, [itens, categoria, filtro, busca]);

  const focusNext = (itemId: number) => {
    const idx = itensFiltrados.findIndex((i) => i.itemId === itemId);
    for (let n = idx + 1; n < itensFiltrados.length; n++) {
      const el = inputRefs.current.get(itensFiltrados[n].itemId);
      if (el) {
        el.focus();
        el.select?.();
        return;
      }
    }
  };

  const total = itens.length;
  const contados = itens.filter((i) => i.contado).length;
  const pendentes = total - contados;
  const divergencias = itens.filter((i) => i.contado && i.diferenca !== 0).length;
  const progresso = total ? Math.round((contados / total) * 100) : 0;

  return (
    <section>
      <div className="filters">
        <div style={{ flex: 1 }}>
          <label>Buscar</label>
          <div className="search">
            <Search />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código ou nome do produto" />
          </div>
        </div>
        {categorias.length > 1 && (
          <div>
            <label>Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label>Mostrar</label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroRapido)}>
            <option value="todos">Todos</option>
            <option value="pendentes">Só não contados</option>
            <option value="divergencias">Só com divergência</option>
          </select>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="stat">
          <div>
            <span>Progresso</span>
            <strong>{progresso}%</strong>
            <div className="bar" style={{ marginTop: 8 }}>
              <i style={{ width: `${progresso}%` }} />
            </div>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Total de produtos</span>
            <strong>{total}</strong>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Contados / pendentes</span>
            <strong>
              {contados} / {pendentes}
            </strong>
          </div>
        </div>
        <div className={divergencias ? "stat alert-stat" : "stat"}>
          <div>
            <span>Com divergência</span>
            <strong>{divergencias}</strong>
          </div>
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo atual</th>
              <th>Contagem</th>
              <th className="num">Diferença</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map((item) => (
              <InventarioItemLinha
                key={item.itemId}
                item={item}
                inventarioId={inventarioId}
                onMutated={onMutated}
                registerInputRef={(el) => {
                  if (el) inputRefs.current.set(item.itemId, el);
                  else inputRefs.current.delete(item.itemId);
                }}
                onFocusNext={() => focusNext(item.itemId)}
              />
            ))}
          </tbody>
        </table>
        {!itensFiltrados.length && <Empty text="Nenhum produto encontrado com esse filtro." />}
      </div>
    </section>
  );
}
