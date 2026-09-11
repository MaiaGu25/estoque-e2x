import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Search } from "lucide-react";
import type { RmaOpcoesPorTipo, RmaProtocolo } from "./types";
import { rmaApi, type RmaFiltros } from "./rmaApi";
import { Empty, OpcaoBadge, Panel, dt } from "./ui";
import WizardModal from "./WizardModal";

const COLUNAS_ORDENAVEIS: Record<string, string> = {
  data_abertura: "Aberto em",
  numero_protocolo: "Nº protocolo",
  status: "Status",
  data_recebimento: "Recebido em",
  updated_at: "Última atualização",
};

export default function ListaTab({ opcoes, refreshKey, onAtualizado }: { opcoes: RmaOpcoesPorTipo | null; refreshKey: number; onAtualizado: () => void }) {
  const [filtros, setFiltros] = useState<RmaFiltros>({});
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [linhas, setLinhas] = useState<RmaProtocolo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [ordenarPor, setOrdenarPor] = useState("data_abertura");
  const [ordem, setOrdem] = useState<"asc" | "desc">("desc");
  const [carregando, setCarregando] = useState(false);
  const [protocoloAberto, setProtocoloAberto] = useState<number | null | "novo">(null);

  const porPagina = 25;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  const carregar = async (novaPagina = pagina) => {
    setCarregando(true);
    try {
      const resp = await rmaApi.listar({ ...filtros, pagina: novaPagina, porPagina, ordenarPor, ordem });
      setLinhas(resp.linhas);
      setTotal(resp.total);
      setPagina(resp.pagina);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, ordenarPor, ordem]);

  const alternarOrdenacao = (coluna: string) => {
    if (ordenarPor === coluna) {
      setOrdem(ordem === "asc" ? "desc" : "asc");
    } else {
      setOrdenarPor(coluna);
      setOrdem("desc");
    }
  };

  return (
    <Panel
      title="Protocolos de RMA/SAC"
      subtitle="Reclamações, devoluções e atendimentos - do registro manual até a solução final."
      actions={
        <button className="primary" onClick={() => setProtocoloAberto("novo")}>
          <Plus size={16} /> Novo protocolo
        </button>
      }
    >
      <div className="filters" style={{ flexWrap: "wrap" }}>
        <div>
          <label>Nº do protocolo</label>
          <input value={filtros.numeroProtocolo || ""} onChange={(e) => setFiltros({ ...filtros, numeroProtocolo: e.target.value })} />
        </div>
        <div>
          <label>Cliente</label>
          <input value={filtros.cliente || ""} onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })} />
        </div>
        <div>
          <label>CPF/CNPJ</label>
          <input value={filtros.cpfCnpj || ""} onChange={(e) => setFiltros({ ...filtros, cpfCnpj: e.target.value })} placeholder="Com ou sem pontuação" />
        </div>
        <div>
          <label>Status</label>
          <select value={filtros.status || ""} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
            <option value="">Todos</option>
            {opcoes?.status.map((o) => (
              <option key={o.id} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Canal de compra</label>
          <select value={filtros.canalCompra || ""} onChange={(e) => setFiltros({ ...filtros, canalCompra: e.target.value })}>
            <option value="">Todos</option>
            {opcoes?.canal_compra.map((o) => (
              <option key={o.id} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Nº do pedido</label>
          <input value={filtros.numeroPedido || ""} onChange={(e) => setFiltros({ ...filtros, numeroPedido: e.target.value })} placeholder="Com ou sem pontuação" />
        </div>
        <div>
          <label>Aberto de</label>
          <input type="date" value={filtros.dataAberturaDe || ""} onChange={(e) => setFiltros({ ...filtros, dataAberturaDe: e.target.value })} />
        </div>
        <div>
          <label>Aberto até</label>
          <input type="date" value={filtros.dataAberturaAte || ""} onChange={(e) => setFiltros({ ...filtros, dataAberturaAte: e.target.value })} />
        </div>
        {maisFiltros && (
          <>
            <div>
              <label>Nº do sistema</label>
              <input value={filtros.numeroSistema || ""} onChange={(e) => setFiltros({ ...filtros, numeroSistema: e.target.value })} />
            </div>
            <div>
              <label>Nº do envio</label>
              <input value={filtros.numeroEnvio || ""} onChange={(e) => setFiltros({ ...filtros, numeroEnvio: e.target.value })} />
            </div>
            <div>
              <label>Nº da reversa</label>
              <input value={filtros.numeroReversa || ""} onChange={(e) => setFiltros({ ...filtros, numeroReversa: e.target.value })} />
            </div>
            <div>
              <label>Nº de rastreio</label>
              <input value={filtros.numeroRastreio || ""} onChange={(e) => setFiltros({ ...filtros, numeroRastreio: e.target.value })} />
            </div>
          </>
        )}
        <button className="secondary" onClick={() => setMaisFiltros(!maisFiltros)}>
          Mais filtros {maisFiltros ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button className="primary" onClick={() => carregar(1)}>
          <Search size={16} /> Filtrar
        </button>
        <button
          className="secondary"
          onClick={() => {
            setFiltros({});
            carregar(1);
          }}
        >
          Limpar
        </button>
      </div>

      {!linhas.length && !carregando && <Empty text="Nenhum protocolo encontrado com esses filtros." />}
      {!!linhas.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {Object.entries(COLUNAS_ORDENAVEIS).map(([campo, rotulo]) => (
                  <th key={campo} style={{ cursor: "pointer" }} onClick={() => alternarOrdenacao(campo)}>
                    {rotulo} {ordenarPor === campo && (ordem === "asc" ? "▲" : "▼")}
                  </th>
                ))}
                <th>Cliente</th>
                <th>CPF/CNPJ</th>
                <th>Canal de compra</th>
                <th>Nº do pedido</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onDoubleClick={() => setProtocoloAberto(p.id)} title="Duplo clique para abrir">
                  <td>{dt(p.data_abertura)}</td>
                  <td className="code">{p.numero_protocolo}</td>
                  <td>
                    <OpcaoBadge opcoesLista={opcoes?.status} valor={p.status} />
                  </td>
                  <td>{dt(p.data_recebimento)}</td>
                  <td>{dt(p.updated_at)}</td>
                  <td>{p.cliente_nome || "-"}</td>
                  <td>{p.cliente_cpf_cnpj || "-"}</td>
                  <td>
                    <OpcaoBadge opcoesLista={opcoes?.canal_compra} valor={p.canal_compra} />
                  </td>
                  <td>{p.numero_pedido || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPaginas > 1 && (
        <div className="pagination">
          <span>
            {total} protocolo{total === 1 ? "" : "s"} · Página {pagina} de {totalPaginas}
          </span>
          <button className="icon-btn" disabled={pagina <= 1} onClick={() => carregar(pagina - 1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" disabled={pagina >= totalPaginas} onClick={() => carregar(pagina + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {protocoloAberto !== null && (
        <WizardModal
          protocoloId={protocoloAberto === "novo" ? undefined : protocoloAberto}
          opcoes={opcoes}
          onClose={() => setProtocoloAberto(null)}
          onSalvo={() => {
            onAtualizado();
            carregar();
          }}
        />
      )}
    </Panel>
  );
}
