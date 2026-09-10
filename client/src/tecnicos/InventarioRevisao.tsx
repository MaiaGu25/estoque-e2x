import { useState } from "react";
import { ArrowLeft, ShieldAlert, TriangleAlert } from "lucide-react";
import { ApiError } from "../api";
import type { TecInventarioDetalhe, TecInventarioSaldoAlterado } from "../types";
import { Empty, fmtSinal } from "./ui";
import { inventarioApi } from "./inventarioApi";

// Passo de revisão: mostra o resumo e a lista de divergências antes de
// aplicar qualquer coisa no estoque. Nada aqui muda o banco - só a ação
// de "Finalizar" chama a API, e só depois de confirmação.
export default function InventarioRevisao({
  detalhe,
  onVoltar,
  onFinalizado,
}: {
  detalhe: TecInventarioDetalhe;
  onVoltar: () => void;
  onFinalizado: (detalhe: TecInventarioDetalhe) => void;
}) {
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState("");
  const [saldosAlterados, setSaldosAlterados] = useState<TecInventarioSaldoAlterado[] | null>(null);

  const { resumo, itens } = detalhe;
  const naoContados = itens.filter((i) => !i.contado);
  const divergencias = itens.filter((i) => i.contado && i.diferenca !== 0);

  const executarFinalizacao = async (aceitarSaldoAlterado: boolean) => {
    setFinalizando(true);
    setErro("");
    try {
      const atualizado = await inventarioApi.finalizar(detalhe.inventario.id, aceitarSaldoAlterado);
      onFinalizado(atualizado);
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "itensComSaldoAlterado" in e.body) {
        setSaldosAlterados((e.body as { itensComSaldoAlterado: TecInventarioSaldoAlterado[] }).itensComSaldoAlterado);
        setErro(e.message);
      } else {
        setErro(e instanceof Error ? e.message : "Não foi possível finalizar o inventário.");
      }
    } finally {
      setFinalizando(false);
    }
  };

  const finalizar = () => {
    const confirmado = confirm(
      "Você está prestes a aplicar os ajustes deste inventário ao estoque dos Técnicos. Essa ação criará registros permanentes no histórico. Deseja continuar?"
    );
    if (!confirmado) return;
    executarFinalizacao(false);
  };

  return (
    <section>
      <button className="secondary" onClick={onVoltar} style={{ marginBottom: 16 }} disabled={finalizando}>
        <ArrowLeft size={15} /> Voltar para a contagem
      </button>

      <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat">
          <div>
            <span>Total de produtos</span>
            <strong>{resumo.total}</strong>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Contados</span>
            <strong>{resumo.contados}</strong>
          </div>
        </div>
        <div className={resumo.naoContados ? "stat alert-stat" : "stat"}>
          <div>
            <span>Não contados</span>
            <strong>{resumo.naoContados}</strong>
          </div>
        </div>
      </div>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat">
          <div>
            <span>Sem diferença</span>
            <strong>{resumo.semDiferenca}</strong>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Com falta</span>
            <strong>{resumo.comFalta}</strong>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Com sobra</span>
            <strong>{resumo.comSobra}</strong>
          </div>
        </div>
      </div>

      {naoContados.length > 0 && (
        <div className="error" style={{ background: "#fff8e6", color: "#8a6100", borderColor: "#f5deA0" }}>
          <TriangleAlert size={18} />
          {naoContados.length} produto{naoContados.length === 1 ? "" : "s"} não {naoContados.length === 1 ? "foi contado" : "foram contados"} e não {naoContados.length === 1 ? "terá" : "terão"} o saldo alterado: {naoContados.map((i) => i.nome).join(", ")}.
        </div>
      )}

      {saldosAlterados && saldosAlterados.length > 0 && (
        <div className="error" style={{ marginBottom: 16 }}>
          <ShieldAlert size={18} />
          <div>
            <b>O saldo de {saldosAlterados.length} produto{saldosAlterados.length === 1 ? "" : "s"} mudou desde o início da contagem</b>
            <div className="table-card" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Saldo no início</th>
                    <th className="num">Saldo atual</th>
                    <th className="num">Você contou</th>
                  </tr>
                </thead>
                <tbody>
                  {saldosAlterados.map((s) => (
                    <tr key={s.itemId}>
                      <td>{s.nome}</td>
                      <td className="num">{s.saldoInicial}</td>
                      <td className="num">{s.saldoAtual}</td>
                      <td className="num">{s.quantidadeContada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 12 }}>
              Isso costuma acontecer quando uma entrada/saída manual foi registrada enquanto a contagem estava em andamento. O ajuste final sempre
              leva a contagem física como o resultado certo - revise se ela ainda está correta antes de confirmar mesmo assim.
            </p>
            <div className="modal-actions" style={{ borderTop: "none", paddingTop: 10 }}>
              <button className="primary" disabled={finalizando} onClick={() => executarFinalizacao(true)}>
                {finalizando ? "Finalizando…" : "Finalizar mesmo assim"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 8px" }}>
        Divergências encontradas
      </p>
      <div className="table-card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo anterior</th>
              <th className="num">Contado</th>
              <th className="num">Diferença</th>
              <th className="num">Saldo que será aplicado</th>
            </tr>
          </thead>
          <tbody>
            {divergencias.map((i) => (
              <tr key={i.itemId}>
                <td>{i.nome}</td>
                <td className="num">{i.saldoAtual}</td>
                <td className="num">{i.quantidadeContada}</td>
                <td className="num">{fmtSinal(i.diferenca as number)}</td>
                <td className="num">
                  <b>{i.quantidadeContada}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!divergencias.length && <Empty text="Nenhuma divergência - tudo bateu com o sistema." />}
      </div>

      {erro && !saldosAlterados && <div className="error">{erro}</div>}
      <div className="modal-actions" style={{ borderTop: "none", paddingTop: 0, justifyContent: "flex-start" }}>
        <button className="primary" disabled={finalizando} onClick={finalizar}>
          {finalizando ? "Finalizando…" : "Finalizar e ajustar estoque"}
        </button>
      </div>
    </section>
  );
}
