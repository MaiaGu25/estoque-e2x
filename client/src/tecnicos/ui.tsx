import { CheckCircle2, Clock5, PackagePlus, TriangleAlert, X } from "lucide-react";
import type { TecInventarioSituacao } from "../types";
import { Badge, type BadgeTone } from "../Badge";

export const fmt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
export const fmtSinal = (n: number) => new Intl.NumberFormat("pt-BR", { signDisplay: "exceptZero" }).format(n);
export const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const SITUACAO_LABEL: Record<TecInventarioSituacao, string> = {
  PENDENTE: "Pendente",
  CORRETO: "Correto",
  FALTA: "Falta",
  SOBRA: "Sobra",
};

// Cinza (pendente), verde (correto), laranja (falta), azul (sobra) - as
// cores pedidas, com ícone por situação (mesmo visual do resto do app).
export const SITUACAO_TONE: Record<TecInventarioSituacao, BadgeTone> = {
  PENDENTE: "neutral",
  CORRETO: "ok",
  FALTA: "warn",
  SOBRA: "transfer",
};

const SITUACAO_ICON = { PENDENTE: Clock5, CORRETO: CheckCircle2, FALTA: TriangleAlert, SOBRA: PackagePlus };

export function SituacaoBadge({ situacao }: { situacao: TecInventarioSituacao }) {
  return (
    <Badge icon={SITUACAO_ICON[situacao]} tone={SITUACAO_TONE[situacao]}>
      {SITUACAO_LABEL[situacao]}
    </Badge>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <p>{text}</p>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={wide ? { width: "min(960px,100%)" } : undefined}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
