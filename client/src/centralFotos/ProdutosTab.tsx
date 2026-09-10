import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { CfFiltroFoto, CfFiltroStatus, CfListaProdutos } from "./types";
import { centralFotosApi } from "./api";
import { Empty, Field, Modal, PlaceholderFoto } from "./ui";
import ProdutoDetalhe from "./ProdutoDetalhe";

export default function ProdutosTab({ isAdmin, refreshKey, onAlterado }: { isAdmin: boolean; refreshKey: number; onAlterado: () => void }) {
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<CfFiltroStatus>("todos");
  const [foto, setFoto] = useState<CfFiltroFoto>("todos");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<CfListaProdutos | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [modalNovo, setModalNovo] = useState(false);
  const [produtoAberto, setProdutoAberto] = useState<number | null>(null);

  // Pesquisa enquanto digita, com um pequeno atraso pra não disparar uma
  // requisição a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(buscaInput);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaInput]);

  const carregar = async () => {
    const r = await centralFotosApi.listarProdutos({ busca, categoria, status, foto, pagina });
    setDados(r);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, categoria, status, foto, pagina, refreshKey]);

  useEffect(() => {
    centralFotosApi
      .listarCategorias()
      .then((r) => setCategorias(r.categorias))
      .catch(() => {});
  }, [refreshKey]);

  return (
    <section>
      <div className="filters">
        <div style={{ flex: 1 }}>
          <label>Buscar</label>
          <div className="search">
            <Search />
            <input value={buscaInput} onChange={(e) => setBuscaInput(e.target.value)} placeholder="SKU, nome ou categoria" />
          </div>
        </div>
        {categorias.length > 0 && (
          <div>
            <label>Categoria</label>
            <select
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setPagina(1);
              }}
            >
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
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CfFiltroStatus);
              setPagina(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>
        <div>
          <label>Fotos</label>
          <select
            value={foto}
            onChange={(e) => {
              setFoto(e.target.value as CfFiltroFoto);
              setPagina(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="com_principal">Com foto principal</option>
            <option value="sem_principal">Sem foto principal</option>
            <option value="com_adicionais">Com fotos adicionais</option>
          </select>
        </div>
        {isAdmin && (
          <button className="primary" onClick={() => setModalNovo(true)}>
            <Plus size={17} /> Novo produto
          </button>
        )}
      </div>

      <div className="order-grid">
        {(dados?.produtos || []).map((p) => (
          <button key={p.id} className="order-card cf-produto-card" onClick={() => setProdutoAberto(p.id)}>
            <div className="cf-produto-thumb">
              {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt={p.nome} /> : <PlaceholderFoto tamanho={72} />}
            </div>
            <div>
              <b className="code">{p.sku}</b>
              <h3 style={{ margin: "8px 0 4px" }}>{p.nome}</h3>
              <p>{p.categoria || "Sem categoria"}</p>
            </div>
            <footer>
              <span>
                {p.qtdFotos} foto{p.qtdFotos === 1 ? "" : "s"}
              </span>
              <span className={`status ${p.ativo ? "ok" : "warn"}`}>{p.ativo ? "Ativo" : "Inativo"}</span>
            </footer>
          </button>
        ))}
      </div>
      {!dados?.produtos.length && <Empty text="Nenhum produto encontrado com esse filtro." />}

      {dados && dados.totalPaginas > 1 && (
        <div className="pagination">
          <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>
            Página {dados.pagina} de {dados.totalPaginas} · {dados.total} produtos
          </span>
          <button disabled={pagina >= dados.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}

      {modalNovo && (
        <NovoProdutoModal
          onClose={() => setModalNovo(false)}
          onCriado={(id) => {
            setModalNovo(false);
            carregar();
            onAlterado();
            setProdutoAberto(id);
          }}
        />
      )}
      {produtoAberto !== null && (
        <ProdutoDetalhe
          produtoId={produtoAberto}
          isAdmin={isAdmin}
          onClose={() => setProdutoAberto(null)}
          onAlterado={() => {
            carregar();
            onAlterado();
          }}
        />
      )}
    </section>
  );
}

function NovoProdutoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: number) => void }) {
  const [sku, setSku] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setErr("");
    if (!sku.trim()) return setErr("Informe o SKU do produto.");
    if (!nome.trim()) return setErr("Informe o nome do produto.");
    setSaving(true);
    try {
      const produto = await centralFotosApi.criarProduto({ sku, nome, categoria, descricao });
      onCriado(produto.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cadastrar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo produto" subtitle="Cadastre o SKU primeiro - as fotos são adicionadas na tela seguinte." onClose={onClose}>
      <Field label="SKU *">
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: 000123" autoFocus />
      </Field>
      <Field label="Nome *">
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field label="Categoria">
        <input value={categoria} onChange={(e) => setCategoria(e.target.value)} />
      </Field>
      <Field label="Descrição">
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={salvar}>
          {saving ? "Cadastrando…" : "Cadastrar e continuar"}
        </button>
      </div>
    </Modal>
  );
}
