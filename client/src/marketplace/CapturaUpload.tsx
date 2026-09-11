import { useRef, useState } from "react";
import { AlertTriangle, ImagePlus } from "lucide-react";
import { api, ApiError } from "../api";
import type { MktCapturaResultado } from "./types";

const LIMIAR_CONFIANCA_BAIXA = 0.6;

function badgeConfianca(confianca: number) {
  if (confianca <= 0) return null;
  const baixa = confianca < LIMIAR_CONFIANCA_BAIXA;
  return (
    <small style={{ color: baixa ? "#b3311e" : "#1f8a52", display: "inline-flex", alignItems: "center", gap: 3 }}>
      {baixa && <AlertTriangle size={11} />}
      {Math.round(confianca * 100)}% de confiança
    </small>
  );
}

// Envia a captura de tela, mostra o que o OCR reconheceu (com destaque
// pros campos de baixa confiança) e deixa o administrador usar como
// sugestão para preencher o formulário - nunca cria pedido nem reserva
// nada sozinho.
export default function CapturaUpload({ onUsarDados }: { onUsarDados: (resultado: MktCapturaResultado) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<MktCapturaResultado | null>(null);
  const [erro, setErro] = useState("");

  const enviarArquivo = (file: File) => {
    setErro("");
    setEnviando(true);
    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const r = await api.post<MktCapturaResultado>("/api/marketplace/capturas", { imagem: leitor.result });
        setResultado(r);
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : "Não foi possível processar a captura.");
      } finally {
        setEnviando(false);
      }
    };
    leitor.readAsDataURL(file);
  };

  return (
    <div className="cf-dropzone" style={{ marginBottom: 14 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0])}
      />
      {!resultado && (
        <div onClick={() => inputRef.current?.click()} style={{ cursor: "pointer" }}>
          <ImagePlus />
          <p>{enviando ? "Lendo a captura…" : "Enviar captura de tela do pedido (opcional)"}</p>
          <small>O sistema tenta reconhecer os campos - você sempre confirma antes de salvar.</small>
        </div>
      )}
      {erro && <div className="error">{erro}</div>}
      {resultado && resultado.status === "falhou" && <div className="error">{resultado.erro}</div>}
      {resultado && resultado.status === "lida" && resultado.campos && (
        <div style={{ textAlign: "left" }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Dados reconhecidos na captura:</p>
          <div className="detail-meta">
            <div>
              <span>Marketplace</span>
              <b>{resultado.campos.marketplace.valor || "não identificado"}</b>
              {badgeConfianca(resultado.campos.marketplace.confianca)}
            </div>
            <div>
              <span>Número do pedido</span>
              <b>{resultado.campos.numeroPedido.valor || "não identificado"}</b>
              {badgeConfianca(resultado.campos.numeroPedido.confianca)}
            </div>
            <div>
              <span>Data</span>
              <b>{resultado.campos.data.valor || "não identificada"}</b>
              {badgeConfianca(resultado.campos.data.confianca)}
            </div>
            <div>
              <span>Prazo de envio</span>
              <b>{resultado.campos.prazoEnvio.valor || "não identificado"}</b>
              {badgeConfianca(resultado.campos.prazoEnvio.confianca)}
            </div>
            <div>
              <span>SKU</span>
              <b>{resultado.campos.sku.valor || "não identificado"}</b>
              {badgeConfianca(resultado.campos.sku.confianca)}
            </div>
            <div>
              <span>Quantidade</span>
              <b>{resultado.campos.quantidade.valor ?? "não identificada"}</b>
              {badgeConfianca(resultado.campos.quantidade.confianca)}
            </div>
            <div>
              <span>Preço unitário</span>
              <b>{resultado.campos.precoUnitario.valor ?? "não identificado"}</b>
              {badgeConfianca(resultado.campos.precoUnitario.confianca)}
            </div>
            <div>
              <span>Total</span>
              <b>{resultado.campos.total.valor ?? "não identificado"}</b>
              {badgeConfianca(resultado.campos.total.confianca)}
            </div>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setResultado(null)}>
              Descartar
            </button>
            <button className="primary" onClick={() => onUsarDados(resultado)}>
              Usar como sugestão no formulário
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
