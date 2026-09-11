import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "../../api";
import type { LogCanalPedido, LogPrioridade, LogProduto } from "../../types";
import { Field, Modal } from "../ui";
import { ProdutoBusca } from "../PosicaoSeletor";
import { CANAL_LABEL, PRIORIDADE_LABEL } from "./ui";

type ItemRascunho = { produto: LogProduto; quantidadeSolicitada: string; exigeSerial: boolean; variacao: string };

export default function NovoPedidoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: number) => void }) {
  const [canal, setCanal] = useState<LogCanalPedido>("manual");
  const [prioridade, setPrioridade] = useState<LogPrioridade>("normal");
  const [clienteNome, setClienteNome] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [numeroVisivel, setNumeroVisivel] = useState("");
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const adicionarProduto = (p: LogProduto) => {
    if (itens.some((i) => i.produto.id === p.id)) return;
    setItens((prev) => [...prev, { produto: p, quantidadeSolicitada: "1", exigeSerial: false, variacao: "" }]);
  };

  const salvar = async () => {
    setErro("");
    if (!itens.length) return setErro("Adicione pelo menos um item para separar.");
    setSalvando(true);
    try {
      const r = await api.post<{ id: number }>("/api/logistica/separacao", {
        canal,
        prioridade,
        clienteNome,
        vendedor,
        numeroVisivel,
        observacao,
        itens: itens.map((i) => ({
          productId: i.produto.id,
          quantidadeSolicitada: Number(i.quantidadeSolicitada) || 0,
          exigeSerial: i.exigeSerial,
          variacao: i.variacao,
        })),
      });
      onCriado(r.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível criar o pedido.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title="Novo pedido para separação" subtitle="Registre manualmente ou represente um pedido vindo de vendedor/marketplace." onClose={onClose} wide>
      <div className="form-grid">
        <label className="field">
          <span>Canal</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value as LogCanalPedido)}>
            {Object.entries(CANAL_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prioridade</span>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as LogPrioridade)}>
            {Object.entries(PRIORIDADE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Field label="Cliente">
          <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
        </Field>
        <Field label="Vendedor">
          <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
        </Field>
        <Field label="Número visível (pedido original)">
          <input value={numeroVisivel} onChange={(e) => setNumeroVisivel(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
      <Field label="Observação">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
      </Field>

      <Field label="Adicionar item a separar">
        <ProdutoBusca onSelect={adicionarProduto} placeholder="Buscar produto por código ou nome" />
      </Field>

      {!!itens.length && (
        <div className="cart">
          <div className="cart-head">{itens.length} item(ns) neste pedido</div>
          {itens.map((item, idx) => (
            <div key={item.produto.id} className="cart-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
              <span>
                <b>{item.produto.code}</b>
                <small>{item.produto.name}</small>
              </span>
              <input
                type="number"
                min={1}
                style={{ width: 80 }}
                value={item.quantidadeSolicitada}
                onChange={(e) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, quantidadeSolicitada: e.target.value } : it)))}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={item.exigeSerial}
                  onChange={(e) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, exigeSerial: e.target.checked } : it)))}
                />
                Exige serial
              </label>
              <button className="icon-btn" onClick={() => setItens((prev) => prev.filter((_, i) => i !== idx))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <div className="error">{erro}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Criando…" : "Criar pedido"}
        </button>
      </div>
    </Modal>
  );
}
