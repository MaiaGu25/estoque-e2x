import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { ApiError } from "../api";
import { centralFotosApi } from "./api";

type StatusItem = "pendente" | "enviando" | "sucesso" | "erro" | "duplicada" | "cancelado";
type ItemFila = { id: number; file: File; status: StatusItem; erro?: string };
let itemFilaSeq = 0;

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

// Fila de envio com arrastar-e-soltar: cada arquivo tem seu próprio status
// (visualizar antes de confirmar, remover da fila, progresso e erro por
// arquivo, cancelar antes de terminar). O envio em si é sempre um
// arquivo por vez - dá pra cancelar exatamente entre um e outro.
export default function UploadFotos({
  produtoId,
  vagasRestantes,
  onEnviado,
}: {
  produtoId: number;
  vagasRestantes: number;
  onEnviado: () => void;
}) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const cancelarRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const adicionarArquivos = (lista: FileList | File[]) => {
    const arquivos = Array.from(lista).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (!arquivos.length) return;
    setFila((f) => [...f, ...arquivos.map((file) => ({ id: ++itemFilaSeq, file, status: "pendente" as StatusItem }))]);
  };

  const removerDaFila = (id: number) => setFila((f) => f.filter((i) => i.id !== id));

  const enviarUm = async (item: ItemFila, forcar = false) => {
    setFila((f) => f.map((i) => (i.id === item.id ? { ...i, status: "enviando", erro: undefined } : i)));
    try {
      const dataUrl = await lerComoDataUrl(item.file);
      await centralFotosApi.enviarImagem(produtoId, { nomeOriginal: item.file.name, dataUrl, forcarDuplicata: forcar });
      setFila((f) => f.map((i) => (i.id === item.id ? { ...i, status: "sucesso" } : i)));
      onEnviado();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar.";
      const duplicada = e instanceof ApiError && !!(e.body as { detalhes?: { imagemExistenteId?: number } } | undefined)?.detalhes?.imagemExistenteId;
      setFila((f) => f.map((i) => (i.id === item.id ? { ...i, status: duplicada ? "duplicada" : "erro", erro: msg } : i)));
    }
  };

  const enviarFila = async () => {
    setEnviando(true);
    cancelarRef.current = false;
    for (const item of fila) {
      if (cancelarRef.current) break;
      if (item.status !== "pendente") continue;
      // eslint-disable-next-line no-await-in-loop
      await enviarUm(item);
    }
    setEnviando(false);
  };

  const cancelarEnvio = () => {
    cancelarRef.current = true;
    setFila((f) => f.map((i) => (i.status === "pendente" ? { ...i, status: "cancelado" } : i)));
  };

  const limparConcluidos = () => setFila((f) => f.filter((i) => i.status === "pendente" || i.status === "enviando"));

  const pendentes = fila.filter((i) => i.status === "pendente").length;

  return (
    <div>
      <div
        className={arrastando ? "cf-dropzone arrastando" : "cf-dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud size={28} />
        <p>Arraste fotos aqui ou clique para selecionar</p>
        <small>
          JPEG, PNG ou WebP · restam {vagasRestantes} foto{vagasRestantes === 1 ? "" : "s"} nesse produto
        </small>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) adicionarArquivos(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {fila.length > 0 && (
        <div className="cart" style={{ marginTop: 12 }}>
          <div className="cart-head">
            <b>Fila de envio</b>
            <span>
              {fila.length} arquivo{fila.length === 1 ? "" : "s"}
            </span>
          </div>
          {fila.map((item) => (
            <div className="cart-row" key={item.id} style={{ gridTemplateColumns: "1fr auto 32px", alignItems: "center" }}>
              <span>
                <b>{item.file.name}</b>
                <small>
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  {item.status === "enviando" && " · enviando…"}
                  {item.status === "sucesso" && " · enviada"}
                  {item.status === "cancelado" && " · cancelada"}
                  {item.erro ? ` · ${item.erro}` : ""}
                </small>
              </span>
              <span>
                {item.status === "duplicada" && (
                  <button className="secondary" onClick={() => enviarUm(item, true)}>
                    Enviar mesmo assim
                  </button>
                )}
              </span>
              {["pendente", "erro", "duplicada", "cancelado"].includes(item.status) ? (
                <button onClick={() => removerDaFila(item.id)}>
                  <X />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}

      {fila.length > 0 && (
        <div className="modal-actions" style={{ borderTop: "none", paddingTop: 10, justifyContent: "flex-start" }}>
          {!enviando ? (
            <button className="primary" onClick={enviarFila} disabled={!pendentes}>
              <UploadCloud size={15} /> Enviar {pendentes} foto{pendentes === 1 ? "" : "s"}
            </button>
          ) : (
            <button className="secondary" onClick={cancelarEnvio}>
              Cancelar envio
            </button>
          )}
          <button className="secondary" onClick={limparConcluidos} disabled={enviando}>
            Limpar concluídas
          </button>
        </div>
      )}
    </div>
  );
}
