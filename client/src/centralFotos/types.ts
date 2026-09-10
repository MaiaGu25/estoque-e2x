// Tipos próprios do módulo, separados do types.ts principal de propósito -
// a Central de Fotos é um módulo isolado, com banco e API próprios.

export type CfImagem = {
  id: number;
  principal: boolean;
  ordem: number;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  tamanhoOtimizadaBytes: number;
  tamanhoMiniaturaBytes: number;
  largura: number | null;
  altura: number | null;
  status: "ativa" | "excluida";
  excluidaEm: string | null;
  excluidaPorNome: string;
  createdByNome: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string;
  optimizedUrl: string;
  originalUrl: string;
};

export type CfProdutoResumo = {
  id: number;
  sku: string;
  nome: string;
  categoria: string;
  ativo: boolean;
  qtdFotos: number;
  temPrincipal: boolean;
  thumbnailUrl: string | null;
  updatedAt: string;
};

export type CfProdutoDetalhe = {
  id: number;
  sku: string;
  nome: string;
  descricao: string;
  categoria: string;
  observacao: string;
  ativo: boolean;
  createdByNome: string;
  updatedByNome: string;
  createdAt: string;
  updatedAt: string;
  imagens: CfImagem[];
  imagensExcluidas: CfImagem[];
  tamanhoTotalBytes: number;
  limiteFotos: number;
  diasRetencaoLixeira: number;
};

export type CfListaProdutos = {
  produtos: CfProdutoResumo[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
};

export type CfVisaoGeral = {
  produtosCadastrados: number;
  produtosComFoto: number;
  produtosSemFoto: number;
  totalImagens: number;
  espacoOriginaisBytes: number;
  espacoOtimizadasBytes: number;
  espacoMiniaturasBytes: number;
  ultimosEnvios: {
    imagemId: number;
    nomeOriginal: string;
    sku: string;
    produtoNome: string;
    criadoPor: string;
    createdAt: string;
  }[];
};

export type CfDiagnostico = {
  imagensSemArquivoOriginal: number[];
  imagensSemOtimizada: number[];
  imagensSemMiniatura: number[];
  hashesDuplicados: string[];
  arquivosOrfaos: { original: string[]; otimizada: string[]; miniatura: string[] };
};

export type CfFiltroStatus = "todos" | "ativos" | "inativos";
export type CfFiltroFoto = "todos" | "com_principal" | "sem_principal" | "com_adicionais";
