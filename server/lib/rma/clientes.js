const { db, transaction } = require("../../db");
const { nowStamp, normalizarDocumento } = require("../../util");

function buscarPorId(id) {
  return db.prepare("SELECT * FROM rma_clientes WHERE id = ?").get(id);
}

function buscarPorCpfCnpj(cpfCnpj) {
  const normalizado = normalizarDocumento(cpfCnpj);
  if (!normalizado) return null;
  return db.prepare("SELECT * FROM rma_clientes WHERE cpf_cnpj_normalizado = ?").get(normalizado);
}

// Mapa campo do payload (camelCase) -> coluna do banco (snake_case).
const COLUNAS = {
  nome: "nome",
  cpfCnpj: "cpf_cnpj",
  telefone: "telefone",
  email: "email",
  cep: "cep",
  logradouro: "logradouro",
  numeroEndereco: "numero_endereco",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  uf: "uf",
};

// Salva os dados do cliente de um protocolo. Se já existe um cliente com
// o mesmo CPF/CNPJ (de outro protocolo), reaproveita o mesmo registro em
// vez de criar um duplicado - é o que permite localizar todos os
// protocolos de um cliente pelo documento dele.
// Versão "core" (sem BEGIN/COMMIT próprio) para poder ser chamada de
// dentro de outra transaction() (ex.: protocolos.criar) - node:sqlite não
// suporta BEGIN aninhado.
function salvarCore({ id, dados }) {
  const now = nowStamp();
  const cpfCnpjNormalizado = normalizarDocumento(dados.cpfCnpj);

  let clienteExistente = id ? buscarPorId(id) : null;
  if (!clienteExistente && cpfCnpjNormalizado) {
    clienteExistente = buscarPorCpfCnpj(cpfCnpjNormalizado);
  }

  const linha = {};
  for (const [campo, coluna] of Object.entries(COLUNAS)) {
    linha[coluna] = String(dados[campo] ?? clienteExistente?.[coluna] ?? "").trim();
  }
  linha.cpf_cnpj_normalizado = cpfCnpjNormalizado;

  const colunasOrdenadas = Object.keys(linha);
  const valoresOrdenados = colunasOrdenadas.map((c) => linha[c]);

  if (clienteExistente) {
    const setClause = colunasOrdenadas.map((c) => `${c} = ?`).join(", ");
    db.prepare(`UPDATE rma_clientes SET ${setClause}, updated_at = ? WHERE id = ?`).run(
      ...valoresOrdenados,
      now,
      clienteExistente.id
    );
    return buscarPorId(clienteExistente.id);
  }

  const result = db
    .prepare(
      `INSERT INTO rma_clientes (${colunasOrdenadas.join(",")},created_at,updated_at)
       VALUES (${colunasOrdenadas.map(() => "?").join(",")},?,?)`
    )
    .run(...valoresOrdenados, now, now);
  return buscarPorId(result.lastInsertRowid);
}

const salvar = transaction(salvarCore);

module.exports = { buscarPorId, buscarPorCpfCnpj, salvar, salvarCore };
