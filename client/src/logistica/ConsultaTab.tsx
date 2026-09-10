import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api } from "../api";
import type { LogProduto } from "../types";
import { Empty, fmt, Modal, SituacaoBadge } from "./ui";

type PosicaoOcupada = {
  position_id: number;
  position_code: string;
  position_name: string;
  shelf_number: number;
  side_code: string;
  side_name: string;
  rack_name: string;
  quantity: number;
};

// Consulta rápida pro vendedor: preço, saldo e onde o produto está, sem
// nenhum botão de editar ou cadastrar - só pra ter a informação na mão
// pra passar ao cliente.
export default function ConsultaTab({ refreshKey }: { refreshKey: number }) {
  const [produtos, setProdutos] = useState<LogProduto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [produtoAberto, setProdutoAberto] = useState<LogProduto | null>(null);

  const carregar = async () => {
    const params = new URLSearchParams({ status: "ativo" });
    if (busca) params.set("busca", busca);
    if (categoria) params.set("categoria", categoria);
    const r = await api.get<{ produtos: LogProduto[] }>(`/api/logistica/produtos?${params.toString()}`);
    setProdutos(r.produtos);
  };

  useEffect(() => {
    carregar();
    api
      .get<{ categorias: string[] }>("/api/logistica/produtos/categorias")
      .then((r) => setCategorias(r.categorias))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <section>
      <div className="filters">
        <div>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome ou categoria" onKeyDown={(e) => e.key === "Enter" && carregar()} />
        </div>
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
        <button className="primary" onClick={carregar}>
          <Search size={15} /> Filtrar
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th className="num">Preço</th>
              <th className="num">Saldo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id} onClick={() => setProdutoAberto(p)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{p.code}</b>
                </td>
                <td>
                  <strong>{p.name}</strong>
                  <small>{p.unit}</small>
                </td>
                <td>{p.category}</td>
                <td className="num">R$ {fmt(p.sale_price)}</td>
                <td className="num">{fmt(p.saldo_total)}</td>
                <td>
                  <SituacaoBadge situacao={p.situacao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!produtos.length && <Empty text="Nenhum produto encontrado." />}
      </div>

      {produtoAberto && <DetalheConsultaModal id={produtoAberto.id} onClose={() => setProdutoAberto(null)} />}
    </section>
  );
}

function DetalheConsultaModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [dados, setDados] = useState<{ produto: LogProduto; posicoes: PosicaoOcupada[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get<{ produto: LogProduto; posicoes: PosicaoOcupada[] }>(`/api/logistica/produtos/${id}`)
      .then(setDados)
      .catch((e) => setErr(e instanceof Error ? e.message : "Não foi possível carregar o produto."));
  }, [id]);

  if (!dados) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        {err ? <div className="error">{err}</div> : <div className="loading" style={{ minHeight: 160 }}><RefreshCw className="spin" /></div>}
      </Modal>
    );
  }

  const { produto, posicoes } = dados;

  return (
    <Modal
      title={`${produto.code} · ${produto.name}`}
      subtitle={`Categoria: ${produto.category} · Preço: R$ ${fmt(produto.sale_price)} · Saldo total: ${fmt(produto.saldo_total)} ${produto.unit}`}
      onClose={onClose}
    >
      {produto.notes && (
        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 14px" }}>
          {produto.notes}
        </p>
      )}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 8px" }}>
        Onde está guardado
      </p>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Posição</th>
              <th className="num">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {posicoes.map((p) => (
              <tr key={p.position_id}>
                <td>
                  <b className="code">{p.position_code}</b>
                  <small>
                    {p.rack_name} · {p.side_name} · Prateleira {p.shelf_number}
                  </small>
                </td>
                <td className="num">{fmt(p.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!posicoes.length && <Empty text="Esse produto não está em nenhuma posição no momento." />}
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
