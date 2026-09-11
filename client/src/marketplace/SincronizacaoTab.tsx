import { useEffect, useState } from "react";
import { RefreshCw, Search, ShieldQuestion } from "lucide-react";
import { api, ApiError } from "../api";
import type { MktAccount, MktSyncEvent, MktSyncFailure } from "./types";
import { Empty, MARKETPLACE_LABEL, Panel, dt } from "./ui";

export default function SincronizacaoTab({ refreshKey, onAtualizado }: { refreshKey: number; onAtualizado: () => void }) {
  const [contas, setContas] = useState<MktAccount[]>([]);
  const [eventos, setEventos] = useState<MktSyncEvent[]>([]);
  const [falhas, setFalhas] = useState<MktSyncFailure[]>([]);
  const [carregando, setCarregando] = useState<number | null>(null);
  const [idBusca, setIdBusca] = useState<Record<number, string>>({});
  const [mensagem, setMensagem] = useState<Record<number, string>>({});

  const carregar = async () => {
    const r = await api.get<{ contas: MktAccount[]; eventosRecentes: MktSyncEvent[] }>("/api/marketplace/sincronizacao");
    setContas(r.contas);
    setEventos(r.eventosRecentes);
    const rf = await api.get<{ falhas: MktSyncFailure[] }>("/api/marketplace/sincronizacao/falhas?status=pendente");
    setFalhas(rf.falhas);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const executar = async (contaId: number, acao: "testar-conexao" | "sincronizar-agora") => {
    setCarregando(contaId);
    setMensagem((m) => ({ ...m, [contaId]: "" }));
    try {
      const r = await api.post<{ ok?: boolean; mensagem?: string; importados?: number }>(`/api/marketplace/sincronizacao/${contaId}/${acao}`);
      setMensagem((m) => ({
        ...m,
        [contaId]: r.mensagem || (r.importados !== undefined ? `${r.importados} pedido(s) sincronizado(s).` : "Concluído."),
      }));
      onAtualizado();
      carregar();
    } catch (e) {
      setMensagem((m) => ({ ...m, [contaId]: e instanceof ApiError ? e.message : "Falhou." }));
    } finally {
      setCarregando(null);
    }
  };

  const buscarPedido = async (contaId: number) => {
    const idExterno = idBusca[contaId];
    if (!idExterno) return;
    setCarregando(contaId);
    try {
      const r = await api.post<{ ok: boolean; mensagem?: string }>(`/api/marketplace/manual/${contaId}/buscar-na-api`, { idExterno });
      setMensagem((m) => ({ ...m, [contaId]: r.ok ? "Pedido encontrado e importado." : r.mensagem || "Não encontrado." }));
      onAtualizado();
    } catch (e) {
      setMensagem((m) => ({ ...m, [contaId]: e instanceof ApiError ? e.message : "Falhou." }));
    } finally {
      setCarregando(null);
    }
  };

  const reprocessar = async (falhaId: number) => {
    try {
      await api.post(`/api/marketplace/sincronizacao/falhas/${falhaId}/reprocessar`);
      onAtualizado();
      carregar();
    } catch {
      // erro já fica registrado na própria fila (tentativas incrementadas)
      carregar();
    }
  };

  return (
    <div>
      <Panel title="Estado das conexões">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Status</th>
                <th>Última sinc.</th>
                <th>Pedidos</th>
                <th>Falhas pendentes</th>
                <th>Último erro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id}>
                  <td>
                    {MARKETPLACE_LABEL[c.marketplace]}
                    <br />
                    <small>{c.apelido || c.nome_interno}</small>
                  </td>
                  <td>
                    <span className={`status ${c.status_conexao === "conectada" ? "ok" : c.status_conexao === "nao_configurada" ? "" : "warn"}`}>
                      {c.status_conexao === "nao_configurada" ? "Não configurada" : c.status_conexao}
                    </span>
                  </td>
                  <td>{dt(c.ultima_sincronizacao)}</td>
                  <td className="num">{c.pedidos_importados ?? 0}</td>
                  <td className="num">{c.falhas_pendentes ?? 0}</td>
                  <td style={{ maxWidth: 220 }}>
                    <small>{c.ultimo_erro || "-"}</small>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                        <button className="secondary" onClick={() => executar(c.id, "testar-conexao")} disabled={carregando === c.id}>
                          <ShieldQuestion size={13} /> Testar conexão
                        </button>
                        <button className="secondary" onClick={() => executar(c.id, "sincronizar-agora")} disabled={carregando === c.id}>
                          <RefreshCw size={13} /> Sincronizar agora
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          placeholder="ID do pedido"
                          style={{ fontSize: 11, padding: "4px 6px" }}
                          value={idBusca[c.id] || ""}
                          onChange={(e) => setIdBusca((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        />
                        <button className="icon-btn" title="Buscar pedido" onClick={() => buscarPedido(c.id)}>
                          <Search size={14} />
                        </button>
                      </div>
                      {mensagem[c.id] && <small>{mensagem[c.id]}</small>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Fila de falhas pendentes" subtitle="Tentativas automáticas com atraso progressivo - depois do limite, vira falha permanente e só volta com ação manual.">
        {!falhas.length && <Empty text="Nenhuma falha pendente." />}
        {!!falhas.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Tipo</th>
                  <th>Tentativas</th>
                  <th>Próxima tentativa</th>
                  <th>Erro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {falhas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.conta_nome || "-"}</td>
                    <td>{f.tipo_evento}</td>
                    <td className="num">{f.tentativas}</td>
                    <td>{dt(f.proxima_tentativa)}</td>
                    <td style={{ maxWidth: 260 }}>
                      <small>{f.erro_resumo}</small>
                    </td>
                    <td>
                      <button className="secondary" onClick={() => reprocessar(f.id)}>
                        Reprocessar agora
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Eventos recentes">
        {!eventos.length && <Empty text="Nenhum evento registrado ainda." />}
        <div className="cart">
          {eventos.map((e) => (
            <div key={e.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span>
                <b>
                  {e.tipo} · {e.resultado}
                </b>
                <small>{e.detalhe}</small>
              </span>
              <small>{dt(e.created_at)}</small>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
