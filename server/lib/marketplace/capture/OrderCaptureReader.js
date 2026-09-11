// Interface que qualquer mecanismo de leitura de captura de tela do
// pedido manual deve implementar. Isolar isso aqui é o que permite
// trocar o motor de OCR no futuro (ex.: por um serviço em nuvem) sem
// mexer em nada que consome o resultado.
//
// Contrato:
//   ler(buffer: Buffer): Promise<{ texto: string, confiancaMedia: number, palavras: PalavraReconhecida[] }>
//
// PalavraReconhecida = { texto: string, confianca: number }
//
// Implementações NUNCA devem criar pedido nem reservar estoque sozinhas -
// o resultado é sempre uma sugestão para o formulário, que o
// administrador confirma ou corrige antes de qualquer gravação de
// verdade (ver server/lib/marketplace/orders.js).
module.exports = {};
