import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { api, ApiError } from "../../api";
import type { LogPedidoSaidaItem, LogPosicaoSugestao } from "../../types";
import { fmt } from "../ui";
import FotoProduto from "./FotoProduto";

export default function SeparacaoItemLinha({
  item,
  pedidoId,
  isAdmin,
  bloqueado,
  onConfirmado,
}: {
  item: LogPedidoSaidaItem;
  pedidoId: number;
  isAdmin: boolean;
  bloqueado: boolean;
  onConfirmado: () => void;
}) {
  const pendente = item.quantidade_solicitada - item.quantidade_separada;
  const completo = pendente <= 0;
  const [aberto, setAberto] = useState(false);
  const [sugestoes, setSugestoes] = useState<LogPosicaoSugestao[] | null>(null);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState(String(Math.max(pendente, 1)));
  const [serial, setSerial] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    api.get<{ sugestoes: LogPosicaoSugestao[] }>(`/api/logistica/separacao/${pedidoId}/itens/${item.id}/sugestoes`).then((r) => {
      setSugestoes(r.sugestoes);
      if (r.sugestoes.length === 1) setPositionId(r.sugestoes[0].position_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const confirmar = async () => {
    setErro("");
    if (!positionId) return setErro("Escolha de qual posição retirar.");
    const qtd = item.exige_serial ? 1 : Number(quantidade) || 0;
    if (qtd <= 0) return setErro("Informe uma quantidade válida.");
    if (item.exige_serial && !serial.trim()) return setErro("Informe o número de série.");

    setSalvando(true);
    try {
      await api.post(`/api/logistica/separacao/${pedidoId}/itens/${item.id}/separar`, {
        positionId,
        quantidade: qtd,
        serial: item.exige_serial ? serial : undefined,
      });
      setSerial("");
      setSugestoes(null);
      onConfirmado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível registrar a separação.");
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async (alocacaoId: number) => {
    if (!window.confirm("Desfazer essa separação e devolver para a posição de origem?")) return;
    try {
      await api.del(`/api/logistica/separacao/alocacoes/${alocacaoId}`);
      onConfirmado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível desfazer.");
    }
  };

  return (
    <div className="cart" style={{ marginBottom: 10 }}>
      <button
        className="cart-row"
        style={{ width: "100%", textAlign: "left", gridTemplateColumns: "auto 1fr auto auto" }}
        onClick={() => !bloqueado && setAberto((v) => !v)}
      >
        <FotoProduto sku={item.product_code} />
        <span>
          <b>{item.product_code}</b>
          <small>
            {item.product_name}
            {item.variacao ? ` · ${item.variacao}` : ""}
            {item.exige_serial ? " · exige serial" : ""}
          </small>
        </span>
        <span>
          {fmt(item.quantidade_separada)} / {fmt(item.quantidade_solicitada)} {item.product_unit}
        </span>
        {completo ? <Check size={16} color="#1f8a52" /> : aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberto && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid #e6ece8" }}>
          {!!item.alocacoes?.length && (
            <div style={{ marginBottom: 10 }}>
              <small>Já retirado:</small>
              {item.alocacoes
                .filter((a) => !a.estornado)
                .map((a) => (
                  <div key={a.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <span>
                      {fmt(a.quantidade)} de {a.position_code}
                      {a.serial_valor ? ` · serial ${a.serial_valor}` : ""}
                      {a.expedido ? " · expedido" : ""}
                    </span>
                    {isAdmin && !a.expedido && !bloqueado && (
                      <button className="icon-btn" title="Desfazer" onClick={() => desfazer(a.id)}>
                        <Undo2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}

          {!bloqueado && !completo && (
            <>
              <small>Sugestão de posições (pendente: {fmt(pendente)}):</small>
              {sugestoes === null && <p className="cart-empty">Carregando sugestões…</p>}
              {sugestoes !== null && !sugestoes.length && <p className="cart-empty">Nenhuma posição com saldo desse produto.</p>}
              {sugestoes?.map((s) => (
                <label
                  key={s.position_id}
                  className="cart-row"
                  style={{ gridTemplateColumns: "auto 1fr auto", cursor: "pointer", background: positionId === s.position_id ? "#edf8f2" : undefined }}
                >
                  <input type="radio" name={`pos-${item.id}`} checked={positionId === s.position_id} onChange={() => setPositionId(s.position_id)} />
                  <span>
                    <b>
                      {s.rack_name} · {s.side_name} ({s.side_code})
                    </b>
                    <small>{s.position_code}</small>
                  </span>
                  <b>
                    {fmt(s.quantity)} {s.cobreSozinha ? "· cobre tudo" : ""}
                  </b>
                </label>
              ))}

              <div className="form-grid" style={{ marginTop: 10 }}>
                {!item.exige_serial && (
                  <label className="field">
                    <span>Quantidade a retirar</span>
                    <input type="number" min={1} max={pendente} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                  </label>
                )}
                {item.exige_serial && (
                  <label className="field">
                    <span>Número de série</span>
                    <input
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmar()}
                      placeholder="Escaneie ou digite o serial"
                    />
                  </label>
                )}
              </div>
              {erro && <div className="error">{erro}</div>}
              <div className="modal-actions">
                <button className="primary" onClick={confirmar} disabled={salvando}>
                  {salvando ? "Confirmando…" : "Confirmar retirada"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
