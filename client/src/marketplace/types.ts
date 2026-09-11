export type MktMarketplace = "mercado_livre" | "shopee";

export type MktStatusConexao = "nao_configurada" | "conectada" | "desconectada" | "erro" | "token_expirado";

export type MktAccount = {
  id: number;
  marketplace: MktMarketplace;
  nome_interno: string;
  apelido: string;
  identificador_externo: string;
  status_conexao: MktStatusConexao;
  ativa: number;
  autorizado_em: string | null;
  ultima_sincronizacao: string | null;
  ultima_notificacao: string | null;
  ultima_reconciliacao: string | null;
  token_expira_em: string | null;
  credencial_ref: string;
  ultimo_erro: string;
  created_at: string;
  updated_at: string;
  pedidos_importados?: number;
  falhas_pendentes?: number;
};

export type MktStatusInterno =
  | "novo"
  | "aguardando_pagamento"
  | "pago"
  | "estoque_reservado"
  | "aguardando_separacao"
  | "em_separacao"
  | "separado"
  | "aguardando_expedicao"
  | "enviado"
  | "entregue"
  | "cancelado"
  | "devolvido"
  | "com_divergencia"
  | "erro_sincronizacao";

export type MktOrigem = "automatica" | "manual" | "manual_reconciliado";
export type MktSituacaoPrazo = "sem_prazo" | "no_prazo" | "proximo" | "atrasado";

export type MktOrder = {
  id: number;
  account_id: number;
  marketplace: MktMarketplace;
  id_externo: string;
  numero_visivel: string;
  status_interno: MktStatusInterno;
  status_externo: string;
  origem: MktOrigem;
  comprador_nome: string;
  comprador_documento: string;
  data_compra: string | null;
  data_aprovacao: string | null;
  prazo_envio: string | null;
  valor_produtos: number;
  desconto: number;
  frete: number;
  valor_total: number;
  moeda: string;
  observacao: string;
  motivo_manual: string;
  importado_em: string;
  ultima_sincronizacao: string | null;
  responsavel: string;
  reconciliado_com_api: number;
  cancelado_em: string | null;
  motivo_cancelamento: string;
  conta_nome: string;
  conta_apelido: string;
  total_itens?: number;
  total_unidades?: number;
  situacao_prazo: MktSituacaoPrazo | { situacao: MktSituacaoPrazo; horasRestantes: number | null };
};

export type MktStatusVinculacao = "vinculado" | "nao_vinculado" | "divergente" | "sku_inexistente" | "variacao_nao_identificada";

export type MktOrderReservation = {
  id: number;
  order_item_id: number;
  part_id: number;
  quantidade: number;
  status: "reservado" | "liberado" | "baixado";
  created_at: string;
};

export type MktOrderItem = {
  id: number;
  order_id: number;
  part_id: number | null;
  part_code?: string;
  part_name?: string;
  part_unit?: string;
  sku_externo: string;
  sku_interno: string;
  id_anuncio: string;
  id_variacao: string;
  titulo_recebido: string;
  variacao_texto: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  status_vinculacao: MktStatusVinculacao;
  reserva_criada: number;
  quantidade_reservada: number;
  quantidade_separada: number;
  reservas?: MktOrderReservation[];
};

export type MktAlertSeveridade = "info" | "atencao" | "critico";
export type MktAlertStatus = "aberto" | "visto" | "resolvido";

export type MktAlert = {
  id: number;
  tipo: string;
  severidade: MktAlertSeveridade;
  account_id: number | null;
  order_id: number | null;
  titulo: string;
  descricao: string;
  status: MktAlertStatus;
  resolvido_por: number | null;
  resolvido_em: string | null;
  created_at: string;
  conta_nome?: string;
  numero_visivel?: string;
  id_externo?: string;
};

export type MktOrderDetail = {
  pedido: MktOrder;
  itens: MktOrderItem[];
  alertas: MktAlert[];
  eventos: MktSyncEvent[];
  auditoria: MktAuditLog[];
};

export type MktSyncEvent = {
  id: number;
  account_id: number | null;
  marketplace: string;
  tipo: string;
  id_externo: string;
  resultado: "sucesso" | "falha" | "ignorado";
  detalhe: string;
  created_at: string;
};

export type MktSyncFailureStatus = "pendente" | "resolvida" | "falha_permanente";

export type MktSyncFailure = {
  id: number;
  account_id: number | null;
  marketplace: string;
  tipo_evento: string;
  id_externo: string;
  tentativas: number;
  proxima_tentativa: string | null;
  erro_resumo: string;
  status: MktSyncFailureStatus;
  primeira_falha_em: string;
  ultima_tentativa_em: string | null;
  conta_nome?: string;
};

export type MktAuditLog = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  user_name: string;
  previous_data: string;
  new_data: string;
  resultado: string;
  created_at: string;
};

export type MktListing = {
  id: number;
  account_id: number;
  marketplace: MktMarketplace;
  id_anuncio: string;
  titulo: string;
  sku_recebido: string;
  variacao_texto: string;
  id_variacao: string;
  preco_anunciado: number;
  estoque_anunciado: number;
  status_anuncio: string;
  categoria: string;
  url_anuncio: string;
  foto_url: string;
  ultima_sincronizacao: string | null;
  conta_nome: string;
  part_id: number | null;
  part_code?: string;
  part_name?: string;
  status_vinculacao: MktStatusVinculacao;
};

export type MktStockSituacao = "disponivel" | "baixo" | "sem_estoque" | "inativo";

export type MktStockPart = {
  id: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  reserved_quantity: number;
  minimum_stock: number;
  active: number;
  saldo_disponivel: number;
  ultima_movimentacao: string | null;
  anuncios_vinculados: number;
  situacao: MktStockSituacao;
  com_reserva: boolean;
  nao_vinculado: boolean;
};

export type MktDashboard = {
  periodo: { tipo: string; inicio: string; fim: string };
  pedidosHoje: number;
  pedidosSemana: number;
  unidadesVendidas: number;
  porStatus: Partial<Record<MktStatusInterno, number>>;
  porOrigem: Partial<Record<MktOrigem, number>>;
  produtosMaisVendidos: { sku: string; nome: string | null; unidades: number; pedidos: number }[];
  pedidosAtrasados: number;
  pedidosProximosDoPrazo: number;
  falhasSincronizacao: number;
  ultimaSincronizacaoPorLoja: MktAccount[];
};

export type MktComparacaoLoja = {
  accountId: number;
  marketplace: MktMarketplace;
  nomeInterno: string;
  apelido: string;
  pedidos: number;
  unidades: number;
  pendentes: number;
  atrasados: number;
  cancelamentos: number;
  falhasSincronizacao: number;
  maisVendidos: { sku: string; unidades: number }[];
};

export type MktPeriodo = "hoje" | "ontem" | "7d" | "30d" | "custom";

export type MktCapturaCampo<T = string> = { valor: T | null; confianca: number };
export type MktCapturaCampos = {
  marketplace: MktCapturaCampo<MktMarketplace>;
  numeroPedido: MktCapturaCampo;
  data: MktCapturaCampo;
  prazoEnvio: MktCapturaCampo;
  sku: MktCapturaCampo;
  quantidade: MktCapturaCampo<number>;
  precoUnitario: MktCapturaCampo<number>;
  total: MktCapturaCampo<number>;
  frete: MktCapturaCampo<number>;
};

export type MktCapturaResultado = {
  id: number;
  status: "lida" | "falhou";
  texto?: string;
  campos: MktCapturaCampos | null;
  confiancaMedia: number;
  erro?: string;
};
