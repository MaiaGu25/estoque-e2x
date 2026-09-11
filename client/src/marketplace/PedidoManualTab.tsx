import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../api";
import type { MktAccount, MktCapturaResultado, MktOrder, MktStockPart } from "./types";
import { Empty, Field, MARKETPLACE_LABEL, Panel, StatusBadge, dt } from "./ui";
import PecaBusca from "./PecaBusca";
import CapturaUpload from "./CapturaUpload";

type ItemRascunho = { parte: MktStockPart; quantidade: string; precoUnitario: string };

export default function PedidoManualTab({ onCriado }: { onCriado: () => void }) {
  const [contas, setContas] = useState<MktAccount[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [idExterno, setIdExterno] = useState("");
  const [numeroVisivel, setNumeroVisivel] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [existente, setExistente] = useState<MktOrder | null | undefined>(undefined);
  const [buscandoNaApi, setBuscandoNaApi] = useState(false);

  const [compradorNome, setCompradorNome] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [prazoEnvio, setPrazoEnvio] = useState("");
  const [frete, setFrete] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [motivoManual, setMotivoManual] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ contas: MktAccount[] }>("/api/marketplace/contas").then((r) => setContas(r.contas.filter((c) => c.ativa)));
  }, []);

  const buscarExistente = async () => {
    if (!accountId) return setErro("Selecione a loja primeiro.");
    if (!idExterno && !numeroVisivel) return setErro("Informe o número ou o ID externo do pedido.");
    setErro("");
    setBuscando(true);
    try {
      const r = await api.post<{ encontrado: any }>("/api/marketplace/manual/buscar-existente", { accountId, idExterno, numeroVisivel });
      setExistente(r.encontrado || null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível pesquisar.");
    } finally {
      setBuscando(false);
    }
  };

  const buscarNaApi = async () => {
    if (!accountId || !idExterno) return;
    setBuscandoNaApi(true);
    try {
      const r = await api.post<{ ok: boolean; mensagem?: string }>(`/api/marketplace/manual/${accountId}/buscar-na-api`, { idExterno });
      if (r.ok) {
        setSucesso("Pedido localizado na API e importado automaticamente - não é mais necessário cadastrar manualmente.");
        onCriado();
      } else {
        setErro(r.mensagem || "Não foi possível localizar o pedido na API.");
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível tentar a busca na API.");
    } finally {
      setBuscandoNaApi(false);
    }
  };

  const usarDadosDaCaptura = (resultado: MktCapturaResultado) => {
    if (!resultado.campos) return;
    const c = resultado.campos;
    if (c.numeroPedido.valor) setIdExterno(c.numeroPedido.valor);
    if (c.data.valor) setDataCompra(c.data.valor);
    if (c.prazoEnvio.valor) setPrazoEnvio(c.prazoEnvio.valor);
    if (c.marketplace.valor) {
      const conta = contas.find((ct) => ct.marketplace === c.marketplace.valor);
      if (conta) setAccountId(conta.id);
    }
  };

  const adicionarItem = (parte: MktStockPart) => {
    if (itens.some((i) => i.parte.id === parte.id)) return;
    setItens((prev) => [...prev, { parte, quantidade: "1", precoUnitario: "0" }]);
  };

  const salvar = async () => {
    setErro("");
    setSucesso(null);
    if (!accountId) return setErro("Selecione a loja.");
    if (!idExterno && !numeroVisivel) return setErro("Informe o número ou o ID externo do pedido.");
    if (!itens.length) return setErro("Adicione pelo menos um produto.");
    if (!motivoManual.trim()) return setErro("Informe o motivo do cadastro manual.");
    if (existente) return setErro("Esse pedido já existe - abra-o na fila de pedidos em vez de cadastrar de novo.");

    setSalvando(true);
    try {
      const r = await api.post<{ id: number; numeroVisivel: string }>("/api/marketplace/manual", {
        accountId,
        idExterno,
        numeroVisivel,
        compradorNome,
        dataCompra,
        prazoEnvio,
        frete: Number(frete) || 0,
        observacao,
        motivoManual,
        itens: itens.map((i) => ({
          partIdManual: i.parte.id,
          skuExterno: i.parte.code,
          tituloRecebido: i.parte.name,
          quantidade: Number(i.quantidade) || 0,
          precoUnitario: Number(i.precoUnitario) || 0,
        })),
      });
      setSucesso(`Pedido cadastrado com sucesso (#${r.id}).`);
      setItens([]);
      setIdExterno("");
      setNumeroVisivel("");
      setCompradorNome("");
      setMotivoManual("");
      setExistente(undefined);
      onCriado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível cadastrar o pedido.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Panel title="Pedido manual" subtitle="Use apenas quando a API não importou o pedido automaticamente - só administradores podem cadastrar aqui.">
      <CapturaUpload onUsarDados={usarDadosDaCaptura} />

      <div className="form-grid">
        <label className="field">
          <span>Loja</span>
          <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value) || null)}>
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {MARKETPLACE_LABEL[c.marketplace]} · {c.apelido || c.nome_interno}
              </option>
            ))}
          </select>
        </label>
        <Field label="Número ou ID externo do pedido">
          <input value={idExterno} onChange={(e) => setIdExterno(e.target.value)} />
        </Field>
        <Field label="Número visível (se diferente do ID)">
          <input value={numeroVisivel} onChange={(e) => setNumeroVisivel(e.target.value)} />
        </Field>
      </div>

      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button className="secondary" onClick={buscarExistente} disabled={buscando}>
          <Search size={15} /> {buscando ? "Pesquisando…" : "Pesquisar antes de cadastrar"}
        </button>
        {existente === undefined ? null : existente === null ? (
          <span className="status ok">Nenhum pedido igual encontrado - pode cadastrar.</span>
        ) : (
          <span className="status warn">Esse pedido já existe.</span>
        )}
      </div>

      {existente && (
        <div className="cart" style={{ padding: 12, marginBottom: 12 }}>
          <p>
            <b>{existente.numero_visivel || existente.id_externo}</b> já está cadastrado ({existente.origem === "manual" ? "manual" : "automático"}, importado em{" "}
            {dt(existente.importado_em)}).
          </p>
          <StatusBadge status={existente.status_interno} />
          <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            <button className="secondary" onClick={buscarNaApi} disabled={buscandoNaApi}>
              {buscandoNaApi ? "Buscando…" : "Tentar buscar de novo na API"}
            </button>
          </div>
        </div>
      )}

      {!existente && (
        <>
          <div className="form-grid">
            <Field label="Comprador">
              <input value={compradorNome} onChange={(e) => setCompradorNome(e.target.value)} />
            </Field>
            <Field label="Data da compra">
              <input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
            </Field>
            <Field label="Prazo de envio">
              <input type="date" value={prazoEnvio} onChange={(e) => setPrazoEnvio(e.target.value)} />
            </Field>
            <Field label="Frete">
              <input type="number" min={0} step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </Field>
          </div>
          <Field label="Observação">
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Field>
          <Field label="Motivo do cadastro manual (obrigatório)">
            <input value={motivoManual} onChange={(e) => setMotivoManual(e.target.value)} placeholder="Ex.: pedido não apareceu na sincronização automática" />
          </Field>

          <Field label="Adicionar produto">
            <PecaBusca onSelect={adicionarItem} />
          </Field>

          {!itens.length && <Empty text="Nenhum produto adicionado ainda." />}
          {!!itens.length && (
            <div className="cart">
              {itens.map((item, idx) => (
                <div key={item.parte.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
                  <span>
                    <b>{item.parte.code}</b>
                    <small>{item.parte.name}</small>
                  </span>
                  <input
                    type="number"
                    min={1}
                    style={{ width: 70 }}
                    value={item.quantidade}
                    onChange={(e) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, quantidade: e.target.value } : it)))}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ width: 90 }}
                    value={item.precoUnitario}
                    onChange={(e) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, precoUnitario: e.target.value } : it)))}
                  />
                  <button className="icon-btn" onClick={() => setItens((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {erro && <div className="error">{erro}</div>}
          {sucesso && <div className="status ok" style={{ display: "block", padding: 10 }}>{sucesso}</div>}
          <div className="modal-actions">
            <button className="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Cadastrando…" : "Cadastrar pedido manualmente"}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}
