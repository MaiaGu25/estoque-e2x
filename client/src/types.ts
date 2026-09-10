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

// ---- Inventário físico (Técnicos) ----

export type TecInventarioStatus = "em_andamento" | "concluido" | "cancelado";
export type TecInventarioModo = "final" | "soma";
export type TecInventarioSituacao = "PENDENTE" | "CORRETO" | "FALTA" | "SOBRA";

export type TecInventarioContagem = {
  id: number;
  valor: number;
  ordem: number;
  createdAt: string;
};

export type TecInventarioItem = {
  id: number;
  itemId: number;
  categoria: string;
  nome: string;
  saldoInicial: number;
  saldoAtual: number;
  saldoAlterado: boolean;
  modo: TecInventarioModo;
  contado: boolean;
  quantidadeContada: number | null;
  diferenca: number | null;
  situacao: TecInventarioSituacao;
  observacao: string;
  contagens: TecInventarioContagem[];
};

export type TecInventarioResumo = {
  total: number;
  contados: number;
  naoContados: number;
  semDiferenca: number;
  comFalta: number;
  comSobra: number;
  comSaldoAlterado: number;
};

export type TecInventarioCabecalho = {
  id: number;
  numero: string;
  status: TecInventarioStatus;
  motivo: string;
  observacao: string;
  createdBy: number | null;
  createdByNome: string | null;
  finalizedBy: number | null;
  finalizedByNome: string | null;
  createdAt: string;
  updatedAt: string;
  concludedAt: string | null;
};

export type TecInventarioDetalhe = {
  inventario: TecInventarioCabecalho;
  itens: TecInventarioItem[];
  resumo: TecInventarioResumo;
};

export type TecInventarioResumoHistorico = {
  id: number;
  numero: string;
  status: TecInventarioStatus;
  responsavelNome: string | null;
  createdByNome: string | null;
  finalizedByNome: string | null;
  createdAt: string;
  concludedAt: string | null;
  totalProdutos: number;
  produtosContados: number;
  divergencias: number;
};

export type TecInventarioSaldoAlterado = {
  itemId: number;
  nome: string;
  saldoInicial: number;
  saldoAtual: number;
  quantidadeContada: number;
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

export type FornecedorContato = {
  id: number;
  fornecedor_id: number;
  nome: string;
  telefone: string;
  email: string;
  created_at: string;
};

export type Fornecedor = {
  id: number;
  nome: string;
  identificacao: string;
  contato: string;
  endereco: string;
  numero: string;
  cep: string;
  cidade: string;
  estado: string;
  ativo: number;
  contatos: FornecedorContato[];
};

export type PedidoFornecedorStatus = "em_aberto" | "registrado" | "em_analise" | "revisar" | "liberado" | "concluido";

export type PecaFornecedorDecisao = "pendente" | "aceita" | "recusada";

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
  decisao: PecaFornecedorDecisao;
  observacoes: string;
  pedido_numero: string;
  created_at: string;
  updated_at: string;
};

export type PedidoFornecedor = {
  pedido_numero: string;
  fornecedor_id: number;
  fornecedor_nome: string;
  rma_relacionado: string;
  status: PedidoFornecedorStatus;
  total_pecas: number;
  created_at: string;
  updated_at: string;
  pendentes: number;
  aceitas: number;
  recusadas: number;
};

export type PecaFornecedorEvento = {
  id: number;
  peca_id: number;
  texto: string;
  responsible: string;
  created_at: string;
};

export type PecasFornecedorStats = {
  porStatus: { status: PedidoFornecedorStatus; n: number }[];
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
  sale_price: number;
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
  side_id: number;
  shelf_number: number;
  code: string;
  name: string;
  active: number;
  blocked: number;
  product_count: number;
  total_quantity: number;
};

export type LogLado = {
  id: number;
  rack_id: number;
  code: string;
  name: string;
  shelves_count: number;
  active: number;
  positions: LogPosicao[];
};

export type LogMontante = {
  id: number;
  floor_id: number;
  code: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  color: string;
  active: number;
  is_holding_area: number;
  sides: LogLado[];
};

export type LogAndar = {
  id: number;
  code: string;
  name: string;
  active: number;
};

export type LogMapa = { floors: LogAndar[]; racks: LogMontante[] };

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

export type LogOrcamentoStatus = "aberto" | "aguardando_aprovacao" | "fechado" | "cancelado";

export type LogOrcamento = {
  id: number;
  numero: string;
  customer_name: string;
  customer_contact: string;
  status: LogOrcamentoStatus;
  subtotal: number;
  discount_total: number;
  total: number;
  notes: string;
  responsible: string;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type LogOrcamentoItem = {
  id: number;
  quote_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  product_code: string;
  product_name: string;
  product_unit: string;
  product_notes: string;
};
