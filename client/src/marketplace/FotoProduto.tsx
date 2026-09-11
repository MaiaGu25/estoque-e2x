import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { api } from "../api";

type FotoResposta = { primary: { thumbnailUrl: string; optimizedUrl: string } | null };

// Consulta a Central de Fotos pelo SKU via a API HTTP interna dela - nunca
// duplica nem guarda a foto no lado do Marketplace. Qualquer falha (SKU
// sem cadastro, API indisponível, sem foto principal) só esconde a
// miniatura - nunca bloqueia a tela.
export default function FotoProduto({ sku, tamanho = 44 }: { sku: string; tamanho?: number }) {
  const [foto, setFoto] = useState<FotoResposta | null | "indisponivel">(null);

  useEffect(() => {
    if (!sku) return setFoto("indisponivel");
    let cancelado = false;
    api
      .get<FotoResposta>(`/api/central-fotos/products/${encodeURIComponent(sku)}/photos`)
      .then((r) => !cancelado && setFoto(r))
      .catch(() => !cancelado && setFoto("indisponivel"));
    return () => {
      cancelado = true;
    };
  }, [sku]);

  const url = foto && foto !== "indisponivel" ? foto.primary?.thumbnailUrl : null;

  if (!url) {
    return (
      <div
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: 8,
          background: "#f1f4f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9db0a6",
          flexShrink: 0,
        }}
        title="Sem foto disponível"
      >
        <ImageOff size={tamanho * 0.4} />
      </div>
    );
  }

  return (
    <img src={url} alt={sku} style={{ width: tamanho, height: tamanho, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} onError={() => setFoto("indisponivel")} />
  );
}
