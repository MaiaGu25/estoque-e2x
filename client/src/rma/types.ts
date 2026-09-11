export type RmaTipoOpcao =
  | "status"
  | "status_secundario"
  | "canal_compra"
  | "modalidade_envio"
  | "canal_contato"
  | "motivo_produto"
  | "estado_embalagem"
  | "tipo_solucao";

export type RmaOpcao = {
  id: number;
  tipo: RmaTipoOpcao;
  valor: string;
  rotulo: string;
  cor: string;
  ordem: number;
  ativo: number;
  created_at: string;
  updated_at: string;
};

export type RmaOpcoesPorTipo = Record<RmaTipoOpcao, RmaOpcao[]>;

export type RmaCliente = {
  id: number;
  nome: string;
  cpf_cnpj: string;
  cpf_cnpj_normalizado: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numero_endereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  created_at: string;
  updated_at: string;
};

export type RmaProtocolo = {
  id: number;
  numero_protocolo: string;
  status: string;
  status_secundario: string | null;
  cliente_id: number;
  cliente_nome?: string;
  cliente_cpf_cnpj?: string;
  canal_contato: string;
  canal_compra: string;
  modalidade_envio: string;
  numero_pedido: string;
  numero_sistema: string;
  numero_envio: string;
  numero_reversa: string;
  numero_rastreio: string;
  data_compra: string | null;
  valor_compra: number | null;
  descricao_reclamacao: string;
  data_abertura: string;
  data_recebimento: string | null;
  responsavel_recebimento_id: number | null;
  data_solucao: string | null;
  data_encerramento: string | null;
  observacoes_gerais: string;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
};

export type RmaProduto = {
  id: number;
  protocolo_id: number;
  codigo_sku: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
  motivo: string;
  estado_embalagem: string;
  defeito_relatado: string;
  defeito_confirmado: string;
  numero_serial: string;
  observacao: string;
  created_at: string;
  updated_at: string;
};

export type RmaSolucao = {
  id: number;
  protocolo_id: number;
  tipo_solucao: string;
  descricao: string;
  valor_reembolso: number | null;
  peca_enviada: string;
  created_at: string;
  updated_at: string;
} | null;

export type RmaHistoricoItem = {
  id: number;
  protocolo_id: number;
  acao: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  user_id: number | null;
  user_name: string;
  created_at: string;
};

export type RmaAnexo = {
  id: number;
  protocolo_id: number;
  etapa: string;
  nome_arquivo: string;
  caminho_arquivo: string;
  descricao: string;
  created_at: string;
};

export type RmaRecebimento = {
  id: number;
  protocolo_id: number | null;
  numero_pesquisado: string;
  campo_correspondido: string;
  resultado: "encontrado_unico" | "encontrado_multiplo" | "nao_encontrado";
  acao_realizada: string;
  responsavel_id: number | null;
  created_at: string;
};

export type RmaProtocoloDetalhe = RmaProtocolo & {
  cliente: RmaCliente;
  produtos: RmaProduto[];
  solucao: RmaSolucao;
  anexos: RmaAnexo[];
  historico: RmaHistoricoItem[];
  recebimentos: RmaRecebimento[];
};

export type RmaListaResposta = {
  total: number;
  pagina: number;
  porPagina: number;
  linhas: RmaProtocolo[];
};

export type RmaBuscaEtiquetaResultado = {
  normalizado: string;
  resultado: "encontrado_unico" | "encontrado_multiplo" | "nao_encontrado";
  correspondencias: { protocolo: RmaProtocolo; campo: string; campoRotulo: string }[];
};
