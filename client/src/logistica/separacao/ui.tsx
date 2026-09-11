import type { LogCanalPedido, LogPedidoSaidaStatus, LogPrioridade, LogSeparacaoDivergenciaTipo } from "../../types";

export const PEDIDO_STATUS_LABEL: Record<LogPedidoSaidaStatus, string> = {
  aguardando_separacao: "Aguardando separação",
  em_separacao: "Em separação",
  separado_parcialmente: "Separado parcialmente",
  com_divergencia: "Com divergência",
  separado: "Separado",
  aguardando_expedicao: "Aguardando expedição",
  expedido: "Expedido",
  cancelado: "Cancelado",
};

export const PEDIDO_STATUS_CLASS: Record<LogPedidoSaidaStatus, string> = {
  aguardando_separacao: "",
  em_separacao: "transfer",
  separado_parcialmente: "warn",
  com_divergencia: "warn",
  separado: "ok",
  aguardando_expedicao: "adjust",
  expedido: "ok",
  cancelado: "",
};

export const CANAL_LABEL: Record<LogCanalPedido, string> = {
  manual: "Manual",
  vendedor: "Vendedor",
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  outro: "Outro",
};

export const PRIORIDADE_LABEL: Record<LogPrioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORIDADE_CLASS: Record<LogPrioridade, string> = {
  baixa: "",
  normal: "",
  alta: "warn",
  urgente: "out",
};

export const DIVERGENCIA_SEPARACAO_TIPO_LABEL: Record<LogSeparacaoDivergenciaTipo, string> = {
  nao_encontrado: "Produto não encontrado",
  saldo_insuficiente: "Saldo insuficiente",
  localizacao_errada: "Localização errada",
  avariado: "Avariado",
  serial_invalido: "Serial inválido",
  foto_divergente: "Foto divergente do produto físico",
  quantidade_divergente: "Quantidade divergente",
  sku_errado: "SKU errado",
  outro: "Outro",
};
