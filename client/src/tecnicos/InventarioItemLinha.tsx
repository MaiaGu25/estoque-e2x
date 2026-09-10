import { useState } from "react";
import { CornerUpLeft, Plus, RotateCcw, X } from "lucide-react";
import type { TecInventarioDetalhe, TecInventarioItem, TecInventarioModo } from "../types";
import { fmtSinal, SituacaoBadge } from "./ui";
import { inventarioApi } from "./inventarioApi";

// Uma linha da lista de contagem: cuida sozinha de salvar cada ação
// (digitar valor final, somar parcela, desfazer, zerar) e avisa o pai
// (onMutated) com o inventário inteiro já atualizado pelo servidor -
// saldo atual, diferença e situação sempre vêm prontos de lá, nunca
// calculados aqui.
export default function InventarioItemLinha({
  item,
  inventarioId,
  onMutated,
  registerInputRef,
  onFocusNext,
}: {
  item: TecInventarioItem;
  inventarioId: number;
  onMutated: (detalhe: TecInventarioDetalhe) => void;
  registerInputRef: (el: HTMLInputElement | null) => void;
  onFocusNext: () => void;
}) {
  const [modoLocal, setModoLocal] = useState<TecInventarioModo | null>(null);
  const modo = modoLocal ?? item.modo;
  const [valorFinal, setValorFinal] = useState(item.quantidadeContada !== null ? String(item.quantidadeContada) : "");
  const [valorParcela, setValorParcela] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [err, setErr] = useState("");

  const commitFinal = async (avancar: boolean) => {
    setErr("");
    const trimmed = valorFinal.trim();
    const valor = trimmed === "" ? null : Number(trimmed);
    if (valor !== null && (!Number.isInteger(valor) || valor < 0)) {
      setErr("Número inteiro ≥ 0.");
      return;
    }
    if (valor === item.quantidadeContada) {
      if (avancar) onFocusNext();
      return;
    }
    setSalvando(true);
    try {
      const r = await inventarioApi.definirContagemFinal(inventarioId, item.itemId, valor);
      onMutated(r);
      if (avancar) onFocusNext();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarParcela = async () => {
    setErr("");
    const valor = Number(valorParcela.trim());
    if (!Number.isInteger(valor) || valor <= 0) {
      setErr("Número inteiro maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      const r = await inventarioApi.somarContagem(inventarioId, item.itemId, valor);
      setValorParcela("");
      onMutated(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível somar.");
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async () => {
    setSalvando(true);
    setErr("");
    try {
      onMutated(await inventarioApi.desfazerUltimaContagem(inventarioId, item.itemId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível desfazer.");
    } finally {
      setSalvando(false);
    }
  };

  const zerar = async () => {
    setSalvando(true);
    setErr("");
    try {
      const r = await inventarioApi.zerarContagem(inventarioId, item.itemId);
      onMutated(r);
      setValorFinal("");
      setModoLocal(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível zerar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <tr>
      <td>
        <strong>{item.nome}</strong>
        <small>{item.categoria}</small>
      </td>
      <td className="num">
        <b>{item.saldoAtual}</b>
        {item.saldoAlterado && <small style={{ color: "#b66a00" }}>era {item.saldoInicial}</small>}
      </td>
      <td style={{ minWidth: 280 }}>
        <div className="segmented" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
          <button className={modo === "final" ? "active in" : ""} onClick={() => setModoLocal("final")} disabled={salvando}>
            Contagem final
          </button>
          <button className={modo === "soma" ? "active in" : ""} onClick={() => setModoLocal("soma")} disabled={salvando}>
            Somar aos poucos
          </button>
        </div>

        {modo === "final" ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              ref={registerInputRef}
              className="tec-inv-input"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="Qtd."
              value={valorFinal}
              disabled={salvando}
              onChange={(e) => setValorFinal(e.target.value)}
              onBlur={() => commitFinal(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitFinal(true);
                }
              }}
            />
            {item.contado && (
              <button className="icon-btn" title="Limpar contagem" onClick={() => { setValorFinal(""); commitFinal(false); }} disabled={salvando}>
                <X size={16} />
              </button>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input
                ref={registerInputRef}
                className="tec-inv-input"
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="Nova"
                value={valorParcela}
                disabled={salvando}
                onChange={(e) => setValorParcela(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarParcela();
                  }
                }}
              />
              <button className="secondary" onClick={adicionarParcela} disabled={salvando || !valorParcela.trim()}>
                <Plus size={15} /> Adicionar
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "#6f8279" }}>
              <span>
                Total somado: <b style={{ color: "#1b2b24" }}>{item.quantidadeContada ?? 0}</b>
              </span>
              {item.contagens.length > 0 && (
                <span>
                  Parcelas: {item.contagens.map((c) => c.valor).join(" + ")}
                </span>
              )}
              <button className="icon-btn" title="Desfazer última parcela" onClick={desfazer} disabled={salvando || !item.contagens.length}>
                <CornerUpLeft size={15} />
              </button>
              <button className="icon-btn" title="Zerar contagem" onClick={zerar} disabled={salvando || !item.contagens.length}>
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        )}
        {err && <small style={{ color: "#b83224", display: "block", marginTop: 4 }}>{err}</small>}
      </td>
      <td className="num">{item.diferenca === null ? "—" : fmtSinal(item.diferenca)}</td>
      <td>
        <SituacaoBadge situacao={item.situacao} />
      </td>
    </tr>
  );
}
