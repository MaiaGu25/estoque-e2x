// Estados internos do pedido, independentes do vocabulário de cada
// plataforma - é o que o resto do sistema (dashboard, fila de pedidos,
// alertas) enxerga. O status bruto recebido do marketplace é sempre
// guardado à parte (`marketplace_orders.status_externo`), nunca
// descartado.
const STATUS_INTERNOS = [
  "novo",
  "aguardando_pagamento",
  "pago",
  "estoque_reservado",
  "aguardando_separacao",
  "em_separacao",
  "separado",
  "aguardando_expedicao",
  "enviado",
  "entregue",
  "cancelado",
  "devolvido",
  "com_divergencia",
  "erro_sincronizacao",
];

// Tabela de rascunho: nomes de status públicos e amplamente conhecidos de
// cada plataforma, usados só como ponto de partida. Antes de ligar a
// importação automática de verdade (Fase 2/3), confirme os nomes exatos
// devolvidos pela API na documentação oficial vigente - esta tabela NÃO
// foi validada contra uma chamada real e não deve ser tratada como
// definitiva.
const MAPA_RASCUNHO = {
  mercado_livre: {
    confirmed: "aguardando_pagamento",
    payment_required: "aguardando_pagamento",
    payment_in_process: "aguardando_pagamento",
    paid: "pago",
    partially_paid: "pago",
    shipped: "enviado",
    delivered: "entregue",
    cancelled: "cancelado",
    invalid: "cancelado",
  },
  shopee: {
    UNPAID: "aguardando_pagamento",
    READY_TO_SHIP: "pago",
    PROCESSED: "pago",
    SHIPPED: "enviado",
    COMPLETED: "entregue",
    CANCELLED: "cancelado",
    IN_CANCEL: "cancelado",
    TO_RETURN: "devolvido",
  },
};

// Converte um status bruto do marketplace no status interno mais
// próximo. Nunca lança erro para um valor desconhecido - devolve 'novo'
// e deixa evidente (via `reconhecido: false`) que aquele valor precisa
// ser mapeado quando a integração real for verificada.
function normalizarStatusExterno(marketplace, statusExternoBruto) {
  const mapa = MAPA_RASCUNHO[marketplace] || {};
  const interno = mapa[statusExternoBruto];
  if (interno) return { statusInterno: interno, reconhecido: true };
  return { statusInterno: "novo", reconhecido: false };
}

module.exports = { STATUS_INTERNOS, normalizarStatusExterno };
