import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { api, ApiError } from "../api";
import type { MktAccount, MktListing } from "./types";
import { Empty, MARKETPLACE_LABEL, Panel, VinculacaoBadge, dt, fmtMoeda } from "./ui";
import PecaBusca from "./PecaBusca";

export default function ProdutosTab({ refreshKey, onAtualizado }: { refreshKey: number; onAtualizado: () => void }) {
  const [anuncios, setAnuncios] = useState<MktListing[]>([]);
  const [contas, setContas] = useState<MktAccount[]>([]);
  const [busca, setBusca] = useState("");
  const [accountId, setAccountId] = useState("");
  const [vinculacao, setVinculacao] = useState("");
  const [vinculando, setVinculando] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    const params = new URLSearchParams();
    if (busca) params.set("busca", busca);
    if (accountId) params.set("accountId", accountId);
    if (vinculacao) params.set("vinculacao", vinculacao);
    const r = await api.get<{ anuncios: MktListing[] }>(`/api/marketplace/anuncios?${params}`);
    setAnuncios(r.anuncios);
  };

  useEffect(() => {
    api.get<{ contas: MktAccount[] }>("/api/marketplace/contas").then((r) => setContas(r.contas));
  }, [refreshKey]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, busca, accountId, vinculacao]);

  const vincular = async (listingId: number, partId: number) => {
    setErro("");
    try {
      await api.post(`/api/marketplace/anuncios/${listingId}/vincular`, { partId });
      setVinculando(null);
      onAtualizado();
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível vincular.");
    }
  };

  return (
    <Panel title="Produtos e anúncios" subtitle="Só consulta - alterações de preço, título, foto etc. continuam sendo feitas direto no Mercado Livre/Shopee.">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input placeholder="Título, SKU, ID do anúncio…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Todas as lojas</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {MARKETPLACE_LABEL[c.marketplace]} · {c.apelido || c.nome_interno}
            </option>
          ))}
        </select>
        <select value={vinculacao} onChange={(e) => setVinculacao(e.target.value)}>
          <option value="">Qualquer vínculo</option>
          <option value="vinculado">Vinculado</option>
          <option value="nao_vinculado">Não vinculado</option>
          <option value="divergente">Divergente</option>
        </select>
      </div>

      {erro && <div className="error">{erro}</div>}
      {!anuncios.length && <Empty text="Nenhum anúncio recebido ainda." />}
      {!!anuncios.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Anúncio</th>
                <th>SKU recebido</th>
                <th>Vínculo</th>
                <th className="num">Preço</th>
                <th>Última sinc.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {anuncios.map((a) => (
                <tr key={a.id}>
                  <td>
                    {MARKETPLACE_LABEL[a.marketplace]}
                    <br />
                    <small>{a.conta_nome}</small>
                  </td>
                  <td>
                    {a.titulo || a.id_anuncio}
                    {a.url_anuncio && (
                      <a href={a.url_anuncio} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </td>
                  <td className="code">{a.sku_recebido || "-"}</td>
                  <td>
                    <VinculacaoBadge status={a.status_vinculacao} />
                    {a.part_code && (
                      <div>
                        <small>{a.part_code}</small>
                      </div>
                    )}
                  </td>
                  <td className="num">{fmtMoeda(a.preco_anunciado)}</td>
                  <td>{dt(a.ultima_sincronizacao)}</td>
                  <td>
                    {vinculando === a.id ? (
                      <PecaBusca onSelect={(p) => vincular(a.id, p.id)} placeholder="Buscar peça para vincular" />
                    ) : (
                      <button className="secondary" onClick={() => setVinculando(a.id)}>
                        Vincular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
