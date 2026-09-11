import { X } from "lucide-react";
import type { MktAlertSeveridade, MktMarketplace, MktOrigem, MktSituacaoPrazo, MktStatusInterno, MktStatusVinculacao, MktStockSituacao } from "./types";

export const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
export const fmtMoeda = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
export const dt = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-");

export const MARKETPLACE_LABEL: Record<MktMarketplace, string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
};

export const STATUS_LABEL: Record<MktStatusInterno, string> = {
  novo: "Novo",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  estoque_reservado: "Estoque reservado",
  aguardando_separacao: "Aguardando separação",
  em_separacao: "Em separação",
  separado: "Separado",
  aguardando_expedicao: "Aguardando expedição",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
  com_divergencia: "Com divergência",
  erro_sincronizacao: "Erro de sincronização",
};

export const STATUS_CLASS: Record<MktStatusInterno, string> = {
  novo: "",
  aguardando_pagamento: "warn",
  pago: "transfer",
  estoque_reservado: "transfer",
  aguardando_separacao: "transfer",
  em_separacao: "transfer",
  separado: "adjust",
  aguardando_expedicao: "adjust",
  enviado: "ok",
  entregue: "ok",
  cancelado: "",
  devolvido: "warn",
  com_divergencia: "warn",
  erro_sincronizacao: "warn",
};

export function StatusBadge({ status }: { status: MktStatusInterno }) {
  return <span className={`status ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const ORIGEM_LABEL: Record<MktOrigem, string> = {
  automatica: "Automática",
  manual: "Manual",
  manual_reconciliado: "Manual reconciliado com API",
};

export const VINCULACAO_LABEL: Record<MktStatusVinculacao, string> = {
  vinculado: "Vinculado",
  nao_vinculado: "Não vinculado",
  divergente: "Divergente",
  sku_inexistente: "SKU inexistente",
  variacao_nao_identificada: "Variação não identificada",
};

export const VINCULACAO_CLASS: Record<MktStatusVinculacao, string> = {
  vinculado: "ok",
  nao_vinculado: "warn",
  divergente: "warn",
  sku_inexistente: "warn",
  variacao_nao_identificada: "warn",
};

export function VinculacaoBadge({ status }: { status: MktStatusVinculacao }) {
  return <span className={`status ${VINCULACAO_CLASS[status]}`}>{VINCULACAO_LABEL[status]}</span>;
}

export const SEVERIDADE_LABEL: Record<MktAlertSeveridade, string> = { info: "Informativo", atencao: "Atenção", critico: "Crítico" };
export const SEVERIDADE_CLASS: Record<MktAlertSeveridade, string> = { info: "", atencao: "warn", critico: "out" };

export const PRAZO_LABEL: Record<MktSituacaoPrazo, string> = {
  sem_prazo: "Sem prazo",
  no_prazo: "No prazo",
  proximo: "Próximo do prazo",
  atrasado: "Atrasado",
};
export const PRAZO_CLASS: Record<MktSituacaoPrazo, string> = { sem_prazo: "", no_prazo: "ok", proximo: "warn", atrasado: "out" };

export function PrazoBadge({ situacao }: { situacao: MktSituacaoPrazo }) {
  return <span className={`status ${PRAZO_CLASS[situacao]}`}>{PRAZO_LABEL[situacao]}</span>;
}

export const ESTOQUE_SITUACAO_LABEL: Record<MktStockSituacao, string> = {
  disponivel: "Disponível",
  baixo: "Estoque baixo",
  sem_estoque: "Sem estoque",
  inativo: "Inativo",
};
export const ESTOQUE_SITUACAO_CLASS: Record<MktStockSituacao, string> = { disponivel: "ok", baixo: "warn", sem_estoque: "warn", inativo: "" };

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
