import { X } from "lucide-react";
import type { TecInventarioSituacao } from "../types";

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
// cores pedidas, usando as mesmas classes ".status" já existentes no
// resto do sistema (mais a cor customizada da falta, que não tem uma
// classe pronta equivalente).
export const SITUACAO_CLASS: Record<TecInventarioSituacao, string> = {
  PENDENTE: "",
  CORRETO: "ok",
  FALTA: "",
  SOBRA: "transfer",
};
export const SITUACAO_COR_FALTA = "#c0501f";

export function SituacaoBadge({ situacao }: { situacao: TecInventarioSituacao }) {
  if (situacao === "FALTA") {
    return <span className="status" style={{ background: "#fdece1", color: SITUACAO_COR_FALTA }}>{SITUACAO_LABEL[situacao]}</span>;
  }
  return <span className={`status ${SITUACAO_CLASS[situacao]}`}>{SITUACAO_LABEL[situacao]}</span>;
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
