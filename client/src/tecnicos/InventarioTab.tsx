import { useEffect, useState } from "react";
import { ClipboardCheck, History, Plus, RefreshCw, Save, X } from "lucide-react";
import type { TecInventarioDetalhe } from "../types";
import { Empty, Field, Modal, dt } from "./ui";
import { inventarioApi } from "./inventarioApi";
import InventarioLista from "./InventarioLista";
import InventarioRevisao from "./InventarioRevisao";
import InventarioHistorico from "./InventarioHistorico";

type Secao = "atual" | "historico";
type Etapa = "contagem" | "revisao";

// Tela principal da aba "Inventário": decide entre iniciar um inventário
// novo, continuar um que já está em andamento, revisar antes de finalizar,
// ou ver o histórico. Cada ação já persiste no servidor na hora - não tem
// um "salvar" em lote no final, então sair e voltar sempre retoma de onde
// parou (o "continuar depois" pedido é basicamente isso).
export default function InventarioTab({ onEstoqueAlterado }: { onEstoqueAlterado: () => void }) {
  const [secao, setSecao] = useState<Secao>("atual");
  const [etapa, setEtapa] = useState<Etapa>("contagem");
  const [detalhe, setDetalhe] = useState<TecInventarioDetalhe | { inventario: null; itens: []; resumo: null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalNovo, setModalNovo] = useState(false);
  const [historicoKey, setHistoricoKey] = useState(0);

  const carregar = async () => {
    setErro("");
    try {
      const r = await inventarioApi.buscarAtivo();
      setDetalhe(r);
      setEtapa("contagem");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o inventário.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aoMutar = (novo: TecInventarioDetalhe) => setDetalhe(novo);

  const cancelar = async () => {
    if (!detalhe?.inventario) return;
    if (!confirm(`Cancelar o inventário ${detalhe.inventario.numero}? Nada será alterado no estoque.`)) return;
    try {
      await inventarioApi.cancelar(detalhe.inventario.id);
      await carregar();
      onEstoqueAlterado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  };

  const salvarRascunho = async (observacao: string) => {
    if (!detalhe?.inventario) return;
    try {
      const r = await inventarioApi.salvarCabecalho(detalhe.inventario.id, { observacao });
      setDetalhe(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o rascunho.");
    }
  };

  const aoFinalizar = async (novo: TecInventarioDetalhe) => {
    setDetalhe(novo);
    onEstoqueAlterado();
    setHistoricoKey((k) => k + 1);
    await carregar();
  };

  if (carregando) {
    return (
      <div className="loading">
        <RefreshCw className="spin" /> Carregando…
      </div>
    );
  }

  return (
    <section>
      <div className="toolbar">
        <div className="segmented" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 360 }}>
          <button className={secao === "atual" ? "active in" : ""} onClick={() => setSecao("atual")}>
            <ClipboardCheck size={15} /> Inventário atual
          </button>
          <button className={secao === "historico" ? "active in" : ""} onClick={() => setSecao("historico")}>
            <History size={15} /> Histórico de inventários
          </button>
        </div>
        {secao === "atual" && detalhe?.inventario && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {etapa === "contagem" ? (
              <>
                <button className="secondary" onClick={cancelar}>
                  <X size={15} /> Cancelar inventário
                </button>
                <button className="primary" onClick={() => setEtapa("revisao")}>
                  Revisar inventário
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {erro && <div className="error">{erro}</div>}

      {secao === "historico" && <InventarioHistorico refreshKey={historicoKey} />}

      {secao === "atual" && !detalhe?.inventario && (
        <div className="table-card">
          <Empty text="Nenhum inventário em andamento no momento." />
          <div style={{ display: "flex", justifyContent: "center", padding: "0 0 24px" }}>
            <button className="primary" onClick={() => setModalNovo(true)}>
              <Plus size={17} /> Iniciar novo inventário
            </button>
          </div>
        </div>
      )}

      {secao === "atual" && detalhe?.inventario && etapa === "contagem" && (
        <>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 14px" }}>
            <b style={{ color: "#1b2b24" }}>{detalhe.inventario.numero}</b> · iniciado em {dt(detalhe.inventario.createdAt)} por{" "}
            {detalhe.inventario.createdByNome}
            {detalhe.inventario.motivo ? ` · ${detalhe.inventario.motivo}` : ""}
          </p>
          <RascunhoObservacao valor={detalhe.inventario.observacao} onSalvar={salvarRascunho} />
          <InventarioLista inventarioId={detalhe.inventario.id} itens={detalhe.itens} onMutated={aoMutar} />
        </>
      )}

      {secao === "atual" && detalhe?.inventario && etapa === "revisao" && (
        <InventarioRevisao detalhe={detalhe} onVoltar={() => setEtapa("contagem")} onFinalizado={aoFinalizar} />
      )}

      {modalNovo && (
        <NovoInventarioModal
          onClose={() => setModalNovo(false)}
          onCriado={async () => {
            setModalNovo(false);
            await carregar();
          }}
        />
      )}
    </section>
  );
}

function RascunhoObservacao({ valor, onSalvar }: { valor: string; onSalvar: (observacao: string) => Promise<void> }) {
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar(texto);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="filters" style={{ alignItems: "flex-end" }}>
      <div style={{ flex: 1 }}>
        <label>Observação (rascunho)</label>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: contagem da bancada 2, iniciada no turno da tarde" />
      </div>
      <button className="secondary" onClick={salvar} disabled={salvando || texto === valor}>
        <Save size={15} /> {salvando ? "Salvando…" : "Salvar rascunho"}
      </button>
    </div>
  );
}

function NovoInventarioModal({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const iniciar = async () => {
    setSaving(true);
    setErr("");
    try {
      await inventarioApi.iniciar({ motivo, observacao });
      onCriado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível iniciar o inventário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Iniciar novo inventário" subtitle="Todos os produtos ativos do estoque dos Técnicos entram na lista de contagem." onClose={onClose}>
      <Field label="Motivo (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: conferência mensal" />
      </Field>
      <Field label="Observação (opcional)">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Field>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving} onClick={iniciar}>
          {saving ? "Iniciando…" : "Iniciar inventário"}
        </button>
      </div>
    </Modal>
  );
}
