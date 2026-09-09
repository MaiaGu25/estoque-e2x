import { X } from "lucide-react";
import type { LogSituacao, LogTipoOperacao } from "../types";

export const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
export const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const SITUACAO_LABEL: Record<LogSituacao, string> = {
  disponivel: "Disponível",
  baixo: "Estoque baixo",
  sem_estoque: "Sem estoque",
  inativo: "Inativo",
};

export const SITUACAO_CLASS: Record<LogSituacao, string> = {
  disponivel: "ok",
  baixo: "warn",
  sem_estoque: "warn",
  inativo: "",
};

export function SituacaoBadge({ situacao }: { situacao: LogSituacao }) {
  return <span className={`status ${SITUACAO_CLASS[situacao]}`}>{SITUACAO_LABEL[situacao]}</span>;
}

export const TIPO_LABEL: Record<LogTipoOperacao, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
  AJUSTE: "Ajuste",
};

export const TIPO_CLASS: Record<LogTipoOperacao, string> = {
  ENTRADA: "ok",
  SAIDA: "warn",
  TRANSFERENCIA: "transfer",
  AJUSTE: "adjust",
};

export function TipoBadge({ tipo }: { tipo: LogTipoOperacao }) {
  return <span className={`status ${TIPO_CLASS[tipo]}`}>{TIPO_LABEL[tipo]}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
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

export function Stat({ icon: Icon, label, value, alert }: { icon: any; label: string; value: string; alert?: boolean }) {
  return (
    <article className={alert ? "stat alert-stat" : "stat"}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon />
    </article>
  );
}
