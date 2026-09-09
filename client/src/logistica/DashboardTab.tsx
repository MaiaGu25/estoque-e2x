import { useEffect, useState } from "react";
import { Boxes, ClipboardEdit, MapPin, PackageSearch, RefreshCw, TriangleAlert } from "lucide-react";
import { api } from "../api";
import type { LogDashboard, LogMovimentoResumo } from "../types";
import { dt, Empty, fmt, Panel, Stat } from "./ui";

function ListaMovimentos({ itens, vazio }: { itens: LogMovimentoResumo[]; vazio: string }) {
  if (!itens.length) return <Empty text={vazio} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto</th>
            <th>Qtd.</th>
            <th>De / Para</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((m) => (
            <tr key={m.id}>
              <td>{dt(m.created_at)}</td>
              <td>
                <b className="code">{m.product_code}</b>
                <small>{m.product_name}</small>
              </td>
              <td className="num">{fmt(m.quantity)}</td>
              <td>
                {m.from_position_code || "—"} {m.to_position_code ? `→ ${m.to_position_code}` : ""}
              </td>
              <td>{m.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardTab({ refreshKey }: { refreshKey: number }) {
  const [dados, setDados] = useState<LogDashboard | null>(null);

  useEffect(() => {
    api.get<LogDashboard>("/api/logistica/dashboard").then(setDados).catch(() => {});
  }, [refreshKey]);

  if (!dados) {
    return (
      <div className="loading">
        <RefreshSpin />
      </div>
    );
  }

  return (
    <section>
      <div className="stats">
        <Stat icon={PackageSearch} label="Produtos cadastrados" value={fmt(dados.produtosCadastrados)} />
        <Stat icon={Boxes} label="Unidades no galpão" value={fmt(dados.unidadesTotais)} />
        <Stat icon={TriangleAlert} label="Estoque baixo" value={fmt(dados.estoqueBaixo)} alert={dados.estoqueBaixo > 0} />
        <Stat icon={TriangleAlert} label="Sem estoque" value={fmt(dados.semEstoque)} alert={dados.semEstoque > 0} />
      </div>
      <div className="stats">
        <Stat icon={MapPin} label="Posições ocupadas" value={fmt(dados.posicoesOcupadas)} />
        <Stat icon={MapPin} label="Posições vazias" value={fmt(dados.posicoesVazias)} />
        <Stat icon={ClipboardEdit} label="Movimentações hoje" value={fmt(dados.registradasHoje)} />
        <Stat icon={MapPin} label="Total de posições" value={fmt(dados.posicoesTotais)} />
      </div>

      <div className="grid-two">
        <Panel title="Últimas movimentações">
          <ListaMovimentos itens={dados.ultimasMovimentacoes} vazio="Nenhuma movimentação registrada ainda." />
        </Panel>
        <Panel title="Entradas recentes">
          <ListaMovimentos itens={dados.entradasRecentes} vazio="Nenhuma entrada registrada ainda." />
        </Panel>
      </div>
      <div className="grid-two">
        <Panel title="Saídas recentes">
          <ListaMovimentos itens={dados.saidasRecentes} vazio="Nenhuma saída registrada ainda." />
        </Panel>
        <Panel title="Transferências recentes">
          <ListaMovimentos itens={dados.transferenciasRecentes} vazio="Nenhuma transferência registrada ainda." />
        </Panel>
      </div>
      <div className="grid-two">
        <Panel title="Ajustes de inventário recentes">
          <ListaMovimentos itens={dados.ajustesRecentes} vazio="Nenhum ajuste registrado ainda." />
        </Panel>
      </div>
    </section>
  );
}

function RefreshSpin() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#74887f" }}>
      <RefreshCw className="spin" />
      Carregando painel…
    </div>
  );
}
