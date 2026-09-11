import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import type { RmaOpcao, RmaOpcoesPorTipo, RmaTipoOpcao } from "./types";
import { rmaApi } from "./rmaApi";
import { Panel } from "./ui";

const TIPOS: { tipo: RmaTipoOpcao; rotulo: string; usaCor: boolean }[] = [
  { tipo: "status", rotulo: "Status do protocolo", usaCor: true },
  { tipo: "status_secundario", rotulo: "Status secundário", usaCor: true },
  { tipo: "canal_compra", rotulo: "Canal de compra", usaCor: false },
  { tipo: "modalidade_envio", rotulo: "Modalidade de envio", usaCor: false },
  { tipo: "canal_contato", rotulo: "Canal de contato", usaCor: false },
  { tipo: "motivo_produto", rotulo: "Motivo do produto", usaCor: false },
  { tipo: "estado_embalagem", rotulo: "Estado da embalagem", usaCor: false },
  { tipo: "tipo_solucao", rotulo: "Tipo de solução", usaCor: false },
];

export default function AdminOpcoesTab({ onAtualizado }: { onAtualizado: () => void }) {
  const [tipoAtivo, setTipoAtivo] = useState<RmaTipoOpcao>("status");
  const [opcoes, setOpcoes] = useState<RmaOpcoesPorTipo | null>(null);
  const [novoRotulo, setNovoRotulo] = useState("");
  const [novaCor, setNovaCor] = useState("#64748b");

  const carregar = () => rmaApi.listarOpcoesAdmin().then((r) => setOpcoes(r.opcoes));

  useEffect(() => {
    carregar();
  }, []);

  const configTipo = TIPOS.find((t) => t.tipo === tipoAtivo)!;
  const lista = (opcoes?.[tipoAtivo] || []).slice().sort((a, b) => a.ordem - b.ordem);

  const criar = async () => {
    if (!novoRotulo.trim()) return;
    await rmaApi.criarOpcao(tipoAtivo, novoRotulo, configTipo.usaCor ? novaCor : "");
    setNovoRotulo("");
    await carregar();
    onAtualizado();
  };

  const salvarRotulo = async (opcao: RmaOpcao, rotulo: string, cor: string) => {
    await rmaApi.editarOpcao(opcao.id, { rotulo, cor });
    await carregar();
    onAtualizado();
  };

  const alternarAtiva = async (opcao: RmaOpcao) => {
    await rmaApi.definirAtivaOpcao(opcao.id, !opcao.ativo);
    await carregar();
    onAtualizado();
  };

  const mover = async (index: number, direcao: -1 | 1) => {
    const novaOrdem = lista.slice();
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= novaOrdem.length) return;
    [novaOrdem[index], novaOrdem[alvo]] = [novaOrdem[alvo], novaOrdem[index]];
    await rmaApi.reordenarOpcoes(tipoAtivo, novaOrdem.map((o) => o.id));
    await carregar();
    onAtualizado();
  };

  return (
    <Panel title="Opções configuráveis" subtitle="Cada lista pode ter opções adicionadas, renomeadas, desativadas e reordenadas. Uma opção já usada em algum protocolo nunca é apagada - só desativada.">
      <div className="rma-steps" style={{ marginBottom: 18 }}>
        {TIPOS.map((t) => (
          <button key={t.tipo} className={tipoAtivo === t.tipo ? "rma-step active" : "rma-step"} onClick={() => setTipoAtivo(t.tipo)}>
            {t.rotulo}
          </button>
        ))}
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th></th>
              {configTipo.usaCor && <th>Cor</th>}
              <th>Rótulo</th>
              <th>Valor interno</th>
              <th>Ativa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o, i) => (
              <LinhaOpcao key={o.id} opcao={o} usaCor={configTipo.usaCor} index={i} total={lista.length} onMover={mover} onSalvar={salvarRotulo} onAlternar={alternarAtiva} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="toolbar">
        {configTipo.usaCor && <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} style={{ width: 44, padding: 2 }} />}
        <div className="search" style={{ flex: 1 }}>
          <input value={novoRotulo} onChange={(e) => setNovoRotulo(e.target.value)} placeholder={`Novo rótulo para ${configTipo.rotulo.toLowerCase()}…`} />
        </div>
        <button className="primary" onClick={criar}>
          <Plus size={16} /> Adicionar
        </button>
      </div>
    </Panel>
  );
}

function LinhaOpcao({
  opcao,
  usaCor,
  index,
  total,
  onMover,
  onSalvar,
  onAlternar,
}: {
  opcao: RmaOpcao;
  usaCor: boolean;
  index: number;
  total: number;
  onMover: (index: number, direcao: -1 | 1) => void;
  onSalvar: (opcao: RmaOpcao, rotulo: string, cor: string) => void;
  onAlternar: (opcao: RmaOpcao) => void;
}) {
  const [rotulo, setRotulo] = useState(opcao.rotulo);
  const [cor, setCor] = useState(opcao.cor || "#64748b");

  return (
    <tr>
      <td>
        <button className="icon-btn" disabled={index === 0} onClick={() => onMover(index, -1)}>
          <ArrowUp size={16} />
        </button>
        <button className="icon-btn" disabled={index === total - 1} onClick={() => onMover(index, 1)}>
          <ArrowDown size={16} />
        </button>
      </td>
      {usaCor && (
        <td>
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} style={{ width: 36, padding: 1 }} />
        </td>
      )}
      <td>
        <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} onBlur={() => (rotulo !== opcao.rotulo || cor !== opcao.cor) && onSalvar(opcao, rotulo, cor)} />
      </td>
      <td className="code">{opcao.valor}</td>
      <td>
        <button className={opcao.ativo ? "status ok" : "status warn"} onClick={() => onAlternar(opcao)} style={{ border: 0, cursor: "pointer" }}>
          {opcao.ativo ? "Ativa" : "Inativa"}
        </button>
      </td>
      <td></td>
    </tr>
  );
}
