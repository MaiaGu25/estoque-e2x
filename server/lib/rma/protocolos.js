const crypto = require("crypto");
const { db, transaction } = require("../../db");
const { nowStamp, normalizarNumero, normalizarDocumento, coluna: validarColuna } = require("../../util");
const opcoes = require("./opcoes");
const clientes = require("./clientes");
const historico = require("./auditoria");
const anexos = require("./anexos");

// Números que aceitam o valor "com ou sem espaço/pontuação" na busca -
// cada um guarda o valor original numa coluna e a versão normalizada na
// coluna "_normalizado" ao lado, usada para indexar/buscar.
const CAMPOS_NUMERO = ["numeroPedido", "numeroSistema", "numeroEnvio", "numeroReversa", "numeroRastreio"];
const COLUNA_NUMERO = {
  numeroPedido: "numero_pedido",
  numeroSistema: "numero_sistema",
  numeroEnvio: "numero_envio",
  numeroReversa: "numero_reversa",
  numeroRastreio: "numero_rastreio",
};

// Campos do protocolo (fora números/cliente) editáveis pelas etapas do
// wizard.
const CAMPOS_PROTOCOLO = {
  canalContato: "canal_contato",
  canalCompra: "canal_compra",
  modalidadeEnvio: "modalidade_envio",
  dataCompra: "data_compra",
  valorCompra: "valor_compra",
  descricaoReclamacao: "descricao_reclamacao",
  observacoesGerais: "observacoes_gerais",
  status: "status",
  statusSecundario: "status_secundario",
};

// Campos cuja coluna é NULL-ável de verdade (status_secundario, data e
// valor da compra) - todos os outros em CAMPOS_PROTOCOLO são
// "TEXT NOT NULL DEFAULT ''" no banco, então "vazio" para eles precisa
// virar string vazia, nunca NULL (um INSERT/UPDATE com NULL explícito
// viola a constraint mesmo a coluna tendo DEFAULT '').
const CAMPOS_PROTOCOLO_NULAVEIS = new Set(["statusSecundario", "dataCompra", "valorCompra"]);

function valorColunaProtocolo(campo, valorBruto) {
  if (typeof valorBruto === "number") return valorBruto;
  const texto = String(valorBruto ?? "").trim();
  if (texto) return texto;
  return CAMPOS_PROTOCOLO_NULAVEIS.has(campo) ? null : "";
}

const TIPO_OPCAO_DO_CAMPO = {
  canalContato: "canal_contato",
  canalCompra: "canal_compra",
  modalidadeEnvio: "modalidade_envio",
  status: "status",
  statusSecundario: "status_secundario",
};

function gerarNumeroProtocolo() {
  const hoje = nowStamp().slice(0, 10).replace(/-/g, "");
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const sufixo = String(crypto.randomInt(0, 100000)).padStart(5, "0");
    const numero = `RMA-${hoje}-${sufixo}`;
    if (!db.prepare("SELECT 1 FROM rma_protocolos WHERE numero_protocolo = ?").get(numero)) return numero;
  }
  throw new Error("Não foi possível gerar um número de protocolo único. Tente novamente.");
}

// Valida cada campo admin-configurável recebido: precisa ser uma opção
// ativa (se estiver mudando de valor) ou pode continuar sendo uma opção
// já desativada (se o valor não mudou - protocolo antigo mantém a opção
// que já tinha).
function validarOpcoes(dados, valoresAtuais) {
  for (const [campo, tipo] of Object.entries(TIPO_OPCAO_DO_CAMPO)) {
    if (dados[campo] === undefined) continue;
    const valor = String(dados[campo] || "").trim();
    const valorAtual = valoresAtuais ? valoresAtuais[CAMPOS_PROTOCOLO[campo]] : null;
    if (valor && valor !== valorAtual && !opcoes.ativaExiste(tipo, valor)) {
      throw new Error(`Valor inválido para ${campo}: "${valor}" não é uma opção ativa.`);
    }
  }
}

function montarDetalhe(protocolo) {
  if (!protocolo) return null;
  return {
    ...protocolo,
    cliente: clientes.buscarPorId(protocolo.cliente_id),
    produtos: db.prepare("SELECT * FROM rma_produtos WHERE protocolo_id = ? ORDER BY id").all(protocolo.id),
    solucao: db.prepare("SELECT * FROM rma_solucoes WHERE protocolo_id = ?").get(protocolo.id) || null,
    anexos: db.prepare("SELECT * FROM rma_anexos WHERE protocolo_id = ? ORDER BY id").all(protocolo.id),
    historico: historico.listarPorProtocolo(protocolo.id),
    recebimentos: db.prepare("SELECT * FROM rma_recebimentos WHERE protocolo_id = ? ORDER BY id").all(protocolo.id),
  };
}

function buscarPorId(id) {
  return db.prepare("SELECT * FROM rma_protocolos WHERE id = ?").get(id);
}

function buscarDetalhe(id) {
  return montarDetalhe(buscarPorId(id));
}

// Usada pelo passo "Pesquisar antes de cadastrar"/duplicidade: qualquer
// protocolo ainda em andamento (não encerrado/cancelado) com o mesmo
// pedido, rastreio ou cliente (CPF/CNPJ) já digitado.
function verificarDuplicidade({ numeroPedido, numeroRastreio, cpfCnpj, excluirProtocoloId }) {
  const condicoes = [];
  const parametros = [];
  const pedidoNorm = normalizarNumero(numeroPedido);
  const rastreioNorm = normalizarNumero(numeroRastreio);
  const cpfCnpjNorm = normalizarDocumento(cpfCnpj);

  if (pedidoNorm) {
    condicoes.push("p.numero_pedido_normalizado = ?");
    parametros.push(pedidoNorm);
  }
  if (rastreioNorm) {
    condicoes.push("p.numero_rastreio_normalizado = ?");
    parametros.push(rastreioNorm);
  }
  if (cpfCnpjNorm) {
    condicoes.push("c.cpf_cnpj_normalizado = ?");
    parametros.push(cpfCnpjNorm);
  }
  if (!condicoes.length) return [];

  let sql = `SELECT p.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj
             FROM rma_protocolos p JOIN rma_clientes c ON c.id = p.cliente_id
             WHERE p.status NOT IN ('encerrado','cancelado') AND (${condicoes.join(" OR ")})`;
  if (excluirProtocoloId) {
    sql += " AND p.id != ?";
    parametros.push(excluirProtocoloId);
  }
  return db.prepare(sql).all(...parametros);
}

// Cria o protocolo (etapas 1-4 do wizard de uma vez: dados do
// protocolo/cliente/compra/reclamação). Produtos e solução são passos
// separados (produtos.js / solucoes.js), adicionados depois de o
// protocolo já existir.
// Versão "core" (sem BEGIN/COMMIT próprio) para poder ser chamada de
// dentro de outra transaction() (ex.: excel.js na importação em lote).
function criarCore({ dados, cliente, user, confirmarDuplicidade }) {
  if (!confirmarDuplicidade) {
    const duplicados = verificarDuplicidade({
      numeroPedido: dados.numeroPedido,
      numeroRastreio: dados.numeroRastreio,
      cpfCnpj: cliente?.cpfCnpj,
    });
    if (duplicados.length) {
      const erro = new Error("Já existe um protocolo em andamento com esse pedido/rastreio/cliente.");
      erro.duplicados = duplicados;
      throw erro;
    }
  }

  validarOpcoes(dados, null);
  const statusInicial = String(dados.status || "em_aberto").trim();
  if (!opcoes.ativaExiste("status", statusInicial)) throw new Error("Status inicial inválido.");

  const clienteSalvo = clientes.salvarCore({ id: null, dados: cliente || {} });

  const numeroProtocolo = gerarNumeroProtocolo();
  const now = nowStamp();
  const colunas = ["numero_protocolo", "status", "cliente_id", "data_abertura", "created_by", "created_at", "updated_by", "updated_at"];
  const valores = [numeroProtocolo, statusInicial, clienteSalvo.id, now, user?.id ?? null, now, user?.id ?? null, now];

  for (const campo of CAMPOS_NUMERO) {
    const valorOriginal = String(dados[campo] || "").trim();
    colunas.push(validarColuna(COLUNA_NUMERO[campo]), `${validarColuna(COLUNA_NUMERO[campo])}_normalizado`);
    valores.push(valorOriginal, normalizarNumero(valorOriginal));
  }
  for (const [campo, coluna] of Object.entries(CAMPOS_PROTOCOLO)) {
    if (campo === "status") continue;
    if (dados[campo] === undefined) continue;
    colunas.push(validarColuna(coluna));
    valores.push(valorColunaProtocolo(campo, dados[campo]));
  }

  const result = db
    .prepare(`INSERT INTO rma_protocolos (${colunas.join(",")}) VALUES (${colunas.map(() => "?").join(",")})`)
    .run(...valores);

  historico.registrar({ protocoloId: result.lastInsertRowid, acao: "protocolo.criar", valorNovo: numeroProtocolo, user });
  return buscarDetalhe(result.lastInsertRowid);
}

const criar = transaction(criarCore);

// Atualiza campos do protocolo (qualquer etapa do wizard que não seja
// produtos/solução) e registra uma entrada de histórico por campo que
// realmente mudou.
const atualizar = transaction(({ id, dados, user }) => {
  const atual = buscarPorId(id);
  if (!atual) throw new Error("Protocolo não encontrado.");

  validarOpcoes(dados, atual);

  const anterior = {};
  const novo = {};
  const setClauses = [];
  const valores = [];

  for (const campo of CAMPOS_NUMERO) {
    if (dados[campo] === undefined) continue;
    const coluna = COLUNA_NUMERO[campo];
    const valorOriginal = String(dados[campo] || "").trim();
    anterior[coluna] = atual[coluna];
    novo[coluna] = valorOriginal;
    setClauses.push(`${validarColuna(coluna)} = ?`, `${coluna}_normalizado = ?`);
    valores.push(valorOriginal, normalizarNumero(valorOriginal));
  }
  for (const [campo, coluna] of Object.entries(CAMPOS_PROTOCOLO)) {
    if (dados[campo] === undefined) continue;
    const valor = valorColunaProtocolo(campo, dados[campo]);
    anterior[coluna] = atual[coluna];
    novo[coluna] = valor;
    setClauses.push(`${validarColuna(coluna)} = ?`);
    valores.push(valor);
  }

  if (!setClauses.length) throw new Error("Nada para atualizar.");

  // Datas de marco batem sozinhas com o status, sem precisar o usuário
  // preencher à mão.
  if (novo.status && novo.status !== atual.status) {
    const now = nowStamp();
    if (novo.status === "solucionado" && !atual.data_solucao) {
      setClauses.push("data_solucao = ?");
      valores.push(now);
    }
    if ((novo.status === "encerrado" || novo.status === "cancelado") && !atual.data_encerramento) {
      setClauses.push("data_encerramento = ?");
      valores.push(now);
    }
  }

  setClauses.push("updated_by = ?", "updated_at = ?");
  valores.push(user?.id ?? null, nowStamp(), id);

  db.prepare(`UPDATE rma_protocolos SET ${setClauses.join(", ")} WHERE id = ?`).run(...valores);
  historico.registrarDiferencas({ protocoloId: id, acao: "protocolo.editar", anterior, novo, user });

  return buscarDetalhe(id);
});

// Atualiza os dados do cliente vinculado a um protocolo já existente
// (etapa "Dados do cliente" do wizard).
const atualizarCliente = transaction(({ protocoloId, dados, user }) => {
  const protocolo = buscarPorId(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const clienteAnterior = clientes.buscarPorId(protocolo.cliente_id);
  const clienteSalvo = clientes.salvarCore({ id: protocolo.cliente_id, dados });
  if (clienteSalvo.id !== protocolo.cliente_id) {
    db.prepare("UPDATE rma_protocolos SET cliente_id = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      clienteSalvo.id,
      user?.id ?? null,
      nowStamp(),
      protocoloId
    );
  }
  historico.registrarDiferencas({
    protocoloId,
    acao: "cliente.editar",
    anterior: clienteAnterior || {},
    novo: clienteSalvo,
    user,
  });
  return buscarDetalhe(protocoloId);
});

function listar({
  numeroProtocolo,
  status,
  canalCompra,
  cpfCnpj,
  numeroPedido,
  numeroSistema,
  numeroEnvio,
  numeroReversa,
  numeroRastreio,
  cliente,
  dataAberturaDe,
  dataAberturaAte,
  pagina = 1,
  porPagina = 30,
  ordenarPor = "data_abertura",
  ordem = "DESC",
} = {}) {
  const condicoes = [];
  const parametros = [];

  if (numeroProtocolo) {
    condicoes.push("p.numero_protocolo LIKE ?");
    parametros.push(`%${numeroProtocolo}%`);
  }
  if (status) {
    condicoes.push("p.status = ?");
    parametros.push(status);
  }
  if (canalCompra) {
    condicoes.push("p.canal_compra = ?");
    parametros.push(canalCompra);
  }
  if (cliente) {
    condicoes.push("c.nome LIKE ?");
    parametros.push(`%${cliente}%`);
  }
  if (cpfCnpj) {
    condicoes.push("c.cpf_cnpj_normalizado = ?");
    parametros.push(normalizarDocumento(cpfCnpj));
  }
  const camposBuscaNumero = { numeroPedido, numeroSistema, numeroEnvio, numeroReversa, numeroRastreio };
  for (const [campo, valor] of Object.entries(camposBuscaNumero)) {
    if (!valor) continue;
    condicoes.push(`p.${COLUNA_NUMERO[campo]}_normalizado = ?`);
    parametros.push(normalizarNumero(valor));
  }
  if (dataAberturaDe) {
    condicoes.push("p.data_abertura >= ?");
    parametros.push(dataAberturaDe);
  }
  if (dataAberturaAte) {
    condicoes.push("p.data_abertura <= ?");
    parametros.push(`${dataAberturaAte} 23:59:59`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const colunasOrdenaveis = new Set(["data_abertura", "numero_protocolo", "status", "data_recebimento", "updated_at"]);
  const colunaOrdem = colunasOrdenaveis.has(ordenarPor) ? ordenarPor : "data_abertura";
  const direcao = String(ordem).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM rma_protocolos p JOIN rma_clientes c ON c.id = p.cliente_id ${where}`)
    .get(...parametros);

  const paginaSegura = Math.max(1, Number(pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(porPagina) || 30));
  const offset = (paginaSegura - 1) * tamanhoPagina;

  const linhas = db
    .prepare(
      `SELECT p.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj
       FROM rma_protocolos p JOIN rma_clientes c ON c.id = p.cliente_id
       ${where}
       ORDER BY p.${colunaOrdem} ${direcao}, p.id ${direcao}
       LIMIT ? OFFSET ?`
    )
    .all(...parametros, tamanhoPagina, offset);

  return { total: totalRow.total, pagina: paginaSegura, porPagina: tamanhoPagina, linhas };
}

// Comentário/nota livre + foto opcional no histórico do protocolo -
// mesma funcionalidade que já existia no módulo antigo (composer de
// comentário+foto), preservada aqui como uma entrada de histórico
// (nunca editável/apagável) em vez de uma tabela de eventos à parte.
const adicionarNota = transaction(({ protocoloId, texto, foto, user }) => {
  const protocolo = buscarPorId(protocoloId);
  if (!protocolo) throw new Error("Protocolo não encontrado.");
  const textoLimpo = String(texto || "").trim();
  if (!textoLimpo && !foto) throw new Error("Escreva uma observação ou anexe uma foto.");
  if (textoLimpo) {
    historico.registrar({ protocoloId, acao: "nota.adicionar", valorNovo: textoLimpo, user });
  }
  if (foto) {
    anexos.adicionarCore({ protocoloId, etapa: "historico", arquivoBase64: foto, user });
  }
  return buscarDetalhe(protocoloId);
});

module.exports = {
  gerarNumeroProtocolo,
  buscarPorId,
  buscarDetalhe,
  verificarDuplicidade,
  criar,
  criarCore,
  atualizar,
  atualizarCliente,
  adicionarNota,
  listar,
  montarDetalhe,
};
