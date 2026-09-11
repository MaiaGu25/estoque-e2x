import { Circle, X } from "lucide-react";
import type { RmaOpcao, RmaOpcoesPorTipo, RmaTipoOpcao } from "./types";

export const dt = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-");
export const dOnly = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").toLocaleDateString("pt-BR") : "-");
export const fmtMoeda = (n: number | null) => (n === null || n === undefined ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n));

// Cor de texto com contraste seguro sobre a cor de fundo escolhida pelo
// admin para o status (branco sobre cor escura, preto sobre cor clara) -
// pedido explícito de "cores de status com bom contraste".
function corTextoContraste(hexFundo: string) {
  const hex = (hexFundo || "#94a3b8").replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#1a1a1a" : "#ffffff";
}

// Selo de status/opção colorido - lê a cor direto da opção configurável
// (rma_opcoes.cor) em vez de um mapa fixo no código, já que as listas são
// administráveis.
export function OpcaoBadge({ opcao, valor, opcoesLista }: { opcao?: RmaOpcao | null; valor?: string; opcoesLista?: RmaOpcao[] }) {
  const encontrada = opcao || opcoesLista?.find((o) => o.valor === valor);
  const rotulo = encontrada?.rotulo || valor || "-";
  const cor = encontrada?.cor || "#94a3b8";
  const corTexto = corTextoContraste(cor);
  return (
    <span className="rma-badge" style={{ backgroundColor: cor, color: corTexto }}>
      <Circle size={8} fill={corTexto} stroke="none" />
      {rotulo}
    </span>
  );
}

export function rotuloOpcao(opcoes: RmaOpcoesPorTipo | null, tipo: RmaTipoOpcao, valor: string) {
  if (!valor) return "-";
  return opcoes?.[tipo]?.find((o) => o.valor === valor)?.rotulo || valor;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function OpcaoSelect({
  opcoes,
  tipo,
  value,
  onChange,
  obrigatorio,
}: {
  opcoes: RmaOpcoesPorTipo | null;
  tipo: RmaTipoOpcao;
  value: string;
  onChange: (v: string) => void;
  obrigatorio?: boolean;
}) {
  const lista = opcoes?.[tipo] || [];
  // Se o valor atual não está mais entre as ativas (foi desativado depois
  // que este protocolo já usava), mostra mesmo assim como opção extra -
  // nunca força o usuário a trocar um valor antigo só porque a opção não
  // é mais oferecida para cadastros novos.
  const valorForaDaLista = value && !lista.some((o) => o.valor === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!obrigatorio && <option value="">-</option>}
      {valorForaDaLista && (
        <option value={value}>{value} (opção desativada)</option>
      )}
      {lista.map((o) => (
        <option key={o.id} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

export function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
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
      <div className="modal" style={wide ? { width: "min(1040px,100%)" } : undefined}>
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

export function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <article className="stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon />
    </article>
  );
}
