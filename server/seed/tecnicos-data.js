// Dados reais migrados do "Mini Estoque dos Técnicos" (versão desktop
// anterior), usados apenas na primeira inicialização do banco.

const catalogo = [
  ["Fontes", "Fonte 230W"], ["Fontes", "Fonte 350W"], ["Fontes", "Fonte 500W"],
  ["Fontes", "Fonte 600W"], ["Fontes", "Fonte 750W"],
  ["Placas-mãe", "H55"], ["Placas-mãe", "H61"], ["Placas-mãe", "H81"],
  ["Placas-mãe", "H110"], ["Placas-mãe", "H310"], ["Placas-mãe", "H510"],
  ["Placas-mãe", "H610"], ["Placas-mãe", "A320"], ["Placas-mãe", "A520"],
  ["Coolers", "Cooler padrão"], ["Coolers", "Cooler RGB"],
  ["Outros", "DVD"], ["Outros", "Wi-Fi"], ["Outros", "Gabinete Gamer"],
];

const itens = [
  { id: 1, categoria: "Fontes", nome: "Fonte 230W", quantidade: 490, limiteBaixo: 5 },
  { id: 2, categoria: "Fontes", nome: "Fonte 350W", quantidade: 0, limiteBaixo: 5 },
  { id: 3, categoria: "Fontes", nome: "Fonte 500W", quantidade: 0, limiteBaixo: 5 },
  { id: 4, categoria: "Fontes", nome: "Fonte 600W", quantidade: 0, limiteBaixo: 5 },
  { id: 5, categoria: "Fontes", nome: "Fonte 750W", quantidade: 0, limiteBaixo: 5 },
  { id: 6, categoria: "Placas-mãe", nome: "H55", quantidade: 0, limiteBaixo: 5 },
  { id: 7, categoria: "Placas-mãe", nome: "H61", quantidade: 2, limiteBaixo: 5 },
  { id: 8, categoria: "Placas-mãe", nome: "H81", quantidade: 0, limiteBaixo: 5 },
  { id: 9, categoria: "Placas-mãe", nome: "H110", quantidade: 0, limiteBaixo: 5 },
  { id: 10, categoria: "Placas-mãe", nome: "H310", quantidade: 0, limiteBaixo: 5 },
  { id: 11, categoria: "Placas-mãe", nome: "H510", quantidade: 0, limiteBaixo: 5 },
  { id: 12, categoria: "Placas-mãe", nome: "H610", quantidade: 0, limiteBaixo: 5 },
  { id: 13, categoria: "Placas-mãe", nome: "A320", quantidade: 0, limiteBaixo: 5 },
  { id: 14, categoria: "Placas-mãe", nome: "A520", quantidade: 0, limiteBaixo: 5 },
  { id: 15, categoria: "Coolers", nome: "Cooler padrão", quantidade: 2, limiteBaixo: 5 },
  { id: 16, categoria: "Coolers", nome: "Cooler RGB", quantidade: 60, limiteBaixo: 5 },
  { id: 17, categoria: "Outros", nome: "DVD", quantidade: 18, limiteBaixo: 5 },
  { id: 18, categoria: "Outros", nome: "Wi-Fi", quantidade: 2, limiteBaixo: 5 },
  { id: 19, categoria: "Outros", nome: "Gabinete Gamer", quantidade: 0, limiteBaixo: 5 },
];

const configuracoes = [
  { id: 1, nome: "i5 2th/8/480", processador: "i5 2th", ram: "8 gb", ssd: "480", observacao: "" },
];

const configItens = [
  { configuracaoId: 1, itemId: 15, quantidade: 1 },
  { configuracaoId: 1, itemId: 1, quantidade: 1 },
  { configuracaoId: 1, itemId: 18, quantidade: 1 },
  { configuracaoId: 1, itemId: 7, quantidade: 1 },
];

const maquinas = [{ configuracaoId: 1, quantidade: 9 }];

const movimentos = [
  { dataHora: "2026-09-02 09:32:59", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "Fonte 230W", quantidade: 490, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:33:16", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "Cooler RGB", quantidade: 60, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:33:26", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "DVD", quantidade: 19, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:33:34", responsavel: "Gustavo", tipo: "SAIDA", alvo: "DVD", quantidade: 1, motivo: "ml", detalhe: "" },
  { dataHora: "2026-09-02 09:35:05", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "Cooler padrão", quantidade: 22, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:35:21", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "Fonte 230W", quantidade: 20, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:35:39", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "Wi-Fi", quantidade: 22, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:35:50", responsavel: "Gustavo", tipo: "ENTRADA", alvo: "H61", quantidade: 22, motivo: "inventario", detalhe: "" },
  { dataHora: "2026-09-02 09:35:58", responsavel: "Gustavo", tipo: "MONTAGEM", alvo: "i5 2th/8/480", quantidade: 20, motivo: "estoque", detalhe: "20x Fonte 230W; 20x H61; 20x Cooler padrão; 20x Wi-Fi" },
  { dataHora: "2026-09-02 09:36:10", responsavel: "Gustavo", tipo: "SAIDA MAQUINA", alvo: "i5 2th/8/480", quantidade: 11, motivo: "vendas", detalhe: "" },
];

module.exports = { catalogo, itens, configuracoes, configItens, maquinas, movimentos };
