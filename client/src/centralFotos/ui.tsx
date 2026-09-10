import { ImageOff, X } from "lucide-react";

export const dt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function fmtBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const unidades = ["B", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(i === 0 ? 0 : 1)} ${unidades[i]}`;
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
      <ImageOff />
      <p>{text}</p>
    </div>
  );
}

// Placeholder consistente pra produto sem foto principal - nunca uma
// imagem fictícia, só um ícone dentro da mesma moldura usada nas
// miniaturas de verdade.
export function PlaceholderFoto({ tamanho = 56 }: { tamanho?: number }) {
  return (
    <div className="cf-foto-placeholder" style={{ width: tamanho, height: tamanho }}>
      <ImageOff size={Math.round(tamanho * 0.4)} />
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
