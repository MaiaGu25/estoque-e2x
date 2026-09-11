import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock5, PackageX, ShoppingCart,
  Truck, Wallet, XCircle,
} from "lucide-react";
import { api } from "../api";
import type { MktAccount, MktComparacaoLoja, MktDashboard, MktMarketplace, MktPeriodo } from "./types";
import { ConexaoBadge, Empty, MARKETPLACE_LABEL, Panel, Stat, dt, fmt } from "./ui";

const PERIODOS: { id: MktPeriodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "custom", label: "Personalizado" },
];

export default function DashboardTab({ refreshKey }: { refreshKey: number }) {
  const [periodo, setPeriodo] = useState<MktPeriodo>("7d");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [marketplace, setMarketplace] = useState<MktMarketplace | "">("");
  const [dados, setDados] = useState<MktDashboard | null>(null);
  const [contas, setContas] = useState<MktAccount[]>([]);
  const [contasSelecionadas, setContasSelecionadas] = useState<number[]>([]);
  const [comparacao, setComparacao] = useState<MktComparacaoLoja[] | null>(null);

  const params = () => {
    const p = new URLSearchParams({ periodo });
    if (periodo === "custom") {
      if (dataInicio) p.set("dataInicio", dataInicio);
      if (dataFim) p.set("dataFim", dataFim);
    }
    if (marketplace) p.set("marketplace", marketplace);
    return p;
  };

  const carregar = async () => {
    const r = await api.get<MktDashboard>(`/api/marketplace/dashboard?${params()}`);
    setDados(r);
  };

  const carregarComparacao = async () => {
    const p = params();
    if (contasSelecionadas.length) p.set("accountIds", contasSelecionadas.join(","));
    const r = await api.get<{ comparacao: MktComparacaoLoja[] }>(`/api/marketplace/dashboard/comparacao?${p}`);
    setComparacao(r.comparacao);
  };

  useEffect(() => {
    api.get<{ contas: MktAccount[] }>("/api/marketplace/contas").then((r) => setContas(r.contas));
  }, [refreshKey]);

  useEffect(() => {
    carregar();
    carregarComparacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, periodo, dataInicio, dataFim, marketplace, contasSelecionadas]);

  if (!dados) return <p className="cart-empty">Carregando…</p>;

  const porStatus = dados.porStatus;
  const automaticos = dados.porOrigem.automatica || 0;
  const manuais = (dados.porOrigem.manual || 0) + (dados.porOrigem.manual_reconciliado || 0);

  return (
    <div>
      <div className="filters">
        {PERIODOS.map((p) => (
          <button key={p.id} className={periodo === p.id ? "primary" : "secondary"} onClick={() => setPeriodo(p.id)}>
            {p.label}
          </button>
        ))}
        {periodo === "custom" && (
          <>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </>
        )}
        <select value={marketplace} onChange={(e) => setMarketplace(e.target.value as MktMarketplace | "")}>
          <option value="">Todos os marketplaces</option>
          <option value="mercado_livre">Mercado Livre</option>
          <option value="shopee">Shopee</option>
        </select>
      </div>

      <div className="stats">
        <Stat icon={ShoppingCart} label="Pedidos hoje" value={fmt(dados.pedidosHoje)} />
        <Stat icon={ShoppingCart} label="Pedidos na semana" value={fmt(dados.pedidosSemana)} />
        <Stat icon={PackageX} label="Unidades vendidas (período)" value={fmt(dados.unidadesVendidas)} />
        <Stat icon={Wallet} label="Aguardando pagamento" value={fmt(porStatus.aguardando_pagamento || 0)} />
        <Stat icon={CheckCircle2} label="Pagos" value={fmt(porStatus.pago || 0)} />
        <Stat icon={Clock5} label="Aguardando separação" value={fmt(porStatus.aguardando_separacao || 0)} />
        <Stat icon={Truck} label="Em separação" value={fmt(porStatus.em_separacao || 0)} />
        <Stat icon={CalendarClock} label="Pedidos atrasados" value={fmt(dados.pedidosAtrasados)} alert={dados.pedidosAtrasados > 0} />
        <Stat icon={CalendarClock} label="Próximos do prazo" value={fmt(dados.pedidosProximosDoPrazo)} />
        <Stat icon={XCircle} label="Cancelados" value={fmt(porStatus.cancelado || 0)} />
        <Stat icon={ShoppingCart} label="Importados automaticamente" value={fmt(automaticos)} />
        <Stat icon={ShoppingCart} label="Cadastrados manualmente" value={fmt(manuais)} />
        <Stat icon={AlertTriangle} label="Falhas de sincronização" value={fmt(dados.falhasSincronizacao)} alert={dados.falhasSincronizacao > 0} />
        <Stat icon={AlertTriangle} label="Com divergência" value={fmt(porStatus.com_divergencia || 0)} alert={(porStatus.com_divergencia || 0) > 0} />
      </div>

      <div className="grid-two">
        <Panel title="Produtos mais vendidos" subtitle="No período selecionado, sem contar cancelados/devolvidos.">
          {!dados.produtosMaisVendidos.length && <Empty text="Nenhuma venda no período." />}
          {!!dados.produtosMaisVendidos.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th className="num">Unidades</th>
                    <th className="num">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.produtosMaisVendidos.map((p) => (
                    <tr key={p.sku}>
                      <td className="code">{p.sku || "-"}</td>
                      <td>{p.nome || "-"}</td>
                      <td className="num">{fmt(p.unidades)}</td>
                      <td className="num">{fmt(p.pedidos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Última sincronização por loja">
          {!dados.ultimaSincronizacaoPorLoja.length && <Empty text="Nenhuma loja cadastrada ainda." />}
          {!!dados.ultimaSincronizacaoPorLoja.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th>Status</th>
                    <th>Última sincronização</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.ultimaSincronizacaoPorLoja.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {MARKETPLACE_LABEL[c.marketplace]} · {c.apelido || c.nome_interno}
                      </td>
                      <td>
                        <ConexaoBadge status={c.status_conexao} />
                      </td>
                      <td>{dt(c.ultima_sincronizacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Comparação entre lojas" subtitle="Selecione as lojas para comparar (nenhuma selecionada = todas do filtro acima).">
        <div className="filters">
          {contas.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={contasSelecionadas.includes(c.id)}
                onChange={(e) =>
                  setContasSelecionadas((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                }
              />
              {MARKETPLACE_LABEL[c.marketplace]} · {c.apelido || c.nome_interno}
            </label>
          ))}
        </div>
        {!comparacao?.length && <Empty text="Nenhuma loja para comparar." />}
        {!!comparacao?.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Unidades</th>
                  <th className="num">Pendentes</th>
                  <th className="num">Atrasados</th>
                  <th className="num">Cancelados</th>
                  <th className="num">Falhas</th>
                  <th>Mais vendidos</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((c) => (
                  <tr key={c.accountId}>
                    <td>
                      {MARKETPLACE_LABEL[c.marketplace]} · {c.apelido || c.nomeInterno}
                    </td>
                    <td className="num">{fmt(c.pedidos)}</td>
                    <td className="num">{fmt(c.unidades)}</td>
                    <td className="num">{fmt(c.pendentes)}</td>
                    <td className="num">{fmt(c.atrasados)}</td>
                    <td className="num">{fmt(c.cancelamentos)}</td>
                    <td className="num">{fmt(c.falhasSincronizacao)}</td>
                    <td>{c.maisVendidos.map((m) => m.sku).join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
