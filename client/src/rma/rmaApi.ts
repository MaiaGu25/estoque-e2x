import { api } from "../api";
import type {
  RmaBuscaEtiquetaResultado,
  RmaListaResposta,
  RmaOpcoesPorTipo,
  RmaProtocoloDetalhe,
  RmaTipoOpcao,
} from "./types";

export type RmaFiltros = {
  numeroProtocolo?: string;
  status?: string;
  canalCompra?: string;
  cpfCnpj?: string;
  numeroPedido?: string;
  numeroSistema?: string;
  numeroEnvio?: string;
  numeroReversa?: string;
  numeroRastreio?: string;
  cliente?: string;
  dataAberturaDe?: string;
  dataAberturaAte?: string;
  pagina?: number;
  porPagina?: number;
  ordenarPor?: string;
  ordem?: "asc" | "desc";
};

function query(filtros: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(chave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export const rmaApi = {
  opcoesAtivas: () => api.get<{ opcoes: RmaOpcoesPorTipo }>("/api/rma/opcoes-ativas"),

  listar: (filtros: RmaFiltros) => api.get<RmaListaResposta>(`/api/rma/protocolos${query(filtros)}`),
  detalhe: (id: number) => api.get<{ protocolo: RmaProtocoloDetalhe }>(`/api/rma/protocolos/${id}`),
  verificarDuplicidade: (dados: { numeroPedido?: string; numeroRastreio?: string; cpfCnpj?: string; excluirProtocoloId?: number }) =>
    api.post<{ duplicados: any[] }>("/api/rma/protocolos/verificar-duplicidade", dados),
  criar: (dados: unknown, cliente: unknown, confirmarDuplicidade = false) =>
    api.post<{ ok: true; protocolo: RmaProtocoloDetalhe }>("/api/rma/protocolos", { dados, cliente, confirmarDuplicidade }),
  atualizar: (id: number, dados: unknown) => api.patch<{ ok: true; protocolo: RmaProtocoloDetalhe }>(`/api/rma/protocolos/${id}`, dados),
  atualizarCliente: (id: number, dados: unknown) => api.patch<{ ok: true; protocolo: RmaProtocoloDetalhe }>(`/api/rma/protocolos/${id}/cliente`, dados),
  adicionarNota: (id: number, texto: string, foto?: string | null) =>
    api.post<{ ok: true; protocolo: RmaProtocoloDetalhe }>(`/api/rma/protocolos/${id}/nota`, { texto, foto }),

  adicionarProduto: (id: number, dados: unknown) => api.post<{ ok: true; produto: any }>(`/api/rma/protocolos/${id}/produtos`, dados),
  editarProduto: (produtoId: number, dados: unknown) => api.patch<{ ok: true; produto: any }>(`/api/rma/protocolos/produtos/${produtoId}`, dados),
  removerProduto: (produtoId: number) => api.del<{ ok: true }>(`/api/rma/protocolos/produtos/${produtoId}`),
  buscarReferenciaEstoque: (termo: string) => api.get<{ resultados: { code: string; name: string }[] }>(`/api/rma/protocolos/produtos/referencia-estoque?termo=${encodeURIComponent(termo)}`),

  salvarSolucao: (id: number, dados: unknown) => api.patch<{ ok: true; solucao: any }>(`/api/rma/protocolos/${id}/solucao`, dados),

  buscarEtiqueta: (numero: string) => api.post<RmaBuscaEtiquetaResultado>("/api/rma/etiqueta/buscar", { numero }),
  confirmarRecebimento: (protocoloId: number, novoStatus: string, numeroPesquisado: string, campoCorrespondido: string) =>
    api.post<{ ok: true; protocolo: RmaProtocoloDetalhe }>(`/api/rma/etiqueta/${protocoloId}/confirmar`, { novoStatus, numeroPesquisado, campoCorrespondido }),

  importarPreVisualizar: (arquivoBase64: string) =>
    api.post<{ total: number; validas: number; invalidas: any[]; linhas: any[] }>("/api/rma/excel/importar/pre-visualizar", { arquivo: arquivoBase64 }),
  importarConfirmar: (arquivoBase64: string) => api.post<{ ok: true; criados: string[] }>("/api/rma/excel/importar/confirmar", { arquivo: arquivoBase64 }),

  // Administração das listas configuráveis (admin only no backend)
  listarOpcoesAdmin: () => api.get<{ opcoes: RmaOpcoesPorTipo }>("/api/rma/opcoes"),
  criarOpcao: (tipo: RmaTipoOpcao, rotulo: string, cor: string) => api.post<{ ok: true; opcao: any }>(`/api/rma/opcoes/${tipo}`, { rotulo, cor }),
  editarOpcao: (id: number, dados: { rotulo?: string; cor?: string }) => api.patch<{ ok: true; opcao: any }>(`/api/rma/opcoes/item/${id}`, dados),
  definirAtivaOpcao: (id: number, ativo: boolean) => api.patch<{ ok: true; opcao: any }>(`/api/rma/opcoes/item/${id}`, { ativo }),
  reordenarOpcoes: (tipo: RmaTipoOpcao, ids: number[]) => api.post<{ ok: true }>(`/api/rma/opcoes/${tipo}/reordenar`, { ids }),
};
