import { useEffect, useState } from "react";
import { Copy, Download, RefreshCw, RotateCcw, Star, Trash2, TriangleAlert, X } from "lucide-react";
import type { CfImagem, CfProdutoDetalhe } from "./types";
import { centralFotosApi } from "./api";
import { dt, Empty, Field, fmtBytes, Modal, PlaceholderFoto } from "./ui";
import UploadFotos from "./UploadFotos";

export default function ProdutoDetalhe({
  produtoId,
  isAdmin,
  onClose,
  onAlterado,
}: {
  produtoId: number;
  isAdmin: boolean;
  onClose: () => void;
  onAlterado: () => void;
}) {
  const [produto, setProduto] = useState<CfProdutoDetalhe | null>(null);
  const [err, setErr] = useState("");
  const [ampliada, setAmpliada] = useState<CfImagem | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<CfImagem | null>(null);
  const [arrastandoId, setArrastandoId] = useState<number | null>(null);

  const carregar = async () => {
    try {
      setProduto(await centralFotosApi.buscarProduto(produtoId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível carregar o produto.");
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId]);

  const recarregarEAvisar = async () => {
    await carregar();
    onAlterado();
  };

  if (err && !produto) {
    return (
      <Modal title="Produto" onClose={onClose}>
        <div className="error">{err}</div>
      </Modal>
    );
  }
  if (!produto) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        <div className="loading" style={{ minHeight: 200 }}>
          <RefreshCw className="spin" />
        </div>
      </Modal>
    );
  }

  const principal = produto.imagens.find((i) => i.principal) || null;
  const adicionais = produto.imagens.filter((i) => !i.principal);

  const definirPrincipal = async (imagemId: number) => {
    await centralFotosApi.definirPrincipal(produtoId, imagemId);
    await recarregarEAvisar();
  };

  const excluir = async (imagem: CfImagem, novaPrincipalId?: number) => {
    await centralFotosApi.excluirImagem(produtoId, imagem.id, novaPrincipalId);
    setConfirmarExclusao(null);
    await recarregarEAvisar();
  };

  const restaurar = async (imagemId: number) => {
    await centralFotosApi.restaurarImagem(produtoId, imagemId);
    await recarregarEAvisar();
  };

  const soltarEmCimaDe = async (destinoId: number) => {
    if (arrastandoId === null || arrastandoId === destinoId) return;
    const ordemAtual = produto.imagens.map((i) => i.id);
    const origem = ordemAtual.indexOf(arrastandoId);
    const destino = ordemAtual.indexOf(destinoId);
    if (origem === -1 || destino === -1) return;
    const novaOrdem = [...ordemAtual];
    novaOrdem.splice(origem, 1);
    novaOrdem.splice(destino, 0, arrastandoId);
    setArrastandoId(null);
    await centralFotosApi.reordenarImagens(produtoId, novaOrdem);
    await carregar();
  };

  return (
    <>
      <Modal
        title={`${produto.sku} · ${produto.nome}`}
        subtitle={`${produto.imagens.length} foto${produto.imagens.length === 1 ? "" : "s"} · ${fmtBytes(produto.tamanhoTotalBytes)} · atualizado em ${dt(produto.updatedAt)}`}
        onClose={onClose}
        wide
      >
        <CamposProduto produto={produto} isAdmin={isAdmin} onSalvo={recarregarEAvisar} />

        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "18px 0 8px" }}>
          Foto principal
        </p>
        <div className="cf-principal-wrap">
          {principal ? (
            <img className="cf-principal-img" src={principal.optimizedUrl} alt={produto.nome} onClick={() => setAmpliada(principal)} />
          ) : (
            <PlaceholderFoto tamanho={180} />
          )}
        </div>

        {isAdmin && (
          <>
            <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "18px 0 8px" }}>
              Adicionar fotos
            </p>
            <UploadFotos produtoId={produtoId} vagasRestantes={Math.max(produto.limiteFotos - produto.imagens.length, 0)} onEnviado={recarregarEAvisar} />
          </>
        )}

        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "18px 0 8px" }}>
          Fotos adicionais {isAdmin && adicionais.length > 1 ? "(arraste para reordenar)" : ""}
        </p>
        <div className="cf-galeria-grid">
          {adicionais.map((img) => (
            <div
              key={img.id}
              className="cf-galeria-item"
              draggable={isAdmin}
              onDragStart={() => setArrastandoId(img.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltarEmCimaDe(img.id)}
            >
              <img src={img.thumbnailUrl} alt={img.nomeOriginal} onClick={() => setAmpliada(img)} />
              {isAdmin && (
                <div className="cf-galeria-acoes">
                  <button title="Definir como principal" onClick={() => definirPrincipal(img.id)}>
                    <Star size={14} />
                  </button>
                  <button title="Excluir" onClick={() => setConfirmarExclusao(img)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {!adicionais.length && !principal && <Empty text="Nenhuma foto enviada ainda." />}
        </div>

        {isAdmin && produto.imagensExcluidas.length > 0 && (
          <LixeiraProduto imagens={produto.imagensExcluidas} diasRetencao={produto.diasRetencaoLixeira} onRestaurar={restaurar} />
        )}

        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </Modal>

      {ampliada && <VisualizarImagemModal imagem={ampliada} isAdmin={isAdmin} onClose={() => setAmpliada(null)} />}

      {confirmarExclusao && (
        <ExcluirImagemModal
          imagem={confirmarExclusao}
          outrasAtivas={produto.imagens.filter((i) => i.id !== confirmarExclusao.id)}
          onConfirmar={(novaPrincipalId) => excluir(confirmarExclusao, novaPrincipalId)}
          onClose={() => setConfirmarExclusao(null)}
        />
      )}
    </>
  );
}

function CamposProduto({ produto, isAdmin, onSalvo }: { produto: CfProdutoDetalhe; isAdmin: boolean; onSalvo: () => void }) {
  const [erro, setErro] = useState("");

  const salvar = async (patch: Record<string, unknown>) => {
    setErro("");
    try {
      await centralFotosApi.atualizarProduto(produto.id, patch);
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const trocarSku = (valor: string) => {
    const novoSku = valor.trim();
    if (!novoSku || novoSku === produto.sku) return;
    const confirmado = confirm(
      `Trocar o SKU de "${produto.sku}" para "${novoSku}"? As fotos continuam vinculadas normalmente (a referência interna usa o ID do produto), e essa troca fica registrada na auditoria.`
    );
    if (confirmado) salvar({ sku: novoSku });
  };

  return (
    <>
      <div className="form-grid">
        <Field label="SKU">
          <input key={produto.sku} defaultValue={produto.sku} disabled={!isAdmin} onBlur={(e) => trocarSku(e.target.value)} />
        </Field>
        <Field label="Nome">
          <input
            key={produto.nome}
            defaultValue={produto.nome}
            disabled={!isAdmin}
            onBlur={(e) => e.target.value.trim() && e.target.value !== produto.nome && salvar({ nome: e.target.value })}
          />
        </Field>
        <Field label="Categoria">
          <input
            key={produto.categoria}
            defaultValue={produto.categoria}
            disabled={!isAdmin}
            onBlur={(e) => e.target.value !== produto.categoria && salvar({ categoria: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea
          key={produto.descricao}
          defaultValue={produto.descricao}
          disabled={!isAdmin}
          onBlur={(e) => e.target.value !== produto.descricao && salvar({ descricao: e.target.value })}
        />
      </Field>
      <Field label="Observação">
        <textarea
          key={produto.observacao}
          defaultValue={produto.observacao}
          disabled={!isAdmin}
          onBlur={(e) => e.target.value !== produto.observacao && salvar({ observacao: e.target.value })}
        />
      </Field>
      {isAdmin && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13 }}>
          <input type="checkbox" checked={produto.ativo} onChange={(e) => salvar({ ativo: e.target.checked })} />
          Produto ativo
        </label>
      )}
      {erro && <div className="error">{erro}</div>}
    </>
  );
}

function LixeiraProduto({ imagens, diasRetencao, onRestaurar }: { imagens: CfImagem[]; diasRetencao: number; onRestaurar: (id: number) => void }) {
  return (
    <>
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "18px 0 8px" }}>
        Lixeira (recuperável por {diasRetencao} dias após a exclusão)
      </p>
      <div className="cart" style={{ marginBottom: 16 }}>
        {imagens.map((img) => (
          <div className="cart-row" key={img.id} style={{ gridTemplateColumns: "40px 1fr auto", alignItems: "center" }}>
            <img src={img.thumbnailUrl} alt={img.nomeOriginal} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} />
            <span>
              <b>{img.nomeOriginal || "Sem nome"}</b>
              <small>
                excluída em {dt(img.excluidaEm || "")} por {img.excluidaPorNome}
              </small>
            </span>
            <button className="secondary" onClick={() => onRestaurar(img.id)}>
              <RotateCcw size={14} /> Restaurar
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function ExcluirImagemModal({
  imagem,
  outrasAtivas,
  onConfirmar,
  onClose,
}: {
  imagem: CfImagem;
  outrasAtivas: CfImagem[];
  onConfirmar: (novaPrincipalId?: number) => void;
  onClose: () => void;
}) {
  const [novaPrincipalId, setNovaPrincipalId] = useState<number | "">("");

  return (
    <Modal title="Excluir foto" subtitle="A foto vai para a lixeira e pode ser recuperada dentro do prazo configurado." onClose={onClose}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <TriangleAlert size={18} color="#b83224" />
        <span>Tem certeza que quer excluir "{imagem.nomeOriginal || "essa foto"}"?</span>
      </div>
      {imagem.principal && outrasAtivas.length > 0 && (
        <Field label="Escolher a nova foto principal (opcional - se não escolher, a próxima da lista assume automaticamente)">
          <select value={novaPrincipalId} onChange={(e) => setNovaPrincipalId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Escolher automaticamente</option>
            {outrasAtivas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nomeOriginal || `Foto #${i.id}`}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" onClick={() => onConfirmar(novaPrincipalId || undefined)}>
          <Trash2 size={15} /> Excluir
        </button>
      </div>
    </Modal>
  );
}

function VisualizarImagemModal({ imagem, isAdmin, onClose }: { imagem: CfImagem; isAdmin: boolean; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);

  const copiarEndereco = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + imagem.optimizedUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard pode não estar disponível (http sem contexto seguro) - sem problema, só não copia
    }
  };

  return (
    <Modal title={imagem.nomeOriginal || "Foto"} subtitle={`${imagem.largura ?? "?"} × ${imagem.altura ?? "?"}px · ${fmtBytes(imagem.tamanhoBytes)} · enviada por ${imagem.createdByNome}`} onClose={onClose} wide>
      <div className="cf-ampliada-wrap">
        <img src={imagem.optimizedUrl} alt={imagem.nomeOriginal} />
      </div>
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="secondary" onClick={copiarEndereco}>
          <Copy size={15} /> {copiado ? "Endereço copiado!" : "Copiar endereço"}
        </button>
        {isAdmin && (
          <a className="secondary" href={imagem.originalUrl} download style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Download size={15} /> Baixar original
          </a>
        )}
        <button className="primary" onClick={onClose}>
          <X size={15} /> Fechar
        </button>
      </div>
    </Modal>
  );
}
