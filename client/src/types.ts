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
