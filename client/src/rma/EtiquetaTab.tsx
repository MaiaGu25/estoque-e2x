import { useEffect, useRef, useState } from "react";
import { CheckCircle2, PackageSearch, ScanLine, XCircle } from "lucide-react";
import type { RmaBuscaEtiquetaResultado, RmaOpcoesPorTipo, RmaProtocolo } from "./types";
import { rmaApi } from "./rmaApi";
import { OpcaoBadge, Panel, dt } from "./ui";

export default function EtiquetaTab({ opcoes, onAtualizado, onAbrirLista }: { opcoes: RmaOpcoesPorTipo | null; onAtualizado: () => void; onAbrirLista: () => void }) {
  const [numero, setNumero] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<RmaBuscaEtiquetaResultado | null>(null);
  const [selecionado, setSelecionado] = useState<RmaProtocolo | null>(null);
  const [campoSelecionado, setCampoSelecionado] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = async () => {
    if (!numero.trim()) return;
    setBuscando(true);
    setSelecionado(null);
    try {
      const r = await rmaApi.buscarEtiqueta(numero);
      setResultado(r);
      if (r.resultado === "encontrado_unico") {
        setSelecionado(r.correspondencias[0].protocolo);
        setCampoSelecionado(r.correspondencias[0].campo);
      }
    } finally {
      setBuscando(false);
    }
  };

  const confirmar = async (novoStatus: string) => {
    if (!selecionado) return;
    setConfirmando(true);
    try {
      await rmaApi.confirmarRecebimento(selecionado.id, novoStatus, numero, campoSelecionado);
      onAtualizado();
      setNumero("");
      setResultado(null);
      setSelecionado(null);
      inputRef.current?.focus();
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Panel title="Ler ou digitar etiqueta" subtitle="Aponte o leitor de código de barras ou digite o número e pressione Enter - nunca movimenta estoque.">
      <div className="rma-scanner">
        <ScanLine size={22} />
        <input
          ref={inputRef}
          autoFocus
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
          placeholder="Número do envio, reversa, rastreio, pedido ou sistema…"
        />
        <button className="primary" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {resultado?.resultado === "nao_encontrado" && (
        <div className="empty">
          <XCircle size={30} color="#cf5b15" />
          <p>Nenhum protocolo encontrado com o número "{numero}".</p>
          <button className="secondary" onClick={onAbrirLista}>
            <PackageSearch size={16} /> Buscar manualmente na lista
          </button>
        </div>
      )}

      {resultado?.resultado === "encontrado_multiplo" && !selecionado && (
        <div>
          <p>Mais de um protocolo corresponde a esse número - selecione o correto:</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº protocolo</th>
                  <th>Cliente</th>
                  <th>Campo correspondido</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resultado.correspondencias.map((c) => (
                  <tr key={c.protocolo.id}>
                    <td className="code">{c.protocolo.numero_protocolo}</td>
                    <td>{c.protocolo.cliente_nome}</td>
                    <td>{c.campoRotulo}</td>
                    <td>
                      <OpcaoBadge opcoesLista={opcoes?.status} valor={c.protocolo.status} />
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          setSelecionado(c.protocolo);
                          setCampoSelecionado(c.campo);
                        }}
                      >
                        Selecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selecionado && (
        <div className="detail-meta">
          <CheckCircle2 size={20} color="#0caf65" style={{ gridColumn: "1 / -1" }} />
          <div>
            <span>Protocolo</span>
            <b>{selecionado.numero_protocolo}</b>
          </div>
          <div>
            <span>Cliente</span>
            <b>{selecionado.cliente_nome}</b>
          </div>
          <div>
            <span>Status atual</span>
            <b>
              <OpcaoBadge opcoesLista={opcoes?.status} valor={selecionado.status} />
            </b>
          </div>
          <div>
            <span>Aberto em</span>
            <b>{dt(selecionado.data_abertura)}</b>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 9, marginTop: 8 }}>
            <button className="secondary" onClick={() => confirmar("recebido")} disabled={confirmando}>
              Marcar Recebido
            </button>
            <button className="primary" onClick={() => confirmar("em_conferencia")} disabled={confirmando}>
              Marcar Em conferência
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
