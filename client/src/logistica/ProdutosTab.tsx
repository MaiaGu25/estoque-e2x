import { useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { api } from "../api";
import type { LogHistoricoRegistro, LogProduto } from "../types";
import { dt, Empty, Field, fmt, Modal, SituacaoBadge } from "./ui";

export default function ProdutosTab({
  refreshKey,
  isAdmin,
  onAtualizado,
}: {
  refreshKey: number;
  isAdmin: boolean;
  onAtualizado: () => void;
}) {
  const [produtos, setProdutos] = useState<LogProduto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState("ativo");
  const [modalNovo, setModalNovo] = useState(false);
  const [produtoAberto, setProdutoAberto] = useState<LogProduto | null>(null);

  const filtros = () => {
    const params: Record<string, string> = { status };
    if (busca) params.busca = busca;
    if (categoria) params.categoria = categoria;
    return params;
  };

  const carregar = async () => {
    const params = new URLSearchParams(filtros());
    const r = await api.get<{ produtos: LogProduto[] }>(`/api/logistica/produtos?${params.toString()}`);
    setProdutos(r.produtos);
  };

  useEffect(() => {
    carregar();
    api.get<{ categorias: string[] }>("/api/logistica/produtos/categorias").then((r) => setCategorias(r.categorias)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <section>
      <div className="filters">
        <div>
          <label>Buscar</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome ou categoria" />
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
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <button className="primary" onClick={carregar}>
          <Search size={15} /> Filtrar
        </button>
        <button className="secondary" onClick={() => setModalNovo(true)}>
          <Plus size={16} /> Novo produto
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th className="num">Saldo total</th>
              <th>Situação</th>
              <th></th>
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
                <td className="num">{fmt(p.saldo_total)}</td>
                <td>
                  <SituacaoBadge situacao={p.situacao} />
                </td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!produtos.length && <Empty text="Nenhum produto encontrado." />}
      </div>

      {modalNovo && (
        <NovoProdutoModal
          onClose={() => setModalNovo(false)}
          onSaved={() => {
            setModalNovo(false);
            carregar();
            onAtualizado();
          }}
        />
      )}
      {produtoAberto && (
        <DetalheProdutoModal
          id={produtoAberto.id}
          isAdmin={isAdmin}
          onClose={() => setProdutoAberto(null)}
          onAtualizado={() => {
            carregar();
            onAtualizado();
          }}
        />
      )}
    </section>
  );
}

function NovoProdutoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ code: "", name: "", description: "", category: "", unit: "UN", minimumStock: 0, notes: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!v.code.trim() || !v.name.trim()) return setErr("Código e nome são obrigatórios.");
    setSaving(true);
    setErr("");
    try {
      await api.post("/api/logistica/produtos", v);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo produto de Logística" subtitle="Cadastre o produto antes de movimentar no galpão." onClose={onClose}>
      <div className="form-grid">
        <Field label="Código *">
          <input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder="Ex.: 0007" />
        </Field>
        <Field label="Nome *">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Categoria">
          <input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Ex.: Embalagem" />
        </Field>
        <Field label="Unidade">
          <input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} />
        </Field>
        <Field label="Estoque mínimo">
          <input type="number" min="0" value={v.minimumStock} onChange={(e) => setV({ ...v, minimumStock: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="Observação">
        <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Cadastrando…" : "Cadastrar produto"}
        </button>
      </div>
    </Modal>
  );
}

function DetalheProdutoModal({
  id,
  isAdmin,
  onClose,
  onAtualizado,
}: {
  id: number;
  isAdmin: boolean;
  onClose: () => void;
  onAtualizado: () => void;
}) {
  const [dados, setDados] = useState<{ produto: LogProduto; posicoes: any[]; movimentacoes: LogHistoricoRegistro[] } | null>(null);
  const [editando, setEditando] = useState(false);
  const [err, setErr] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get<{ produto: LogProduto; posicoes: any[]; movimentacoes: LogHistoricoRegistro[] }>(`/api/logistica/produtos/${id}`);
      setDados(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o produto.");
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const salvarCampo = async (patch: Record<string, unknown>) => {
    setSalvando(true);
    try {
      await api.patch(`/api/logistica/produtos/${id}`, patch);
      await carregar();
      onAtualizado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (!dados) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  const { produto, posicoes, movimentacoes } = dados;

  return (
    <Modal title={`${produto.code} · ${produto.name}`} subtitle={`Categoria: ${produto.category} · Saldo total: ${fmt(produto.saldo_total)} ${produto.unit}`} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <SituacaoBadge situacao={produto.situacao} />
        {isAdmin && (
          <button className="secondary" onClick={() => setEditando((x) => !x)}>
            <Pencil size={14} /> {editando ? "Fechar edição" : "Editar"}
          </button>
        )}
        {isAdmin && (
          <button className="secondary" onClick={() => salvarCampo({ active: !produto.active })} disabled={salvando}>
            {produto.active ? "Inativar" : "Ativar"}
          </button>
        )}
      </div>

      {editando && isAdmin && (
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <Field label="Nome">
            <input defaultValue={produto.name} onBlur={(e) => e.target.value !== produto.name && salvarCampo({ name: e.target.value })} />
          </Field>
          <Field label="Categoria">
            <input defaultValue={produto.category} onBlur={(e) => e.target.value !== produto.category && salvarCampo({ category: e.target.value })} />
          </Field>
          <Field label="Unidade">
            <input defaultValue={produto.unit} onBlur={(e) => e.target.value !== produto.unit && salvarCampo({ unit: e.target.value })} />
          </Field>
          <Field label="Estoque mínimo">
            <input
              type="number"
              defaultValue={produto.minimum_stock}
              onBlur={(e) => Number(e.target.value) !== produto.minimum_stock && salvarCampo({ minimumStock: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}

      {err && <div className="error">{err}</div>}

      <div className="grid-two">
        <div>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 8px" }}>
            Posições ocupadas
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
                {posicoes.map((p: any) => (
                  <tr key={p.position_id}>
                    <td>
                      <b className="code">{p.position_code}</b>
                      <small>
                        {p.row_name} · {p.aisle_name} · {p.rack_name}
                      </small>
                    </td>
                    <td className="num">{fmt(p.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!posicoes.length && <Empty text="Esse produto não está em nenhuma posição no momento." />}
          </div>
        </div>
        <div>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 8px" }}>
            Últimas movimentações
          </p>
          <div className="table-wrap" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th className="num">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m: any) => (
                  <tr key={m.id}>
                    <td>{dt(m.created_at)}</td>
                    <td>{m.type}</td>
                    <td className="num">{fmt(m.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!movimentacoes.length && <Empty text="Nenhuma movimentação ainda." />}
          </div>
        </div>
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
