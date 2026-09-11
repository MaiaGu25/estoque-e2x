import { useEffect, useState } from "react";
import { ArrowLeft, Ban, CheckCircle2, PackageCheck, Play, TriangleAlert, Truck } from "lucide-react";
import { api, ApiError } from "../api";
import { Badge } from "../Badge";
import type { MktOrderDetail } from "./types";
import { Empty, MARKETPLACE_LABEL, OrigemBadge, Panel, PrazoBadge, StatusBadge, VinculacaoBadge, dt, fmt, fmtMoeda } from "./ui";
import FotoProduto from "./FotoProduto";

export default function PedidoDetalhe({
  id,
  refreshKey,
  onVoltar,
  onAtualizado,
}: {
  id: number;
  refreshKey: number;
  onVoltar: () => void;
  onAtualizado: () => void;
}) {
  const [dados, setDados] = useState<MktOrderDetail | null>(null);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    try {
      const r = await api.get<MktOrderDetail>(`/api/marketplace/pedidos/${id}`);
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
  const { pedido, itens, alertas, eventos, auditoria } = dados;
  const situacaoPrazo = typeof pedido.situacao_prazo === "string" ? pedido.situacao_prazo : pedido.situacao_prazo.situacao;
  const encerrado = ["cancelado", "devolvido", "entregue"].includes(pedido.status_interno);

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

  const marcarSeparado = (itemId: number, pendente: number) => {
    const valor = window.prompt(`Quantas unidades separar (pendente: ${pendente})?`, String(pendente));
    if (!valor) return;
    acao(() => api.post(`/api/marketplace/pedidos/${id}/itens/${itemId}/separar`, { quantidade: Number(valor) }));
  };

  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento:");
    if (motivo === null) return;
    acao(() => api.post(`/api/marketplace/pedidos/${id}/cancelar`, { motivo }));
  };

  const expedir = () => {
    if (!window.confirm("Confirmar a expedição? Isso baixa o estoque geral definitivamente.")) return;
    acao(() => api.post(`/api/marketplace/pedidos/${id}/expedir`));
  };

  return (
    <div>
      <button className="secondary" onClick={onVoltar} style={{ marginBottom: 12 }}>
        <ArrowLeft size={15} /> Voltar para a fila
      </button>

      <Panel
        title={pedido.numero_visivel || pedido.id_externo}
        subtitle={`${MARKETPLACE_LABEL[pedido.marketplace]} · ${pedido.conta_apelido || pedido.conta_nome}${pedido.comprador_nome ? " · " + pedido.comprador_nome : ""}`}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <StatusBadge status={pedido.status_interno} />
          <PrazoBadge situacao={situacaoPrazo} />
          <OrigemBadge origem={pedido.origem} />
        </div>

        <div className="detail-meta">
          <div>
            <span>Status externo</span>
            <b>{pedido.status_externo || "-"}</b>
          </div>
          <div>
            <span>Data da compra</span>
            <b>{dt(pedido.data_compra)}</b>
          </div>
          <div>
            <span>Prazo de envio</span>
            <b>{dt(pedido.prazo_envio)}</b>
          </div>
          <div>
            <span>Valor total</span>
            <b>{fmtMoeda(pedido.valor_total)}</b>
          </div>
          <div>
            <span>Frete</span>
            <b>{fmtMoeda(pedido.frete)}</b>
          </div>
          <div>
            <span>Importado em</span>
            <b>{dt(pedido.importado_em)}</b>
          </div>
        </div>

        <div className="toolbar">
          {pedido.status_interno === "aguardando_separacao" && (
            <button className="primary" onClick={() => acao(() => api.post(`/api/marketplace/pedidos/${id}/iniciar-separacao`))}>
              <Play size={15} /> Iniciar separação
            </button>
          )}
          {pedido.status_interno === "separado" && (
            <button className="secondary" onClick={() => acao(() => api.post(`/api/marketplace/pedidos/${id}/encaminhar-expedicao`))}>
              <Truck size={15} /> Encaminhar para expedição
            </button>
          )}
          {(pedido.status_interno === "aguardando_expedicao" || pedido.status_interno === "separado") && (
            <button className="primary" onClick={expedir}>
              <PackageCheck size={15} /> Confirmar expedição
            </button>
          )}
          {pedido.status_interno === "enviado" && (
            <button className="secondary" onClick={() => acao(() => api.post(`/api/marketplace/pedidos/${id}/entregue`))}>
              Marcar como entregue
            </button>
          )}
          {!encerrado && (
            <button className="secondary" onClick={cancelar} style={{ color: "#b3311e" }}>
              <Ban size={15} /> Cancelar
            </button>
          )}
        </div>

        {erro && <div className="error">{erro}</div>}

        <h3 style={{ marginTop: 18 }}>Itens ({itens.length})</h3>
        <div className="cart">
          {itens.map((item) => {
            const pendenteSeparar = item.quantidade - item.quantidade_separada;
            return (
              <div key={item.id} className="cart-row" style={{ gridTemplateColumns: "auto 1fr auto auto" }}>
                <FotoProduto sku={item.sku_interno || item.sku_externo} />
                <span>
                  <b>{item.sku_interno || item.sku_externo || "(sem SKU)"}</b>
                  <small>
                    {item.titulo_recebido}
                    {item.variacao_texto ? ` · ${item.variacao_texto}` : ""}
                  </small>
                  <VinculacaoBadge status={item.status_vinculacao} />
                </span>
                <span>
                  {fmt(item.quantidade_separada)}/{fmt(item.quantidade)} separado(s)
                  <br />
                  <small>reservado: {fmt(item.quantidade_reservada)}</small>
                </span>
                {!encerrado && pedido.status_interno === "em_separacao" && pendenteSeparar > 0 && (
                  <button className="secondary" onClick={() => marcarSeparado(item.id, pendenteSeparar)}>
                    Marcar separado
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!!alertas.length && (
          <>
            <h3 style={{ marginTop: 18 }}>Alertas deste pedido</h3>
            <div className="cart">
              {alertas.map((a) => (
                <div key={a.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    <b>{a.titulo}</b>
                    <small>{a.descricao}</small>
                  </span>
                  <Badge icon={a.status === "resolvido" ? CheckCircle2 : TriangleAlert} tone={a.status === "resolvido" ? "ok" : "warn"}>
                    {a.status}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 style={{ marginTop: 18 }}>Histórico de sincronização</h3>
        {!eventos.length && <Empty text="Nenhum evento de sincronização registrado para este pedido." />}
        <div className="cart">
          {eventos.map((e) => (
            <div key={e.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>
                <b>{e.tipo}</b>
                <small>{e.detalhe}</small>
              </span>
              <small>{dt(e.created_at)}</small>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 18 }}>Auditoria</h3>
        {!auditoria.length && <Empty text="Nenhum evento de auditoria ainda." />}
        <div className="cart">
          {auditoria.map((a) => (
            <div key={a.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>
                <b>{a.action}</b>
                <small>{a.user_name}</small>
              </span>
              <small>{dt(a.created_at)}</small>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
