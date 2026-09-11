import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import type { TecInventarioDetalhe, TecInventarioResumoHistorico } from "../types";
import { Badge, type BadgeTone } from "../Badge";
import { dt, Empty, fmtSinal, Modal, SituacaoBadge } from "./ui";
import { inventarioApi } from "./inventarioApi";

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  em_andamento: "warn",
  concluido: "ok",
  cancelado: "neutral",
};
const STATUS_ICON: Record<string, typeof RefreshCw> = {
  em_andamento: RefreshCw,
  concluido: CheckCircle2,
  cancelado: XCircle,
};

// Inventários já finalizados/cancelados não têm botão de editar nem
// excluir aqui de propósito - só existe leitura, igual pedido.
export default function InventarioHistorico({ refreshKey }: { refreshKey: number }) {
  const [inventarios, setInventarios] = useState<TecInventarioResumoHistorico[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = () => {
    inventarioApi.listarHistorico().then((r) => setInventarios(r.inventarios)).catch(() => {});
  };
  useEffect(carregar, [refreshKey]);

  return (
    <section>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Número</th>
              <th>Status</th>
              <th>Criado por</th>
              <th>Finalizado por</th>
              <th>Início</th>
              <th>Conclusão</th>
              <th className="num">Contados</th>
              <th className="num">Divergências</th>
            </tr>
          </thead>
          <tbody>
            {inventarios.map((inv) => (
              <tr key={inv.id} onClick={() => setAberto(inv.id)} style={{ cursor: "pointer" }}>
                <td>
                  <b className="code">{inv.numero}</b>
                </td>
                <td>
                  <Badge icon={STATUS_ICON[inv.status]} tone={STATUS_TONE[inv.status]}>
                    {STATUS_LABEL[inv.status]}
                  </Badge>
                </td>
                <td>{inv.createdByNome || "—"}</td>
                <td>{inv.finalizedByNome || "—"}</td>
                <td>{dt(inv.createdAt)}</td>
                <td>{inv.concludedAt ? dt(inv.concludedAt) : "—"}</td>
                <td className="num">
                  {inv.produtosContados}/{inv.totalProdutos}
                </td>
                <td className="num">{inv.divergencias}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!inventarios.length && <Empty text="Nenhum inventário registrado ainda." />}
      </div>

      {aberto !== null && <DetalheInventarioModal id={aberto} onClose={() => setAberto(null)} />}
    </section>
  );
}

function DetalheInventarioModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [detalhe, setDetalhe] = useState<TecInventarioDetalhe | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    inventarioApi
      .buscar(id)
      .then(setDetalhe)
      .catch((e) => setErr(e instanceof Error ? e.message : "Não foi possível carregar o inventário."));
  }, [id]);

  if (!detalhe) {
    return (
      <Modal title="Carregando…" onClose={onClose}>
        {err ? <div className="error">{err}</div> : <div className="loading" style={{ minHeight: 160 }}><RefreshCw className="spin" /></div>}
      </Modal>
    );
  }

  const { inventario, itens, resumo } = detalhe;
  const contados = itens.filter((i) => i.contado);

  return (
    <Modal
      title={inventario.numero}
      subtitle={`${STATUS_LABEL[inventario.status]} · criado por ${inventario.createdByNome || "—"} em ${dt(inventario.createdAt)}${
        inventario.concludedAt ? ` · concluído em ${dt(inventario.concludedAt)} por ${inventario.finalizedByNome || "—"}` : ""
      }`}
      onClose={onClose}
      wide
    >
      {inventario.motivo && (
        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 8px" }}>
          Motivo: {inventario.motivo}
        </p>
      )}
      {inventario.observacao && (
        <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 14px" }}>
          Observação: {inventario.observacao}
        </p>
      )}

      <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 0 }}>
        <div className="stat">
          <div>
            <span>Total</span>
            <strong>{resumo.total}</strong>
          </div>
        </div>
        <div className="stat">
          <div>
            <span>Contados</span>
            <strong>{resumo.contados}</strong>
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

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo anterior</th>
              <th className="num">Contado</th>
              <th className="num">Diferença</th>
              <th className="num">Saldo posterior</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {contados.map((i) => (
              <tr key={i.itemId}>
                <td>{i.nome}</td>
                <td className="num">{i.saldoAtual}</td>
                <td className="num">{i.quantidadeContada}</td>
                <td className="num">{i.diferenca === null ? "—" : fmtSinal(i.diferenca)}</td>
                <td className="num">{i.quantidadeContada}</td>
                <td>
                  <SituacaoBadge situacao={i.situacao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!contados.length && <Empty text="Nenhum produto foi contado nesse inventário." />}
      </div>

      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
