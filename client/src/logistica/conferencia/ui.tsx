import type { LogConferenciaDivergenciaTipo, LogConferenciaStatus, LogDivergenciaStatus } from "../../types";

export const CONFERENCIA_STATUS_LABEL: Record<LogConferenciaStatus, string> = {
  aguardando_conferencia: "Aguardando conferência",
  em_conferencia: "Em conferência",
  conferido_parcialmente: "Conferido parcialmente",
  com_divergencia: "Com divergência",
  conferido: "Conferido",
  cancelado: "Cancelado",
};

export const CONFERENCIA_STATUS_CLASS: Record<LogConferenciaStatus, string> = {
  aguardando_conferencia: "",
  em_conferencia: "transfer",
  conferido_parcialmente: "warn",
  com_divergencia: "warn",
  conferido: "ok",
  cancelado: "",
};

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
