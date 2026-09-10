import { useEffect, useState } from "react";
import { Boxes, Camera, HardDrive, ImageOff, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { CfDiagnostico, CfVisaoGeral } from "./types";
import { centralFotosApi } from "./api";
import { dt, Empty, fmtBytes } from "./ui";

function Stat({ icon: Icon, label, value, alert }: { icon: any; label: string; value: string; alert?: boolean }) {
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function VisaoGeralTab({ isAdmin, refreshKey }: { isAdmin: boolean; refreshKey: number }) {
  const [dados, setDados] = useState<CfVisaoGeral | null>(null);
  const [diagnostico, setDiagnostico] = useState<CfDiagnostico | null>(null);
  const [rodandoDiagnostico, setRodandoDiagnostico] = useState(false);
  const [limpandoLixeira, setLimpandoLixeira] = useState(false);
  const [msgManutencao, setMsgManutencao] = useState("");

  const carregar = () => {
    centralFotosApi.visaoGeral().then(setDados).catch(() => {});
  };
  useEffect(carregar, [refreshKey]);

  const rodarDiagnostico = async () => {
    setRodandoDiagnostico(true);
    setMsgManutencao("");
    try {
      setDiagnostico(await centralFotosApi.diagnostico());
    } catch (e) {
      setMsgManutencao(e instanceof Error ? e.message : "Não foi possível rodar o diagnóstico.");
    } finally {
      setRodandoDiagnostico(false);
    }
  };

  const limparLixeira = async () => {
    if (!confirm("Remover permanentemente as fotos na lixeira que já passaram do prazo de recuperação? Essa ação não pode ser desfeita.")) return;
    setLimpandoLixeira(true);
    setMsgManutencao("");
    try {
      const r = await centralFotosApi.limparLixeira();
      setMsgManutencao(`${r.removidas} foto${r.removidas === 1 ? "" : "s"} removida${r.removidas === 1 ? "" : "s"} definitivamente.`);
      carregar();
    } catch (e) {
      setMsgManutencao(e instanceof Error ? e.message : "Não foi possível limpar a lixeira.");
    } finally {
      setLimpandoLixeira(false);
    }
  };

  if (!dados) {
    return (
      <div className="loading">
        <RefreshCw className="spin" />
      </div>
    );
  }

  const espacoTotal = dados.espacoOriginaisBytes + dados.espacoOtimizadasBytes + dados.espacoMiniaturasBytes;

  return (
    <section>
      <div className="stats">
        <Stat icon={Boxes} label="Produtos cadastrados" value={String(dados.produtosCadastrados)} />
        <Stat icon={Camera} label="Produtos com foto" value={String(dados.produtosComFoto)} />
        <Stat icon={ImageOff} label="Produtos sem foto" value={String(dados.produtosSemFoto)} alert={!!dados.produtosSemFoto} />
        <Stat icon={HardDrive} label="Espaço ocupado" value={fmtBytes(espacoTotal)} />
      </div>

      <div className="grid-two">
        <Panel title="Últimos envios">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Arquivo</th>
                  <th>Enviado por</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {dados.ultimosEnvios.map((e) => (
                  <tr key={e.imagemId}>
                    <td>
                      <b className="code">{e.sku}</b>
                      <small>{e.produtoNome}</small>
                    </td>
                    <td>{e.nomeOriginal}</td>
                    <td>{e.criadoPor}</td>
                    <td>{dt(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dados.ultimosEnvios.length && <Empty text="Nenhuma foto enviada ainda." />}
          </div>
        </Panel>
        <Panel title="Espaço em disco">
          <div className="reason-list">
            <div className="reason">
              <div>
                <span>Originais</span>
                <b>{fmtBytes(dados.espacoOriginaisBytes)}</b>
              </div>
              <div className="bar">
                <i style={{ width: `${espacoTotal ? (dados.espacoOriginaisBytes / espacoTotal) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="reason">
              <div>
                <span>Otimizadas</span>
                <b>{fmtBytes(dados.espacoOtimizadasBytes)}</b>
              </div>
              <div className="bar">
                <i style={{ width: `${espacoTotal ? (dados.espacoOtimizadasBytes / espacoTotal) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="reason">
              <div>
                <span>Miniaturas</span>
                <b>{fmtBytes(dados.espacoMiniaturasBytes)}</b>
              </div>
              <div className="bar">
                <i style={{ width: `${espacoTotal ? (dados.espacoMiniaturasBytes / espacoTotal) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {isAdmin && (
        <Panel title="Manutenção">
          <div style={{ padding: "0 21px 21px", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="secondary" onClick={rodarDiagnostico} disabled={rodandoDiagnostico}>
              <ShieldCheck size={15} /> {rodandoDiagnostico ? "Verificando…" : "Verificar consistência dos arquivos"}
            </button>
            <button className="secondary" onClick={limparLixeira} disabled={limpandoLixeira}>
              <Trash2 size={15} /> {limpandoLixeira ? "Limpando…" : "Limpar lixeira expirada"}
            </button>
          </div>
          {msgManutencao && (
            <p className="cart-empty" style={{ textAlign: "left", padding: "0 21px 14px" }}>
              {msgManutencao}
            </p>
          )}
          {diagnostico && (
            <div className="table-wrap" style={{ padding: "0 21px 21px" }}>
              {[
                diagnostico.imagensSemArquivoOriginal.length === 0 &&
                  diagnostico.imagensSemOtimizada.length === 0 &&
                  diagnostico.imagensSemMiniatura.length === 0 &&
                  diagnostico.hashesDuplicados.length === 0 &&
                  !diagnostico.arquivosOrfaos.original.length &&
                  !diagnostico.arquivosOrfaos.otimizada.length &&
                  !diagnostico.arquivosOrfaos.miniatura.length && <p key="ok">Nenhuma inconsistência encontrada.</p>,
                diagnostico.imagensSemArquivoOriginal.length > 0 && (
                  <p key="a">Imagens sem arquivo original: {diagnostico.imagensSemArquivoOriginal.join(", ")}</p>
                ),
                diagnostico.imagensSemOtimizada.length > 0 && <p key="b">Imagens sem versão otimizada: {diagnostico.imagensSemOtimizada.join(", ")}</p>,
                diagnostico.imagensSemMiniatura.length > 0 && <p key="c">Imagens sem miniatura: {diagnostico.imagensSemMiniatura.join(", ")}</p>,
                diagnostico.hashesDuplicados.length > 0 && <p key="d">Hashes duplicados no mesmo produto: {diagnostico.hashesDuplicados.length}</p>,
                (diagnostico.arquivosOrfaos.original.length ||
                  diagnostico.arquivosOrfaos.otimizada.length ||
                  diagnostico.arquivosOrfaos.miniatura.length) && (
                  <p key="e">
                    Arquivos órfãos (sem registro no banco): {diagnostico.arquivosOrfaos.original.length + diagnostico.arquivosOrfaos.otimizada.length + diagnostico.arquivosOrfaos.miniatura.length}
                  </p>
                ),
              ]}
            </div>
          )}
        </Panel>
      )}
    </section>
  );
}
