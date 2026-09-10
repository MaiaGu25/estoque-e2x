import { api } from "../api";
import type { CfDiagnostico, CfFiltroFoto, CfFiltroStatus, CfListaProdutos, CfProdutoDetalhe, CfVisaoGeral } from "./types";

const BASE = "/api/central-fotos";

export const centralFotosApi = {
  listarProdutos: (params: { busca?: string; categoria?: string; status?: CfFiltroStatus; foto?: CfFiltroFoto; pagina?: number }) => {
    const qs = new URLSearchParams();
    if (params.busca) qs.set("busca", params.busca);
    if (params.categoria) qs.set("categoria", params.categoria);
    if (params.status && params.status !== "todos") qs.set("status", params.status);
    if (params.foto && params.foto !== "todos") qs.set("foto", params.foto);
    if (params.pagina) qs.set("pagina", String(params.pagina));
    return api.get<CfListaProdutos>(`${BASE}/produtos?${qs.toString()}`);
  },

  listarCategorias: () => api.get<{ categorias: string[] }>(`${BASE}/produtos/categorias`),

  criarProduto: (payload: { sku: string; nome: string; descricao?: string; categoria?: string; observacao?: string }) =>
    api.post<CfProdutoDetalhe>(`${BASE}/produtos`, payload),

  buscarProduto: (id: number) => api.get<CfProdutoDetalhe>(`${BASE}/produtos/${id}`),

  atualizarProduto: (id: number, payload: Record<string, unknown>) => api.patch<CfProdutoDetalhe>(`${BASE}/produtos/${id}`, payload),

  enviarImagem: (produtoId: number, payload: { nomeOriginal: string; dataUrl: string; forcarDuplicata?: boolean }) =>
    api.post<CfProdutoDetalhe>(`${BASE}/produtos/${produtoId}/imagens`, payload),

  definirPrincipal: (produtoId: number, imagemId: number) => api.post<CfProdutoDetalhe>(`${BASE}/produtos/${produtoId}/imagens/${imagemId}/principal`),

  reordenarImagens: (produtoId: number, ordem: number[]) => api.post<CfProdutoDetalhe>(`${BASE}/produtos/${produtoId}/imagens/ordem`, { ordem }),

  excluirImagem: (produtoId: number, imagemId: number, novaPrincipalId?: number) =>
    api.del<CfProdutoDetalhe>(`${BASE}/produtos/${produtoId}/imagens/${imagemId}`, novaPrincipalId ? { novaPrincipalId } : {}),

  restaurarImagem: (produtoId: number, imagemId: number) => api.post<CfProdutoDetalhe>(`${BASE}/produtos/${produtoId}/imagens/${imagemId}/restaurar`),

  visaoGeral: () => api.get<CfVisaoGeral>(`${BASE}/visao-geral`),

  diagnostico: () => api.get<CfDiagnostico>(`${BASE}/manutencao/diagnostico`),

  limparLixeira: () => api.post<{ removidas: number }>(`${BASE}/manutencao/limpar-lixeira`),
};
