export type Role = "admin" | "operador";

export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
};

export type Part = {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  location: string;
  quantity: number;
  minimum_stock: number;
  reserved_quantity: number;
  notes: string;
  active: number;
};

export type Movement = {
  id: number;
  part_id: number;
  order_id: number | null;
  type: "ENTRADA" | "SAIDA";
  quantity: number;
  previous_balance: number;
  new_balance: number;
  reason: string;
  responsible: string;
  notes: string;
  created_at: string;
  code: string;
  part_name: string;
  unit: string;
};

export type ReservedMovement = {
  id: number;
  part_id: number;
  type: "RESERVAR" | "LIBERAR" | "BAIXA";
  quantity: number;
  previous_reserved: number;
  new_reserved: number;
  reason: string;
  responsible: string;
  notes: string;
  created_at: string;
  code: string;
  part_name: string;
  unit: string;
};

export type Order = {
  id: number;
  number: string;
  type: "ENTRADA" | "SAIDA";
  reason: string;
  responsible: string;
  notes: string;
  created_at: string;
  item_count: number;
  total_quantity: number;
};

export type Member = { id: number; name: string; role: Role };
export type Reason = { reason: string; occurrences: number; quantity: number };

export type Data = {
  parts: Part[];
  movements: Movement[];
  orders: Order[];
  members: Member[];
  reasons: Reason[];
  reservedMovements: ReservedMovement[];
};

// ---- Estoque dos Técnicos ----

export type TecItem = {
  id: number;
  categoria: string;
  nome: string;
  quantidade: number;
  limite_baixo: number;
  ativo: number;
};

export type TecConfig = {
  id: number;
  nome: string;
  processador: string;
  ram: string;
  ssd: string;
  observacao: string;
  ativo: number;
  estoque_maquinas: number;
};

export type TecConfigItem = {
  configuracao_id: number;
  item_id: number;
  quantidade: number;
  nome: string;
  categoria: string;
};

export type TecMovimento = {
  id: number;
  tipo: string;
  alvo: string;
  quantidade: number;
  motivo: string;
  detalhe: string;
  responsible: string;
  created_at: string;
};

export type TecnicosData = {
  itens: TecItem[];
  configuracoes: TecConfig[];
  configItens: TecConfigItem[];
  movimentos: TecMovimento[];
};

// ---- Central de Testes ----

export type Teste = {
  id: number;
  codigo: string;
  numero_teste: number;
  responsible: string;
  created_at: string;
  foto_serial: string;
  foto_teste: string;
};

export type TestesStats = {
  total: number;
  hoje: number;
  ultimo: Teste | null;
  porResponsavel: { responsible: string; quantidade: number }[];
};

// ---- RMA / SAC ----

export type RmaStatus = "aguardando_devolucao" | "recebido" | "em_inspecao" | "concluido";
export type RmaCulpa = "nossa" | "cliente";
export type RmaDesfecho = "reembolso_cliente" | "cobranca_plataforma";
export type RmaDisputaStatus = "nao_aberta" | "aberta" | "ganha" | "perdida";

export type RmaCaso = {
  id: number;
  numero: string;
  plataforma: string;
  pedido: string;
  produto: string;
  cliente: string;
  motivo_cliente: string;
  status: RmaStatus;
  culpa: RmaCulpa | null;
  laudo_tecnico: string;
  desfecho: RmaDesfecho | null;
  valor: number | null;
  disputa_status: RmaDisputaStatus | null;
  tecnico_responsavel: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type RmaEvento = {
  id: number;
  caso_id: number;
  tipo: string;
  texto: string;
  foto: string | null;
  responsible: string;
  created_at: string;
};

export type RmaStats = {
  porStatus: { status: RmaStatus; n: number }[];
  abertosHoje: number;
  totalMes: number;
  reembolsadoMes: number;
  cobradoMes: number;
  porPlataforma: { plataforma: string; n: number }[];
};

// ---- Peças / Fornecedores ----

export type Fornecedor = {
  id: number;
  nome: string;
  identificacao: string;
  contato: string;
  ativo: number;
};

export type PecaFornecedorStatus = "aguardando_envio" | "aguardando_fornecedor" | "trocada" | "recusada";

export type PecaFornecedor = {
  id: number;
  codigo: string;
  serial: string;
  descricao: string;
  ean: string;
  marca: string;
  defeito: string;
  fornecedor_id: number;
  fornecedor_nome: string;
  status: PecaFornecedorStatus;
  rma_relacionado: string;
  observacoes: string;
  pedido_numero: string;
  created_at: string;
  updated_at: string;
};

export type PedidoFornecedor = {
  pedido_numero: string;
  fornecedor_id: number;
  fornecedor_nome: string;
  total_pecas: number;
  created_at: string;
  updated_at: string;
  aguardando_envio: number;
  aguardando_fornecedor: number;
  trocada: number;
  recusada: number;
};

export type PecaFornecedorEvento = {
  id: number;
  peca_id: number;
  texto: string;
  responsible: string;
  created_at: string;
};

export type PecasFornecedorStats = {
  porStatus: { status: PecaFornecedorStatus; n: number }[];
  registradasHoje: number;
  porFornecedor: { fornecedor: string; n: number }[];
  porPeca: { codigo: string; descricao: string; n: number }[];
};

// ---- Logística ----

export type LogSituacao = "disponivel" | "baixo" | "sem_estoque" | "inativo";

export type LogProduto = {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  minimum_stock: number;
  notes: string;
  active: number;
  saldo_total: number;
  situacao: LogSituacao;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
};

export type LogPosicao = {
  id: number;
  rack_id: number;
  level_number: number;
  code: string;
  name: string;
  active: number;
  blocked: number;
  product_count: number;
  total_quantity: number;
};

export type LogMontante = {
  id: number;
  aisle_id: number;
  code: string;
  name: string;
  levels_count: number;
  color: string;
  active: number;
  positions: LogPosicao[];
};

export type LogCorredor = {
  id: number;
  row_id: number;
  code: string;
  name: string;
  active: number;
  racks: LogMontante[];
};

export type LogFileira = {
  id: number;
  code: string;
  name: string;
  color: string;
  active: number;
  aisles: LogCorredor[];
};

export type LogMapa = { rows: LogFileira[] };

export type LogTipoOperacao = "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE";

export type LogMovimentoResumo = {
  id: number;
  created_at: string;
  quantity: number;
  number: string;
  type: LogTipoOperacao;
  reason: string;
  responsible: string;
  product_code: string;
  product_name: string;
  from_position_code: string | null;
  to_position_code: string | null;
};

export type LogHistoricoRegistro = LogMovimentoResumo & {
  operation_id: number;
  product_id: number;
  unit: string;
  notes: string;
  from_position_id: number | null;
  to_position_id: number | null;
  previous_total_quantity: number;
  new_total_quantity: number;
  registered_by: string | null;
};

export type LogDashboard = {
  produtosCadastrados: number;
  unidadesTotais: number;
  estoqueBaixo: number;
  semEstoque: number;
  registradasHoje: number;
  posicoesTotais: number;
  posicoesOcupadas: number;
  posicoesVazias: number;
  entradasRecentes: LogMovimentoResumo[];
  saidasRecentes: LogMovimentoResumo[];
  transferenciasRecentes: LogMovimentoResumo[];
  ajustesRecentes: LogMovimentoResumo[];
  ultimasMovimentacoes: LogMovimentoResumo[];
};
