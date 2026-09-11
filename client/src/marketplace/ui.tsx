import {
  AlertOctagon, CheckCircle2, CircleDashed, Clock5, HelpCircle, Info, Link2, PackageCheck, PackageSearch,
  RefreshCw, SearchX, TriangleAlert, Truck, Unlink2, Undo2, UserCheck, UserRound, X, XCircle,
} from "lucide-react";
import type {
  MktAlertSeveridade, MktMarketplace, MktOrigem, MktSituacaoPrazo, MktStatusConexao, MktStatusInterno,
  MktStatusVinculacao, MktStockSituacao,
} from "./types";
import { Badge, type BadgeTone } from "../Badge";

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

export const STATUS_TONE: Record<MktStatusInterno, BadgeTone> = {
  novo: "neutral",
  aguardando_pagamento: "warn",
  pago: "transfer",
  estoque_reservado: "transfer",
  aguardando_separacao: "transfer",
  em_separacao: "transfer",
  separado: "adjust",
  aguardando_expedicao: "adjust",
  enviado: "ok",
  entregue: "ok",
  cancelado: "neutral",
  devolvido: "warn",
  com_divergencia: "warn",
  erro_sincronizacao: "danger",
};

const STATUS_ICON = {
  novo: CircleDashed,
  aguardando_pagamento: Clock5,
  pago: CheckCircle2,
  estoque_reservado: PackageCheck,
  aguardando_separacao: Clock5,
  em_separacao: PackageSearch,
  separado: PackageCheck,
  aguardando_expedicao: Clock5,
  enviado: Truck,
  entregue: CheckCircle2,
  cancelado: XCircle,
  devolvido: Undo2,
  com_divergencia: TriangleAlert,
  erro_sincronizacao: AlertOctagon,
};

export function StatusBadge({ status }: { status: MktStatusInterno }) {
  return (
    <Badge icon={STATUS_ICON[status]} tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export const ORIGEM_LABEL: Record<MktOrigem, string> = {
  automatica: "Automática",
  manual: "Manual",
  manual_reconciliado: "Manual reconciliado com API",
};

const ORIGEM_TONE: Record<MktOrigem, BadgeTone> = { automatica: "info", manual: "neutral", manual_reconciliado: "transfer" };
const ORIGEM_ICON = { automatica: RefreshCw, manual: UserRound, manual_reconciliado: UserCheck };

export function OrigemBadge({ origem }: { origem: MktOrigem }) {
  return (
    <Badge icon={ORIGEM_ICON[origem]} tone={ORIGEM_TONE[origem]}>
      {ORIGEM_LABEL[origem]}
    </Badge>
  );
}

export const VINCULACAO_LABEL: Record<MktStatusVinculacao, string> = {
  vinculado: "Vinculado",
  nao_vinculado: "Não vinculado",
  divergente: "Divergente",
  sku_inexistente: "SKU inexistente",
  variacao_nao_identificada: "Variação não identificada",
};

const VINCULACAO_TONE: Record<MktStatusVinculacao, BadgeTone> = {
  vinculado: "ok",
  nao_vinculado: "warn",
  divergente: "warn",
  sku_inexistente: "warn",
  variacao_nao_identificada: "warn",
};

const VINCULACAO_ICON = {
  vinculado: Link2,
  nao_vinculado: Unlink2,
  divergente: TriangleAlert,
  sku_inexistente: SearchX,
  variacao_nao_identificada: HelpCircle,
};

export function VinculacaoBadge({ status }: { status: MktStatusVinculacao }) {
  return (
    <Badge icon={VINCULACAO_ICON[status]} tone={VINCULACAO_TONE[status]}>
      {VINCULACAO_LABEL[status]}
    </Badge>
  );
}

export const SEVERIDADE_LABEL: Record<MktAlertSeveridade, string> = { info: "Informativo", atencao: "Atenção", critico: "Crítico" };
const SEVERIDADE_TONE: Record<MktAlertSeveridade, BadgeTone> = { info: "info", atencao: "warn", critico: "danger" };
const SEVERIDADE_ICON = { info: Info, atencao: TriangleAlert, critico: AlertOctagon };

export function SeveridadeBadge({ severidade }: { severidade: MktAlertSeveridade }) {
  return (
    <Badge icon={SEVERIDADE_ICON[severidade]} tone={SEVERIDADE_TONE[severidade]}>
      {SEVERIDADE_LABEL[severidade]}
    </Badge>
  );
}

export const PRAZO_LABEL: Record<MktSituacaoPrazo, string> = {
  sem_prazo: "Sem prazo",
  no_prazo: "No prazo",
  proximo: "Próximo do prazo",
  atrasado: "Atrasado",
};
const PRAZO_TONE: Record<MktSituacaoPrazo, BadgeTone> = { sem_prazo: "neutral", no_prazo: "ok", proximo: "warn", atrasado: "danger" };
const PRAZO_ICON = { sem_prazo: CircleDashed, no_prazo: CheckCircle2, proximo: Clock5, atrasado: TriangleAlert };

export function PrazoBadge({ situacao }: { situacao: MktSituacaoPrazo }) {
  return (
    <Badge icon={PRAZO_ICON[situacao]} tone={PRAZO_TONE[situacao]}>
      {PRAZO_LABEL[situacao]}
    </Badge>
  );
}

export const ESTOQUE_SITUACAO_LABEL: Record<MktStockSituacao, string> = {
  disponivel: "Disponível",
  baixo: "Estoque baixo",
  sem_estoque: "Sem estoque",
  inativo: "Inativo",
};
const ESTOQUE_SITUACAO_TONE: Record<MktStockSituacao, BadgeTone> = { disponivel: "ok", baixo: "warn", sem_estoque: "warn", inativo: "neutral" };
const ESTOQUE_SITUACAO_ICON = { disponivel: CheckCircle2, baixo: TriangleAlert, sem_estoque: XCircle, inativo: CircleDashed };

export function EstoqueSituacaoBadge({ situacao }: { situacao: MktStockSituacao }) {
  return (
    <Badge icon={ESTOQUE_SITUACAO_ICON[situacao]} tone={ESTOQUE_SITUACAO_TONE[situacao]}>
      {ESTOQUE_SITUACAO_LABEL[situacao]}
    </Badge>
  );
}

// Status de conexão de uma loja - antes duplicado (mesmo condicional) em
// LojasTab/DashboardTab/SincronizacaoTab; agora um componente só.
export function ConexaoBadge({ status }: { status: MktStatusConexao }) {
  if (status === "conectada") return <Badge icon={CheckCircle2} tone="ok">Conectada</Badge>;
  if (status === "nao_configurada") return <Badge icon={CircleDashed} tone="neutral">Não configurada</Badge>;
  return <Badge icon={TriangleAlert} tone="warn">{status}</Badge>;
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
