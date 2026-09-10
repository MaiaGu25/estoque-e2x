import { api } from "../api";
import type { TecInventarioDetalhe, TecInventarioResumoHistorico } from "../types";

const BASE = "/api/tecnicos/inventarios";

// Toda chamada de API do inventário fica isolada aqui, separada dos
// componentes visuais - os componentes só chamam essas funções e recebem
// de volta o TecInventarioDetalhe já pronto (o servidor recalcula tudo:
// saldo atual, diferença e situação nunca são inventados no front).
export const inventarioApi = {
  listarHistorico: () => api.get<{ inventarios: TecInventarioResumoHistorico[] }>(BASE),

  buscarAtivo: () =>
    api.get<TecInventarioDetalhe | { inventario: null; itens: []; resumo: null }>(`${BASE}/ativo`),

  buscar: (id: number) => api.get<TecInventarioDetalhe>(`${BASE}/${id}`),

  iniciar: (payload: { motivo?: string; observacao?: string }) => api.post<TecInventarioDetalhe>(BASE, payload),

  salvarCabecalho: (id: number, payload: { motivo?: string; observacao?: string }) =>
    api.patch<TecInventarioDetalhe>(`${BASE}/${id}`, payload),

  cancelar: (id: number) => api.post<{ ok: boolean }>(`${BASE}/${id}/cancelar`),

  definirContagemFinal: (id: number, itemId: number, quantidadeContada: number | null) =>
    api.patch<TecInventarioDetalhe>(`${BASE}/${id}/itens/${itemId}`, { quantidadeContada }),

  somarContagem: (id: number, itemId: number, valor: number) =>
    api.post<TecInventarioDetalhe>(`${BASE}/${id}/itens/${itemId}/contagens`, { valor }),

  desfazerUltimaContagem: (id: number, itemId: number) =>
    api.del<TecInventarioDetalhe>(`${BASE}/${id}/itens/${itemId}/contagens/ultima`),

  zerarContagem: (id: number, itemId: number) => api.post<TecInventarioDetalhe>(`${BASE}/${id}/itens/${itemId}/zerar`),

  finalizar: (id: number, aceitarSaldoAlterado?: boolean) =>
    api.post<TecInventarioDetalhe>(`${BASE}/${id}/finalizar`, { aceitarSaldoAlterado: !!aceitarSaldoAlterado }),
};
