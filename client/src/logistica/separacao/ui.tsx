import { ArrowDown, ArrowUp, CheckCircle2, Clock5, Minus, PackageCheck, PackageSearch, TriangleAlert, Truck, XCircle } from "lucide-react";
import type { LogCanalPedido, LogPedidoSaidaStatus, LogPrioridade, LogSeparacaoDivergenciaTipo } from "../../types";
import { Badge, type BadgeTone } from "../../Badge";

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

export const PEDIDO_STATUS_TONE: Record<LogPedidoSaidaStatus, BadgeTone> = {
  aguardando_separacao: "neutral",
  em_separacao: "transfer",
  separado_parcialmente: "warn",
  com_divergencia: "warn",
  separado: "ok",
  aguardando_expedicao: "adjust",
  expedido: "ok",
  cancelado: "neutral",
};

const PEDIDO_STATUS_ICON = {
  aguardando_separacao: Clock5,
  em_separacao: PackageSearch,
  separado_parcialmente: TriangleAlert,
  com_divergencia: TriangleAlert,
  separado: CheckCircle2,
  aguardando_expedicao: Truck,
  expedido: PackageCheck,
  cancelado: XCircle,
};

export function PedidoStatusBadge({ status }: { status: LogPedidoSaidaStatus }) {
  return (
    <Badge icon={PEDIDO_STATUS_ICON[status]} tone={PEDIDO_STATUS_TONE[status]}>
      {PEDIDO_STATUS_LABEL[status]}
    </Badge>
  );
}

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

export const PRIORIDADE_TONE: Record<LogPrioridade, BadgeTone> = {
  baixa: "neutral",
  normal: "neutral",
  alta: "warn",
  urgente: "danger",
};

const PRIORIDADE_ICON = { baixa: ArrowDown, normal: Minus, alta: ArrowUp, urgente: TriangleAlert };

export function PrioridadeBadge({ prioridade }: { prioridade: LogPrioridade }) {
  return (
    <Badge icon={PRIORIDADE_ICON[prioridade]} tone={PRIORIDADE_TONE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

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
