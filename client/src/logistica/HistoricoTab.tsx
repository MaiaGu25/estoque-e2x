import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { api } from "../api";
import type { LogHistoricoRegistro, LogMapa, LogProduto } from "../types";
import { dt, Empty, Field, fmt, Modal, TipoBadge } from "./ui";
import { PosicaoBusca, ProdutoBusca } from "./PosicaoSeletor";

type PosicaoResultado = { id: number; code: string; name: string };

const TIPOS = [
  ["", "Todos os tipos"],
  ["ENTRADA", "Entrada"],
  ["SAIDA", "Saída"],
  ["TRANSFERENCIA", "Transferência"],
  ["AJUSTE", "Ajuste"],
] as const;

export default function HistoricoTab({ refreshKey, mapa }: { refreshKey: number; mapa: LogMapa }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tipo, setTipo] = useState("");
  const [produto, setProduto] = useState<LogProduto | null>(null);
  const [posicao, setPosicao] = useState<PosicaoResultado | null>(null);
  const [responsavel, setResponsavel] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");

  const [page, setPage] = useState(1);
  const [registros, setRegistros] = useState<LogHistoricoRegistro[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [operacaoAberta, setOperacaoAberta] = useState<number | null>(null);

  const carregar = async (p = page) => {
    setCarregando(true);
    const params: Record<string, string> = { page: String(p), pageSize: "25" };
    if (from) params.from = from;
    if (to) params.to = to;
    if (tipo) params.type = tipo;
    if (produto) params.productId = String(produto.id);
    if (posicao) params.positionId = String(posicao.id);
    if (responsavel) params.responsavel = responsavel;
    if (motivo) params.motivo = motivo;
    if (busca) params.busca = busca;
    try {
      const r = await api.get<{ registros: LogHistoricoRegistro[]; total: number; totalPages: number }>(
        `/api/logistica/historico?${new URLSearchParams(params).toString()}`
      );
      setRegistros(r.registros);
      setTotal(r.total);
      setTotalPages(r.totalPages);
      setPage(p);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const limparFiltros = () => {
    setFrom("");
    setTo("");
    setTipo("");
    setProduto(null);
    setPosicao(null);
    setResponsavel("");
    setMotivo("");
    setBusca("");
  };

  return (
    <section>
      <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <div className="form-grid">
          <Field label="Data inicial">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Data final">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome do responsável" />
          </Field>
          <Field label="Motivo">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Compra, Avaria..." />
          </Field>
          <Field label="Busca (código, produto, operação...)">
            <div className="part-search" style={{ position: "static" }}>
              <Search />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar" />
            </div>
          </Field>
          <Field label="Produto">
            {produto ? (
              <div className="cart-row" style={{ gridTemplateColumns: "1fr 32px", padding: "8px 10px", border: "1px solid #d8e2dc", borderRadius: 9 }}>
                <span>
                  <b className="code">{produto.code}</b> {produto.name}
                </span>
                <button type="button" onClick={() => setProduto(null)}>
                  <X size={15} />
                </button>
              </div>
            ) : (
              <ProdutoBusca onSelect={setProduto} placeholder="Filtrar por produto" />
            )}
          </Field>
          <Field label="Posição">
            {posicao ? (
              <div className="cart-row" style={{ gridTemplateColumns: "1fr 32px", padding: "8px 10px", border: "1px solid #d8e2dc", borderRadius: 9 }}>
                <span>
                  <b className="code">{posicao.code}</b>
                </span>
                <button type="button" onClick={() => setPosicao(null)}>
                  <X size={15} />
                </button>
              </div>
            ) : (
              <PosicaoBusca onSelect={setPosicao} placeholder="Filtrar por posição" />
            )}
          </Field>
        </div>
        <div className="modal-actions" style={{ borderTop: "none", paddingTop: 4 }}>
          <button className="secondary" onClick={limparFiltros}>
            Limpar filtros
          </button>
          <button className="primary" onClick={() => carregar(1)} disabled={carregando}>
            <Search size={15} /> {carregando ? "Buscando…" : "Filtrar"}
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Tipo</th>
                <th>Código</th>
                <th>Produto</th>
                <th className="num">Quantidade</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Motivo</th>
                <th>Responsável</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setOperacaoAberta(r.operation_id)}>
                  <td>{dt(r.created_at)}</td>
                  <td>
                    <TipoBadge tipo={r.type} />
                  </td>
                  <td>
                    <b className="code">{r.product_code}</b>
                  </td>
                  <td>{r.product_name}</td>
                  <td className="num">
                    {fmt(r.quantity)} {r.unit}
                  </td>
                  <td>{r.from_position_code || "—"}</td>
                  <td>{r.to_position_code || "—"}</td>
                  <td>{r.reason}</td>
                  <td>{r.responsible}</td>
                  <td>{r.registered_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!registros.length && !carregando && <Empty text="Nenhuma movimentação encontrada com esses filtros." />}
        {totalPages > 1 && (
          <div className="pagination">
            <span>
              {total} registro{total === 1 ? "" : "s"} · Página {page} de {totalPages}
            </span>
            <button className="icon-btn" disabled={page <= 1} onClick={() => carregar(page - 1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" disabled={page >= totalPages} onClick={() => carregar(page + 1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {operacaoAberta && <DetalheOperacaoModal id={operacaoAberta} onClose={() => setOperacaoAberta(null)} mapa={mapa} />}
    </section>
  );
}

function DetalheOperacaoModal({ id, onClose }: { id: number; onClose: () => void; mapa: LogMapa }) {
  const [dados, setDados] = useState<{ operacao: any; movimentos: any[] } | null>(null);

  useEffect(() => {
    api.get<{ operacao: any; movimentos: any[] }>(`/api/logistica/historico/${id}`).then(setDados);
  }, [id]);

  if (!dados) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 160 }} />
      </Modal>
    );
  }

  const { operacao, movimentos } = dados;

  return (
    <Modal title={`Operação ${operacao.number}`} subtitle={dt(operacao.created_at)} onClose={onClose} wide>
      <div style={{ marginBottom: 14 }}>
        <TipoBadge tipo={operacao.type} />
      </div>
      <div className="detail-meta">
        <div>
          <span>Motivo</span>
          <b>{operacao.reason}</b>
        </div>
        <div>
          <span>Responsável</span>
          <b>{operacao.responsible}</b>
        </div>
        <div>
          <span>Registrado por</span>
          <b>{operacao.registered_by || "—"}</b>
        </div>
        <div>
          <span>Observação</span>
          <b>{operacao.notes || "—"}</b>
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Quantidade</th>
              <th>Origem</th>
              <th>Destino</th>
              <th className="num">Saldo total anterior</th>
              <th className="num">Saldo total posterior</th>
            </tr>
          </thead>
          <tbody>
            {movimentos.map((m) => (
              <tr key={m.id}>
                <td>
                  <b className="code">{m.product_code}</b>
                  <small>{m.product_name}</small>
                </td>
                <td className="num">
                  {fmt(m.quantity)} {m.unit}
                </td>
                <td>{m.from_position_code || "—"}</td>
                <td>{m.to_position_code || "—"}</td>
                <td className="num">{fmt(m.previous_total_quantity)}</td>
                <td className="num">{fmt(m.new_total_quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
