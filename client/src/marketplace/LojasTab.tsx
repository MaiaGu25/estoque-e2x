import { useEffect, useState } from "react";
import { Ban, Plus } from "lucide-react";
import { api, ApiError } from "../api";
import { Badge } from "../Badge";
import type { MktAccount, MktMarketplace } from "./types";
import { ConexaoBadge, Empty, MARKETPLACE_LABEL, Modal, Panel, dt } from "./ui";

export default function LojasTab({ refreshKey, onAtualizado }: { refreshKey: number; onAtualizado: () => void }) {
  const [contas, setContas] = useState<MktAccount[]>([]);
  const [novaAberta, setNovaAberta] = useState(false);

  const carregar = () => api.get<{ contas: MktAccount[] }>("/api/marketplace/contas").then((r) => setContas(r.contas));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const alternarAtiva = async (conta: MktAccount) => {
    await api.patch(`/api/marketplace/contas/${conta.id}`, { ativa: !conta.ativa });
    onAtualizado();
    carregar();
  };

  return (
    <Panel title="Lojas conectadas" subtitle="Cadastre quantas contas do Mercado Livre e da Shopee precisar - não há limite fixo.">
      <div className="toolbar">
        <button className="primary" onClick={() => setNovaAberta(true)}>
          <Plus size={16} /> Nova loja
        </button>
      </div>

      {!contas.length && <Empty text="Nenhuma loja cadastrada ainda." />}
      {!!contas.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th>Nome interno</th>
                <th>Identificador externo</th>
                <th>Status</th>
                <th>Última sincronização</th>
                <th>Pedidos importados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id}>
                  <td>{MARKETPLACE_LABEL[c.marketplace]}</td>
                  <td>
                    {c.nome_interno}
                    {c.apelido && <div><small>{c.apelido}</small></div>}
                  </td>
                  <td className="code">{c.identificador_externo || "-"}</td>
                  <td>
                    <ConexaoBadge status={c.status_conexao} />
                    {!c.ativa && (
                      <Badge icon={Ban} tone="neutral">
                        Inativa
                      </Badge>
                    )}
                  </td>
                  <td>{dt(c.ultima_sincronizacao)}</td>
                  <td className="num">{c.pedidos_importados ?? 0}</td>
                  <td>
                    <button className="secondary" onClick={() => alternarAtiva(c)}>
                      {c.ativa ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {novaAberta && (
        <NovaLojaModal
          onClose={() => setNovaAberta(false)}
          onCriada={() => {
            setNovaAberta(false);
            onAtualizado();
            carregar();
          }}
        />
      )}
    </Panel>
  );
}

function NovaLojaModal({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
  const [marketplace, setMarketplace] = useState<MktMarketplace>("mercado_livre");
  const [nomeInterno, setNomeInterno] = useState("");
  const [apelido, setApelido] = useState("");
  const [identificadorExterno, setIdentificadorExterno] = useState("");
  const [credencialRef, setCredencialRef] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setErro("");
    if (!nomeInterno.trim()) return setErro("Informe o nome interno da loja.");
    setSalvando(true);
    try {
      await api.post("/api/marketplace/contas", { marketplace, nomeInterno, apelido, identificadorExterno, credencialRef });
      onCriada();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível cadastrar a loja.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title="Nova loja" subtitle="Cadastre a loja agora - conectar de verdade com o Mercado Livre/Shopee é uma etapa futura." onClose={onClose}>
      <div className="form-grid">
        <label className="field">
          <span>Marketplace</span>
          <select value={marketplace} onChange={(e) => setMarketplace(e.target.value as MktMarketplace)}>
            <option value="mercado_livre">Mercado Livre</option>
            <option value="shopee">Shopee</option>
          </select>
        </label>
        <label className="field">
          <span>Nome interno</span>
          <input value={nomeInterno} onChange={(e) => setNomeInterno(e.target.value)} placeholder="Ex.: Loja Oficial 1" />
        </label>
        <label className="field">
          <span>Apelido</span>
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Identificador externo (ID da conta na plataforma)</span>
          <input value={identificadorExterno} onChange={(e) => setIdentificadorExterno(e.target.value)} placeholder="Opcional por enquanto" />
        </label>
        <label className="field">
          <span>Variável de ambiente com a credencial (Fase 2/3)</span>
          <input value={credencialRef} onChange={(e) => setCredencialRef(e.target.value)} placeholder="Ex.: MERCADOLIVRE_LOJA1_ACCESS_TOKEN" />
        </label>
      </div>
      {erro && <div className="error">{erro}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Criando…" : "Criar loja"}
        </button>
      </div>
    </Modal>
  );
}
