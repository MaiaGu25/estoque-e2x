import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "../../api";
import type { LogProduto } from "../../types";
import { Field, Modal } from "../ui";
import { ProdutoBusca } from "../PosicaoSeletor";

type ItemRascunho = { produto: LogProduto; quantidadeEsperada: string; exigeSerial: boolean };

export default function NovaConferenciaModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: number) => void }) {
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [fornecedorContato, setFornecedorContato] = useState("");
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const adicionarProduto = (p: LogProduto) => {
    if (itens.some((i) => i.produto.id === p.id)) return;
    setItens((prev) => [...prev, { produto: p, quantidadeEsperada: "1", exigeSerial: false }]);
  };

  const salvar = async () => {
    setErro("");
    if (!fornecedorNome.trim()) return setErro("Informe o fornecedor.");
    if (!itens.length) return setErro("Adicione pelo menos um item esperado.");
    setSalvando(true);
    try {
      const r = await api.post<{ id: number }>("/api/logistica/conferencia", {
        fornecedorNome,
        fornecedorContato,
        observacao,
        itens: itens.map((i) => ({ productId: i.produto.id, quantidadeEsperada: Number(i.quantidadeEsperada) || 0, exigeSerial: i.exigeSerial })),
      });
      onCriado(r.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível criar a conferência.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title="Nova conferência de entrada" subtitle="Registre o que é esperado do fornecedor antes de conferir fisicamente." onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Fornecedor">
          <input value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} placeholder="Nome do fornecedor" />
        </Field>
        <Field label="Contato">
          <input value={fornecedorContato} onChange={(e) => setFornecedorContato(e.target.value)} placeholder="Telefone, e-mail…" />
        </Field>
      </div>
      <Field label="Observação">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
      </Field>

      <Field label="Adicionar item esperado">
        <ProdutoBusca onSelect={adicionarProduto} placeholder="Buscar produto por código ou nome" />
      </Field>

      {!!itens.length && (
        <div className="cart">
          <div className="cart-head">{itens.length} item(ns) nesta conferência</div>
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
                value={item.quantidadeEsperada}
                onChange={(e) =>
                  setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, quantidadeEsperada: e.target.value } : it)))
                }
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
          {salvando ? "Criando…" : "Criar conferência"}
        </button>
      </div>
    </Modal>
  );
}
