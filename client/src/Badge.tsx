import { CheckCircle2, CircleDashed, type LucideIcon } from "lucide-react";

// Selo de status genérico (ícone + pílula colorida) - mesmo visual criado
// em Peças/Fornecedores (StatusBadge/DecisaoBadge, classes .pf-badge-*),
// só que reaproveitável por qualquer módulo escolhendo um ícone e um tom
// em vez de precisar de uma classe CSS nova por valor de status.
export type BadgeTone = "ok" | "warn" | "danger" | "info" | "transfer" | "adjust" | "neutral";

export function Badge({ icon: Icon, tone = "neutral", children }: { icon: LucideIcon; tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <Icon strokeWidth={3} />
      {children}
    </span>
  );
}

// Ativo/Inativo aparece igual em vários módulos (Central de Fotos,
// Usuários, opções do RMA/SAC) - um componente só evita repetir o
// ícone/tom em cada um.
export function AtivoBadge({ ativo, rotuloAtivo = "Ativo", rotuloInativo = "Inativo" }: { ativo: boolean; rotuloAtivo?: string; rotuloInativo?: string }) {
  return ativo ? (
    <Badge icon={CheckCircle2} tone="ok">
      {rotuloAtivo}
    </Badge>
  ) : (
    <Badge icon={CircleDashed} tone="neutral">
      {rotuloInativo}
    </Badge>
  );
}
