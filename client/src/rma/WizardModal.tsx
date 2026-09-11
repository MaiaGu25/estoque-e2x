import { useEffect, useState } from "react";
import { ApiError } from "../api";
import type { RmaOpcoesPorTipo, RmaProduto, RmaProtocoloDetalhe } from "./types";
import { rmaApi } from "./rmaApi";
import { Field, Modal, OpcaoBadge, OpcaoSelect, dt, fmtMoeda } from "./ui";

const PASSOS = [
  "Dados do protocolo",
  "Dados do cliente",
  "Detalhes da compra",
  "Reclamação e recebimento",
  "Produtos",
  "Solução",
  "Histórico",
];

type DadosProtocolo = { canalContato: string; status: string; statusSecundario: string };
type DadosCliente = {
  nome: string;
  cpfCnpj: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numeroEndereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};
type DadosCompra = {
  canalCompra: string;
  numeroPedido: string;
  numeroSistema: string;
  dataCompra: string;
  valorCompra: string;
  modalidadeEnvio: string;
  numeroEnvio: string;
  numeroReversa: string;
  numeroRastreio: string;
};
type DadosReclamacao = { descricaoReclamacao: string; observacoesGerais: string };

const CLIENTE_VAZIO: DadosCliente = { nome: "", cpfCnpj: "", telefone: "", email: "", cep: "", logradouro: "", numeroEndereco: "", complemento: "", bairro: "", cidade: "", uf: "" };
const COMPRA_VAZIA: DadosCompra = { canalCompra: "", numeroPedido: "", numeroSistema: "", dataCompra: "", valorCompra: "", modalidadeEnvio: "", numeroEnvio: "", numeroReversa: "", numeroRastreio: "" };

export default function WizardModal({
  protocoloId,
  opcoes,
  onClose,
  onSalvo,
}: {
  protocoloId?: number;
  opcoes: RmaOpcoesPorTipo | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [passo, setPasso] = useState(1);
  const [id, setId] = useState<number | undefined>(protocoloId);
  const [detalhe, setDetalhe] = useState<RmaProtocoloDetalhe | null>(null);
  const [dadosProtocolo, setDadosProtocolo] = useState<DadosProtocolo>({ canalContato: "", status: "", statusSecundario: "" });
  const [dadosCliente, setDadosCliente] = useState<DadosCliente>(CLIENTE_VAZIO);
  const [dadosCompra, setDadosCompra] = useState<DadosCompra>(COMPRA_VAZIA);
  const [dadosReclamacao, setDadosReclamacao] = useState<DadosReclamacao>({ descricaoReclamacao: "", observacoesGerais: "" });
  const [duplicados, setDuplicados] = useState<any[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(!!protocoloId);

  useEffect(() => {
    if (!protocoloId) {
      const statusPadrao = opcoes?.status.find((o) => o.valor === "em_aberto")?.valor || opcoes?.status[0]?.valor || "";
      setDadosProtocolo((d) => ({ ...d, status: statusPadrao }));
      return;
    }
    rmaApi.detalhe(protocoloId).then((r) => preencherDeDetalhe(r.protocolo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocoloId]);

  function preencherDeDetalhe(p: RmaProtocoloDetalhe) {
    setDetalhe(p);
    setId(p.id);
    setDadosProtocolo({ canalContato: p.canal_contato, status: p.status, statusSecundario: p.status_secundario || "" });
    setDadosCliente({
      nome: p.cliente.nome,
      cpfCnpj: p.cliente.cpf_cnpj,
      telefone: p.cliente.telefone,
      email: p.cliente.email,
      cep: p.cliente.cep,
      logradouro: p.cliente.logradouro,
      numeroEndereco: p.cliente.numero_endereco,
      complemento: p.cliente.complemento,
      bairro: p.cliente.bairro,
      cidade: p.cliente.cidade,
      uf: p.cliente.uf,
    });
    setDadosCompra({
      canalCompra: p.canal_compra,
      numeroPedido: p.numero_pedido,
      numeroSistema: p.numero_sistema,
      dataCompra: p.data_compra || "",
      valorCompra: p.valor_compra !== null ? String(p.valor_compra) : "",
      modalidadeEnvio: p.modalidade_envio,
      numeroEnvio: p.numero_envio,
      numeroReversa: p.numero_reversa,
      numeroRastreio: p.numero_rastreio,
    });
    setDadosReclamacao({ descricaoReclamacao: p.descricao_reclamacao, observacoesGerais: p.observacoes_gerais });
    setCarregando(false);
  }

  async function recarregarDetalhe() {
    if (!id) return;
    const r = await rmaApi.detalhe(id);
    setDetalhe(r.protocolo);
  }

  async function criarProtocolo(confirmarDuplicidade = false) {
    setErro("");
    setSalvando(true);
    try {
      const dados = {
        canalContato: dadosProtocolo.canalContato,
        status: dadosProtocolo.status,
        statusSecundario: dadosProtocolo.statusSecundario || undefined,
        ...dadosCompra,
        valorCompra: dadosCompra.valorCompra ? Number(dadosCompra.valorCompra) : undefined,
        ...dadosReclamacao,
      };
      const resp = await rmaApi.criar(dados, dadosCliente, confirmarDuplicidade);
      setDuplicados(null);
      preencherDeDetalhe(resp.protocolo);
      setPasso(5);
    } catch (e) {
      if (e instanceof ApiError && (e.body as any)?.duplicados) {
        setDuplicados((e.body as any).duplicados);
      } else {
        setErro(e instanceof ApiError ? e.message : "Não foi possível cadastrar o protocolo.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function salvarProtocolo(avancar: boolean) {
    if (!id) return criarProtocolo();
    setErro("");
    setSalvando(true);
    try {
      await rmaApi.atualizar(id, {
        canalContato: dadosProtocolo.canalContato,
        status: dadosProtocolo.status,
        statusSecundario: dadosProtocolo.statusSecundario || null,
        ...dadosCompra,
        valorCompra: dadosCompra.valorCompra ? Number(dadosCompra.valorCompra) : null,
        ...dadosReclamacao,
      });
      await recarregarDetalhe();
      if (avancar) setPasso(passo + 1);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarCliente(avancar: boolean) {
    setErro("");
    setSalvando(true);
    try {
      if (!id) {
        if (avancar) setPasso(passo + 1);
        return;
      }
      await rmaApi.atualizarCliente(id, dadosCliente);
      await recarregarDetalhe();
      if (avancar) setPasso(passo + 1);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível salvar os dados do cliente.");
    } finally {
      setSalvando(false);
    }
  }

  const verificarDuplicidade = async () => {
    const r = await rmaApi.verificarDuplicidade({
      numeroPedido: dadosCompra.numeroPedido,
      numeroRastreio: dadosCompra.numeroRastreio,
      cpfCnpj: dadosCliente.cpfCnpj,
      excluirProtocoloId: id,
    });
    setDuplicados(r.duplicados);
  };

  const podeAvancarSemSalvar = !id; // etapas 1-4 antes de existir o protocolo: só navegação local
  const ultimoPasso = passo === PASSOS.length;

  return (
    <Modal
      title={detalhe ? `Protocolo ${detalhe.numero_protocolo}` : "Novo protocolo de RMA/SAC"}
      subtitle={PASSOS[passo - 1]}
      onClose={onClose}
      wide
    >
      {carregando ? (
        <p>Carregando…</p>
      ) : (
        <>
          <div className="rma-steps">
            {PASSOS.map((nome, i) => (
              <button
                key={nome}
                className={passo === i + 1 ? "rma-step active" : "rma-step"}
                disabled={!id && i + 1 > 4}
                onClick={() => setPasso(i + 1)}
              >
                {i + 1}. {nome}
              </button>
            ))}
          </div>

          {erro && <div className="error">{erro}</div>}
          {!!duplicados?.length && (
            <div className="error" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <strong>Já existe protocolo em andamento com esses dados:</strong>
              <ul>
                {duplicados.map((d) => (
                  <li key={d.id}>
                    {d.numero_protocolo} - {d.cliente_nome} ({d.numero_pedido || d.numero_rastreio})
                  </li>
                ))}
              </ul>
              <button className="secondary" onClick={() => criarProtocolo(true)} disabled={salvando}>
                Cadastrar mesmo assim
              </button>
            </div>
          )}

          {passo === 1 && (
            <div className="form-grid">
              <Field label="Canal de contato">
                <OpcaoSelect opcoes={opcoes} tipo="canal_contato" value={dadosProtocolo.canalContato} onChange={(v) => setDadosProtocolo({ ...dadosProtocolo, canalContato: v })} />
              </Field>
              <Field label="Status">
                <OpcaoSelect opcoes={opcoes} tipo="status" value={dadosProtocolo.status} onChange={(v) => setDadosProtocolo({ ...dadosProtocolo, status: v })} obrigatorio />
              </Field>
              <Field label="Status secundário (opcional)">
                <OpcaoSelect opcoes={opcoes} tipo="status_secundario" value={dadosProtocolo.statusSecundario} onChange={(v) => setDadosProtocolo({ ...dadosProtocolo, statusSecundario: v })} />
              </Field>
              {detalhe && (
                <Field label="Aberto em">
                  <input value={dt(detalhe.data_abertura)} disabled />
                </Field>
              )}
            </div>
          )}

          {passo === 2 && (
            <div className="form-grid">
              <Field label="Nome do cliente">
                <input value={dadosCliente.nome} onChange={(e) => setDadosCliente({ ...dadosCliente, nome: e.target.value })} />
              </Field>
              <Field label="CPF/CNPJ">
                <input value={dadosCliente.cpfCnpj} onChange={(e) => setDadosCliente({ ...dadosCliente, cpfCnpj: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <input value={dadosCliente.telefone} onChange={(e) => setDadosCliente({ ...dadosCliente, telefone: e.target.value })} />
              </Field>
              <Field label="E-mail">
                <input value={dadosCliente.email} onChange={(e) => setDadosCliente({ ...dadosCliente, email: e.target.value })} />
              </Field>
              <Field label="CEP">
                <input value={dadosCliente.cep} onChange={(e) => setDadosCliente({ ...dadosCliente, cep: e.target.value })} />
              </Field>
              <Field label="Logradouro">
                <input value={dadosCliente.logradouro} onChange={(e) => setDadosCliente({ ...dadosCliente, logradouro: e.target.value })} />
              </Field>
              <Field label="Número">
                <input value={dadosCliente.numeroEndereco} onChange={(e) => setDadosCliente({ ...dadosCliente, numeroEndereco: e.target.value })} />
              </Field>
              <Field label="Complemento">
                <input value={dadosCliente.complemento} onChange={(e) => setDadosCliente({ ...dadosCliente, complemento: e.target.value })} />
              </Field>
              <Field label="Bairro">
                <input value={dadosCliente.bairro} onChange={(e) => setDadosCliente({ ...dadosCliente, bairro: e.target.value })} />
              </Field>
              <Field label="Cidade">
                <input value={dadosCliente.cidade} onChange={(e) => setDadosCliente({ ...dadosCliente, cidade: e.target.value })} />
              </Field>
              <Field label="UF">
                <input value={dadosCliente.uf} maxLength={2} onChange={(e) => setDadosCliente({ ...dadosCliente, uf: e.target.value.toUpperCase() })} />
              </Field>
            </div>
          )}

          {passo === 3 && (
            <div className="form-grid">
              <Field label="Canal de compra">
                <OpcaoSelect opcoes={opcoes} tipo="canal_compra" value={dadosCompra.canalCompra} onChange={(v) => setDadosCompra({ ...dadosCompra, canalCompra: v })} obrigatorio />
              </Field>
              <Field label="Nº do pedido" hint="Aceita com ou sem espaço/pontuação">
                <input value={dadosCompra.numeroPedido} onChange={(e) => setDadosCompra({ ...dadosCompra, numeroPedido: e.target.value })} />
              </Field>
              <Field label="Nº do sistema">
                <input value={dadosCompra.numeroSistema} onChange={(e) => setDadosCompra({ ...dadosCompra, numeroSistema: e.target.value })} />
              </Field>
              <Field label="Data da compra">
                <input type="date" value={dadosCompra.dataCompra} onChange={(e) => setDadosCompra({ ...dadosCompra, dataCompra: e.target.value })} />
              </Field>
              <Field label="Valor da compra">
                <input type="number" step="0.01" value={dadosCompra.valorCompra} onChange={(e) => setDadosCompra({ ...dadosCompra, valorCompra: e.target.value })} />
              </Field>
              <Field label="Modalidade de envio">
                <OpcaoSelect opcoes={opcoes} tipo="modalidade_envio" value={dadosCompra.modalidadeEnvio} onChange={(v) => setDadosCompra({ ...dadosCompra, modalidadeEnvio: v })} />
              </Field>
              <Field label="Nº do envio">
                <input value={dadosCompra.numeroEnvio} onChange={(e) => setDadosCompra({ ...dadosCompra, numeroEnvio: e.target.value })} />
              </Field>
              <Field label="Nº da reversa">
                <input value={dadosCompra.numeroReversa} onChange={(e) => setDadosCompra({ ...dadosCompra, numeroReversa: e.target.value })} />
              </Field>
              <Field label="Nº de rastreio">
                <input value={dadosCompra.numeroRastreio} onChange={(e) => setDadosCompra({ ...dadosCompra, numeroRastreio: e.target.value })} />
              </Field>
              <div style={{ alignSelf: "end" }}>
                <button className="secondary" onClick={verificarDuplicidade} type="button">
                  Verificar duplicidade
                </button>
              </div>
            </div>
          )}

          {passo === 4 && (
            <div className="form-grid">
              <Field label="Descrição da reclamação">
                <textarea value={dadosReclamacao.descricaoReclamacao} onChange={(e) => setDadosReclamacao({ ...dadosReclamacao, descricaoReclamacao: e.target.value })} />
              </Field>
              <Field label="Observações gerais">
                <textarea value={dadosReclamacao.observacoesGerais} onChange={(e) => setDadosReclamacao({ ...dadosReclamacao, observacoesGerais: e.target.value })} />
              </Field>
              {detalhe && (
                <Field label="Recebido em">
                  <input value={dt(detalhe.data_recebimento)} disabled />
                </Field>
              )}
            </div>
          )}

          {passo === 5 && id && <PassoProdutos protocoloId={id} produtos={detalhe?.produtos || []} opcoes={opcoes} onAtualizado={recarregarDetalhe} />}
          {passo === 6 && id && <PassoSolucao protocoloId={id} solucao={detalhe?.solucao || null} opcoes={opcoes} onAtualizado={recarregarDetalhe} />}
          {passo === 7 && id && <PassoHistorico protocoloId={id} detalhe={detalhe} onAtualizado={recarregarDetalhe} />}

          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button className="secondary" onClick={onClose}>
              Cancelar edição
            </button>
            <div style={{ display: "flex", gap: 9 }}>
              {passo > 1 && (
                <button className="secondary" onClick={() => setPasso(passo - 1)}>
                  Anterior
                </button>
              )}
              {passo <= 4 && podeAvancarSemSalvar && passo < 4 && (
                <button className="secondary" onClick={() => setPasso(passo + 1)}>
                  Próximo
                </button>
              )}
              {passo <= 4 && podeAvancarSemSalvar && passo === 4 && (
                <button className="primary" onClick={() => criarProtocolo(false)} disabled={salvando}>
                  {salvando ? "Cadastrando…" : "Salvar e continuar"}
                </button>
              )}
              {passo === 1 && !podeAvancarSemSalvar && (
                <>
                  <button className="secondary" onClick={() => salvarProtocolo(false)} disabled={salvando}>
                    Salvar
                  </button>
                  <button className="primary" onClick={() => salvarProtocolo(true)} disabled={salvando}>
                    Salvar e continuar
                  </button>
                </>
              )}
              {passo === 2 && !podeAvancarSemSalvar && (
                <>
                  <button className="secondary" onClick={() => salvarCliente(false)} disabled={salvando}>
                    Salvar
                  </button>
                  <button className="primary" onClick={() => salvarCliente(true)} disabled={salvando}>
                    Salvar e continuar
                  </button>
                </>
              )}
              {(passo === 3 || passo === 4) && !podeAvancarSemSalvar && (
                <>
                  <button className="secondary" onClick={() => salvarProtocolo(false)} disabled={salvando}>
                    Salvar
                  </button>
                  <button className="primary" onClick={() => salvarProtocolo(true)} disabled={salvando}>
                    Salvar e continuar
                  </button>
                </>
              )}
              {passo >= 5 && !ultimoPasso && (
                <button className="primary" onClick={() => setPasso(passo + 1)}>
                  Próximo
                </button>
              )}
              {ultimoPasso && (
                <button
                  className="primary"
                  onClick={() => {
                    onSalvo();
                    onClose();
                  }}
                >
                  Concluir
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function PassoProdutos({
  protocoloId,
  produtos,
  opcoes,
  onAtualizado,
}: {
  protocoloId: number;
  produtos: RmaProduto[];
  opcoes: RmaOpcoesPorTipo | null;
  onAtualizado: () => void;
}) {
  const [novo, setNovo] = useState({ codigoSku: "", descricao: "", quantidade: "1", valorUnitario: "", motivo: "", estadoEmbalagem: "", defeitoRelatado: "", numeroSerial: "", observacao: "" });
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ code: string; name: string }[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!busca.trim()) return setResultados([]);
    const t = setTimeout(() => rmaApi.buscarReferenciaEstoque(busca).then((r) => setResultados(r.resultados)), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const adicionar = async () => {
    if (!novo.descricao.trim()) return setErro("Informe a descrição do produto.");
    setErro("");
    setSalvando(true);
    try {
      await rmaApi.adicionarProduto(protocoloId, { ...novo, quantidade: Number(novo.quantidade) || 1, valorUnitario: novo.valorUnitario ? Number(novo.valorUnitario) : undefined });
      setNovo({ codigoSku: "", descricao: "", quantidade: "1", valorUnitario: "", motivo: "", estadoEmbalagem: "", defeitoRelatado: "", numeroSerial: "", observacao: "" });
      setBusca("");
      onAtualizado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível adicionar o produto.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: number, descricao: string) => {
    if (!confirm(`Remover o produto "${descricao}" deste protocolo?`)) return;
    await rmaApi.removerProduto(id);
    onAtualizado();
  };

  return (
    <div>
      <p className="field-hint">Vincular um produto aqui é só descritivo - nunca movimenta o estoque geral.</p>
      {!!produtos.length && (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Código/SKU</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Valor total</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <td className="code">{p.codigo_sku || "-"}</td>
                  <td>{p.descricao}</td>
                  <td className="num">{p.quantidade}</td>
                  <td className="num">{fmtMoeda(p.valor_total)}</td>
                  <td>{opcoes?.motivo_produto.find((o) => o.valor === p.motivo)?.rotulo || p.motivo || "-"}</td>
                  <td>
                    <button className="secondary" onClick={() => remover(p.id, p.descricao)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {erro && <div className="error">{erro}</div>}
      <div className="form-grid">
        <div className="part-search">
          <Field label="Código/SKU (busca no estoque geral)">
            <input value={novo.codigoSku || busca} onChange={(e) => { setNovo({ ...novo, codigoSku: e.target.value }); setBusca(e.target.value); }} />
          </Field>
          {!!resultados.length && (
            <div className="results">
              {resultados.map((r) => (
                <button key={r.code} onClick={() => { setNovo({ ...novo, codigoSku: r.code, descricao: novo.descricao || r.name }); setResultados([]); setBusca(r.code); }}>
                  <span>{r.code}</span>
                  <small>{r.name}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="Descrição">
          <input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
        </Field>
        <Field label="Quantidade">
          <input type="number" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
        </Field>
        <Field label="Valor unitário">
          <input type="number" step="0.01" value={novo.valorUnitario} onChange={(e) => setNovo({ ...novo, valorUnitario: e.target.value })} />
        </Field>
        <Field label="Motivo">
          <OpcaoSelect opcoes={opcoes} tipo="motivo_produto" value={novo.motivo} onChange={(v) => setNovo({ ...novo, motivo: v })} />
        </Field>
        <Field label="Estado da embalagem">
          <OpcaoSelect opcoes={opcoes} tipo="estado_embalagem" value={novo.estadoEmbalagem} onChange={(v) => setNovo({ ...novo, estadoEmbalagem: v })} />
        </Field>
        <Field label="Defeito relatado pelo cliente">
          <input value={novo.defeitoRelatado} onChange={(e) => setNovo({ ...novo, defeitoRelatado: e.target.value })} />
        </Field>
        <Field label="Nº de série (opcional)">
          <input value={novo.numeroSerial} onChange={(e) => setNovo({ ...novo, numeroSerial: e.target.value })} />
        </Field>
        <Field label="Observação">
          <input value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} />
        </Field>
      </div>
      <button className="primary" onClick={adicionar} disabled={salvando}>
        Adicionar produto
      </button>
    </div>
  );
}

function PassoSolucao({ protocoloId, solucao, opcoes, onAtualizado }: { protocoloId: number; solucao: any; opcoes: RmaOpcoesPorTipo | null; onAtualizado: () => void }) {
  const [tipoSolucao, setTipoSolucao] = useState(solucao?.tipo_solucao || "");
  const [descricao, setDescricao] = useState(solucao?.descricao || "");
  const [valorReembolso, setValorReembolso] = useState(solucao?.valor_reembolso ? String(solucao.valor_reembolso) : "");
  const [pecaEnviada, setPecaEnviada] = useState(solucao?.peca_enviada || "");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setTipoSolucao(solucao?.tipo_solucao || "");
    setDescricao(solucao?.descricao || "");
    setValorReembolso(solucao?.valor_reembolso ? String(solucao.valor_reembolso) : "");
    setPecaEnviada(solucao?.peca_enviada || "");
  }, [solucao]);

  const salvar = async () => {
    if (!tipoSolucao) return setErro("Selecione o tipo de solução.");
    setErro("");
    setSalvando(true);
    try {
      await rmaApi.salvarSolucao(protocoloId, { tipoSolucao, descricao, valorReembolso: valorReembolso ? Number(valorReembolso) : undefined, pecaEnviada });
      setConfirmando(false);
      onAtualizado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível registrar a solução.");
    } finally {
      setSalvando(false);
    }
  };

  const rotuloTipo = opcoes?.tipo_solucao.find((o) => o.valor === tipoSolucao)?.rotulo || tipoSolucao;

  return (
    <div>
      <p className="field-hint">Registrar a solução não movimenta, reserva nem desconta estoque em nenhum caso.</p>
      {erro && <div className="error">{erro}</div>}
      {!confirmando ? (
        <>
          <div className="form-grid">
            <Field label="Tipo de solução">
              <OpcaoSelect opcoes={opcoes} tipo="tipo_solucao" value={tipoSolucao} onChange={setTipoSolucao} obrigatorio />
            </Field>
            {tipoSolucao === "reembolso" && (
              <Field label="Valor do reembolso">
                <input type="number" step="0.01" value={valorReembolso} onChange={(e) => setValorReembolso(e.target.value)} />
              </Field>
            )}
            {(tipoSolucao === "envio_peca" || tipoSolucao === "troca_produto") && (
              <Field label="Peça/produto enviado">
                <input value={pecaEnviada} onChange={(e) => setPecaEnviada(e.target.value)} />
              </Field>
            )}
            <Field label="Descrição da solução">
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </Field>
          </div>
          <button className="primary" onClick={() => setConfirmando(true)} disabled={!tipoSolucao}>
            Revisar e confirmar
          </button>
        </>
      ) : (
        <div className="detail-meta">
          <div>
            <span>Tipo de solução</span>
            <b>{rotuloTipo}</b>
          </div>
          {valorReembolso && (
            <div>
              <span>Valor do reembolso</span>
              <b>{fmtMoeda(Number(valorReembolso))}</b>
            </div>
          )}
          {pecaEnviada && (
            <div>
              <span>Peça/produto enviado</span>
              <b>{pecaEnviada}</b>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <span>Descrição</span>
            <b>{descricao || "-"}</b>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 9, marginTop: 8 }}>
            <button className="secondary" onClick={() => setConfirmando(false)}>
              Voltar e editar
            </button>
            <button className="primary" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Confirmar solução"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PassoHistorico({ protocoloId, detalhe, onAtualizado }: { protocoloId: number; detalhe: RmaProtocoloDetalhe | null; onAtualizado: () => void }) {
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!texto.trim() && !foto) return;
    setEnviando(true);
    try {
      await rmaApi.adicionarNota(protocoloId, texto, foto);
      setTexto("");
      setFoto(null);
      onAtualizado();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <div className="table-wrap" style={{ maxHeight: 320, marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Campo</th>
              <th>Valor anterior</th>
              <th>Valor novo</th>
            </tr>
          </thead>
          <tbody>
            {(detalhe?.historico || []).map((h) => (
              <tr key={h.id}>
                <td>{dt(h.created_at)}</td>
                <td>{h.user_name}</td>
                <td>{h.acao}</td>
                <td>{h.campo || "-"}</td>
                <td>{h.valor_anterior ?? "-"}</td>
                <td>{h.valor_novo ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Adicionar observação">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma nota livre sobre o protocolo…" />
      </Field>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return setFoto(null);
          const leitor = new FileReader();
          leitor.onload = () => setFoto(String(leitor.result));
          leitor.readAsDataURL(arquivo);
        }}
      />
      <div style={{ marginTop: 10 }}>
        <button className="secondary" onClick={enviar} disabled={enviando || (!texto.trim() && !foto)}>
          {enviando ? "Enviando…" : "Adicionar ao histórico"}
        </button>
      </div>
    </div>
  );
}
