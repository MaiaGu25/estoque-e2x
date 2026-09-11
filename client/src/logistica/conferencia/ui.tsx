import { CheckCircle2, Clock5, PackageSearch, TriangleAlert, XCircle } from "lucide-react";
import type { LogConferenciaDivergenciaTipo, LogConferenciaStatus, LogDivergenciaStatus } from "../../types";
import { Badge, type BadgeTone } from "../../Badge";

export const CONFERENCIA_STATUS_LABEL: Record<LogConferenciaStatus, string> = {
  aguardando_conferencia: "Aguardando conferência",
  em_conferencia: "Em conferência",
  conferido_parcialmente: "Conferido parcialmente",
  com_divergencia: "Com divergência",
  conferido: "Conferido",
  cancelado: "Cancelado",
};

export const CONFERENCIA_STATUS_TONE: Record<LogConferenciaStatus, BadgeTone> = {
  aguardando_conferencia: "neutral",
  em_conferencia: "transfer",
  conferido_parcialmente: "warn",
  com_divergencia: "warn",
  conferido: "ok",
  cancelado: "neutral",
};

const CONFERENCIA_STATUS_ICON = {
  aguardando_conferencia: Clock5,
  em_conferencia: PackageSearch,
  conferido_parcialmente: TriangleAlert,
  com_divergencia: TriangleAlert,
  conferido: CheckCircle2,
  cancelado: XCircle,
};

export function ConferenciaStatusBadge({ status }: { status: LogConferenciaStatus }) {
  return (
    <Badge icon={CONFERENCIA_STATUS_ICON[status]} tone={CONFERENCIA_STATUS_TONE[status]}>
      {CONFERENCIA_STATUS_LABEL[status]}
    </Badge>
  );
}

export const DIVERGENCIA_TIPO_LABEL: Record<LogConferenciaDivergenciaTipo, string> = {
  quantidade_divergente: "Quantidade divergente",
  produto_errado: "Produto errado",
  serial_duplicado: "Serial duplicado",
  serial_de_outro_produto: "Serial de outro produto",
  avariado: "Avariado",
  item_nao_identificado: "Item não identificado",
  outro: "Outro",
};

export const DIVERGENCIA_STATUS_LABEL: Record<LogDivergenciaStatus, string> = {
  aberta: "Aberta",
  resolvida: "Resolvida",
};

export function DivergenciaStatusBadge({ status }: { status: LogDivergenciaStatus }) {
  return status === "aberta" ? (
    <Badge icon={TriangleAlert} tone="warn">Aberta</Badge>
  ) : (
    <Badge icon={CheckCircle2} tone="ok">Resolvida</Badge>
  );
}
