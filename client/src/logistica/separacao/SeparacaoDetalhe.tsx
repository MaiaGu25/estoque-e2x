import { useEffect, useState } from "react";
import { ArrowLeft, Ban, PackageCheck, Pause, Play, PlusCircle, Truck } from "lucide-react";
import { api, ApiError } from "../../api";
import type { LogEvento, LogPedidoSaida, LogPedidoSaidaItem, LogSeparacaoDivergencia } from "../../types";
import { Empty, Panel, dt } from "../ui";
import { CANAL_LABEL, DIVERGENCIA_SEPARACAO_TIPO_LABEL, PEDIDO_STATUS_CLASS, PEDIDO_STATUS_LABEL } from "./ui";
import SeparacaoItemLinha from "./SeparacaoItemLinha";

type Detalhe = { pedido: LogPedidoSaida; itens: LogPedidoSaidaItem[]; divergencias: LogSeparacaoDivergencia[]; eventos: LogEvento[] };

const TIPOS_DIVERGENCIA = Object.keys(DIVERGENCIA_SEPARACAO_TIPO_LABEL) as (keyof typeof DIVERGENCIA_SEPARACAO_TIPO_LABEL)[];

export default function SeparacaoDetalhe({
  id,
  isAdmin,
  refreshKey,
  onVoltar,
  onAtualizado,
}: {
  id: number;
  isAdmin: boolean;
  refreshKey: number;
  onVoltar: () => void;
  onAtualizado: () => void;
}) {
  const [dados, setDados] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState("");
  const [novaDivergenciaAberta, setNovaDivergenciaAberta] = useState(false);
  const [tipoDivergencia, setTipoDivergencia] = useState<keyof typeof DIVERGENCIA_SEPARACAO_TIPO_LABEL>("outro");
  const [descricaoDivergencia, setDescricaoDivergencia] = useState("");
  const [permitirPendencias, setPermitirPendencias] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get<Detalhe>(`/api/logistica/separacao/${id}`);
      setDados(r);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível carregar o pedido.");
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey]);

  if (!dados) return <p className="cart-empty">{erro || "Carregando…"}</p>;
  const { pedido, itens, divergencias, eventos } = dados;
  const encerrado = pedido.status === "expedido" || pedido.status === "cancelado";
  const pendentes = itens.filter((i) => i.quantidade_separada < i.quantidade_solicitada);
  const divergenciasAbertas = divergencias.filter((d) => d.status === "aberta");

  const acao = async (fn: () => Promise<unknown>) => {
    setErro("");
    try {
      await fn();
      onAtualizado();
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível completar a ação.");
    }
  };

  const registrarDivergencia = () =>
    acao(async () => {
      if (!descricaoDivergencia.trim()) throw new ApiError("Descreva a divergência.");
      await api.post(`/api/logistica/separacao/${id}/divergencias`, { tipo: tipoDivergencia, descricao: descricaoDivergencia });
      setNovaDivergenciaAberta(false);
      setDescricaoDivergencia("");
    });

  const resolverDivergencia = (divId: number) => {
    const resolucao = window.prompt("Como essa divergência foi resolvida?");
    if (!resolucao) return;
    acao(() => api.patch(`/api/logistica/separacao/${id}/divergencias/${divId}/resolver`, { resolucao }));
  };

  const finalizar = () => acao(() => api.post(`/api/logistica/separacao/${id}/finalizar`, { permitirPendencias }));
  const encaminharExpedicao = () => acao(() => api.post(`/api/logistica/separacao/${id}/encaminhar-expedicao`));
  const expedir = () => {
    if (!window.confirm(`Confirmar a expedição do pedido ${pedido.numero}? Essa ação baixa o estoque definitivamente.`)) return;
    acao(() => api.post(`/api/logistica/separacao/${id}/expedir`));
  };
  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento (tudo que foi separado volta para a posição de origem):");
    if (motivo === null) return;
    acao(() => api.post(`/api/logistica/separacao/${id}/cancelar`, { motivo }));
  };

  return (
    <div>
      <button className="secondary" onClick={onVoltar} style={{ marginBottom: 12 }}>
        <ArrowLeft size={15} /> Voltar para a fila
      </button>

      <Panel
        title={pedido.numero}
        subtitle={`${CANAL_LABEL[pedido.canal]}${pedido.cliente_nome ? " · " + pedido.cliente_nome : ""}${pedido.vendedor ? " · " + pedido.vendedor : ""}`}
      >
        <div style={{ marginBottom: 10 }}>
          <span className={`status ${PEDIDO_STATUS_CLASS[pedido.status]}`}>{PEDIDO_STATUS_LABEL[pedido.status]}</span>
        </div>

        <div className="toolbar">
          {pedido.status === "aguardando_separacao" && (
            <button className="primary" onClick={() => acao(() => api.post(`/api/logistica/separacao/${id}/iniciar`))}>
              <Play size={15} /> Iniciar separação
            </button>
          )}
          {(pedido.status === "em_separacao" || pedido.status === "com_divergencia") && (
            <button className="secondary" onClick={() => acao(() => api.post(`/api/logistica/separacao/${id}/pausar`))}>
              <Pause size={15} /> Pausar
            </button>
          )}
          {pedido.status === "separado" && (
            <button className="secondary" onClick={encaminharExpedicao}>
              <Truck size={15} /> Encaminhar para expedição
            </button>
          )}
          {(pedido.status === "aguardando_expedicao" || pedido.status === "separado") && (
            <button className="primary" onClick={expedir}>
              <PackageCheck size={15} /> Confirmar expedição
            </button>
          )}
          {!encerrado && (
            <button className="secondary" onClick={() => setNovaDivergenciaAberta((v) => !v)}>
              <PlusCircle size={15} /> Registrar divergência
            </button>
          )}
          {!encerrado && isAdmin && (
            <button className="secondary" onClick={cancelar} style={{ color: "#b3311e" }}>
              <Ban size={15} /> Cancelar
            </button>
          )}
        </div>

        {novaDivergenciaAberta && (
          <div className="cart" style={{ padding: 12, marginBottom: 12 }}>
            <div className="form-grid">
              <label className="field">
                <span>Tipo</span>
                <select value={tipoDivergencia} onChange={(e) => setTipoDivergencia(e.target.value as any)}>
                  {TIPOS_DIVERGENCIA.map((t) => (
                    <option key={t} value={t}>
                      {DIVERGENCIA_SEPARACAO_TIPO_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Descrição</span>
                <input value={descricaoDivergencia} onChange={(e) => setDescricaoDivergencia(e.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={registrarDivergencia}>
                Registrar
              </button>
            </div>
          </div>
        )}

        {erro && <div className="error">{erro}</div>}

        <h3 style={{ marginTop: 18 }}>Itens ({itens.length})</h3>
        {itens.map((item) => (
          <SeparacaoItemLinha key={item.id} item={item} pedidoId={id} isAdmin={isAdmin} bloqueado={encerrado || pedido.status === "aguardando_separacao"} onConfirmado={() => acao(carregar)} />
        ))}

        {!!divergencias.length && (
          <>
            <h3 style={{ marginTop: 18 }}>Divergências ({divergenciasAbertas.length} aberta(s))</h3>
            <div className="cart">
              {divergencias.map((d) => (
                <div key={d.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    <b>{DIVERGENCIA_SEPARACAO_TIPO_LABEL[d.tipo]}</b>
                    {d.product_code ? ` · ${d.product_code}` : ""}
                    <small>{d.descricao}</small>
                    {d.status === "resolvida" && <small>Resolvida: {d.resolucao}</small>}
                  </span>
                  {d.status === "aberta" ? (
                    isAdmin ? (
                      <button className="secondary" onClick={() => resolverDivergencia(d.id)}>
                        Resolver
                      </button>
                    ) : (
                      <span className="status warn">Aberta</span>
                    )
                  ) : (
                    <span className="status ok">Resolvida</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {!encerrado && ["em_separacao", "separado_parcialmente", "com_divergencia"].includes(pedido.status) && (
          <div style={{ marginTop: 18, borderTop: "1px solid #e6ece8", paddingTop: 14 }}>
            {pendentes.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={permitirPendencias} onChange={(e) => setPermitirPendencias(e.target.checked)} disabled={!isAdmin} />
                Finalizar mesmo com {pendentes.length} item(ns) pendente(s) {!isAdmin && "(requer administrador)"}
              </label>
            )}
            <button className="primary" onClick={finalizar} disabled={!!divergenciasAbertas.length}>
              Finalizar separação
            </button>
            {!!divergenciasAbertas.length && <p className="cart-empty">Resolva as divergências abertas antes de finalizar.</p>}
          </div>
        )}

        <h3 style={{ marginTop: 18 }}>Histórico de eventos</h3>
        {!eventos.length && <Empty text="Nenhum evento registrado." />}
        <div className="cart">
          {eventos.map((e) => (
            <div key={e.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>
                <b>{e.descricao}</b>
                <small>{e.user_name}</small>
              </span>
              <small>{dt(e.created_at)}</small>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
