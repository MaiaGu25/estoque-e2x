import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { ApiError } from "../api";
import { rmaApi } from "./rmaApi";
import { Empty, Panel } from "./ui";

type LinhaPrevia = { numeroLinha: number; dados: Record<string, string>; erros: string[] };

export default function ExcelTab({ onAtualizado }: { onAtualizado: () => void }) {
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [previa, setPrevia] = useState<{ total: number; validas: number; invalidas: LinhaPrevia[]; linhas: LinhaPrevia[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const escolherArquivo = (arquivo: File) => {
    setErro("");
    setSucesso("");
    setPrevia(null);
    setNomeArquivo(arquivo.name);
    const leitor = new FileReader();
    leitor.onload = () => setArquivoBase64(String(leitor.result));
    leitor.readAsDataURL(arquivo);
  };

  const préVisualizar = async () => {
    if (!arquivoBase64) return;
    setCarregando(true);
    setErro("");
    try {
      const r = await rmaApi.importarPreVisualizar(arquivoBase64);
      setPrevia(r);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível ler a planilha.");
    } finally {
      setCarregando(false);
    }
  };

  const confirmarImportacao = async () => {
    if (!arquivoBase64) return;
    setCarregando(true);
    setErro("");
    try {
      const r = await rmaApi.importarConfirmar(arquivoBase64);
      setSucesso(`${r.criados.length} protocolo(s) importado(s) com sucesso.`);
      setPrevia(null);
      setArquivoBase64(null);
      setNomeArquivo("");
      onAtualizado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível confirmar a importação.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      <Panel title="Exportar protocolos" subtitle="Gera uma planilha com os protocolos que atendem aos filtros usados na lista.">
        <button className="secondary" onClick={() => window.open("/api/rma/excel/exportar", "_blank")}>
          <FileSpreadsheet size={16} /> Exportar para Excel
        </button>
      </Panel>

      <Panel title="Importar protocolos" subtitle="Cadastra vários protocolos de uma vez a partir de uma planilha. Sempre mostra uma prévia antes de confirmar - nada é gravado sem sua confirmação.">
        <div className="toolbar">
          <button className="secondary" onClick={() => window.open("/api/rma/excel/modelo", "_blank")}>
            <Download size={16} /> Baixar modelo
          </button>
          <label className="secondary" style={{ cursor: "pointer" }}>
            <Upload size={16} /> Escolher planilha
            <input
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && escolherArquivo(e.target.files[0])}
            />
          </label>
          {nomeArquivo && <span style={{ alignSelf: "center" }}>{nomeArquivo}</span>}
          {arquivoBase64 && !previa && (
            <button className="primary" onClick={préVisualizar} disabled={carregando}>
              {carregando ? "Lendo…" : "Pré-visualizar"}
            </button>
          )}
        </div>

        {erro && <div className="error">{erro}</div>}
        {sucesso && <div className="detail-meta"><b>{sucesso}</b></div>}

        {previa && (
          <div>
            <p>
              {previa.total} linha(s) lida(s) · {previa.validas} válida(s) · {previa.invalidas.length} inválida(s)
            </p>
            {!previa.linhas.length && <Empty text="A planilha não tem nenhuma linha de dados." />}
            {!!previa.linhas.length && (
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Cliente</th>
                      <th>Nº do pedido</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.linhas.map((l) => (
                      <tr key={l.numeroLinha}>
                        <td>{l.numeroLinha}</td>
                        <td>{l.dados.clienteNome}</td>
                        <td>{l.dados.numeroPedido}</td>
                        <td>
                          {l.erros.length ? (
                            <span className="status warn">{l.erros.join(" ")}</span>
                          ) : (
                            <span className="status ok">Válida</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="primary" onClick={confirmarImportacao} disabled={carregando || !previa.validas || !!previa.invalidas.length}>
              {carregando ? "Importando…" : "Confirmar importação"}
            </button>
            {!!previa.invalidas.length && <p className="field-hint">Corrija as linhas inválidas na planilha e envie novamente - a importação só é feita quando todas as linhas estão válidas.</p>}
          </div>
        )}
      </Panel>
    </>
  );
}
