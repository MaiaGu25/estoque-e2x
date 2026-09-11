import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp } from "lucide-react";
import { api, ApiError } from "../../api";
import type { LogConferenciaItem, LogMapa, LogSerial } from "../../types";
import { Field, fmt } from "../ui";
import { PosicaoSeletor } from "../PosicaoSeletor";

type LookupState = { carregando: boolean; encontrado: LogSerial | null; consultado: boolean };

export default function ConferenciaItemLinha({
  item,
  conferenciaId,
  mapa,
  isAdmin,
  bloqueado,
  onConfirmado,
}: {
  item: LogConferenciaItem;
  conferenciaId: number;
  mapa: LogMapa;
  isAdmin: boolean;
  bloqueado: boolean;
  onConfirmado: () => void;
}) {
  const pendente = item.quantidade_esperada - item.quantidade_conferida;
  const completo = pendente <= 0;
  const [aberto, setAberto] = useState(false);
  const [quantidade, setQuantidade] = useState(String(Math.max(pendente, 1)));
  const [seriais, setSeriais] = useState<string[]>([""]);
  const [lookups, setLookups] = useState<Record<number, LookupState>>({});
  const [ignorarConflito, setIgnorarConflito] = useState<Record<number, boolean>>({});
  const [positionId, setPositionId] = useState<number | null>(null);
  const [usarPosicaoManual, setUsarPosicaoManual] = useState(false);
  const [permitirExcedente, setPermitirExcedente] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const qtdNumero = Number(quantidade) || 0;

  const ajustarSeriaisParaQuantidade = (n: number) => {
    setSeriais((prev) => {
      const proximo = prev.slice(0, n);
      while (proximo.length < n) proximo.push("");
      return proximo;
    });
  };

  const consultarSerial = async (idx: number, valor: string) => {
    if (!valor.trim()) {
      setLookups((prev) => ({ ...prev, [idx]: { carregando: false, encontrado: null, consultado: false } }));
      return;
    }
    setLookups((prev) => ({ ...prev, [idx]: { carregando: true, encontrado: null, consultado: false } }));
    try {
      const r = await api.get<{ encontrado: LogSerial | null }>(`/api/logistica/serial/${encodeURIComponent(valor.trim())}`);
      setLookups((prev) => ({ ...prev, [idx]: { carregando: false, encontrado: r.encontrado, consultado: true } }));
    } catch {
      setLookups((prev) => ({ ...prev, [idx]: { carregando: false, encontrado: null, consultado: true } }));
    }
  };

  const algumConflitoNaoTratado = item.exige_serial
    ? seriais.slice(0, qtdNumero).some((_, idx) => {
        const l = lookups[idx];
        if (!l?.encontrado) return false;
        const mesmoProduto = l.encontrado.product_id === item.product_id;
        if (!mesmoProduto && !isAdmin) return true;
        return !ignorarConflito[idx];
      })
    : false;

  const confirmar = async () => {
    setErro("");
    if (qtdNumero <= 0) return setErro("Informe uma quantidade válida.");
    if (item.exige_serial && seriais.slice(0, qtdNumero).some((s) => !s.trim())) {
      return setErro("Informe todos os números de série.");
    }
    if (algumConflitoNaoTratado) return setErro("Resolva os conflitos de serial antes de confirmar.");

    setSalvando(true);
    try {
      const body: any = {
        quantidade: qtdNumero,
        permitirExcedente,
        positionId: usarPosicaoManual ? positionId : undefined,
      };
      if (item.exige_serial) {
        body.seriais = seriais.slice(0, qtdNumero).map((valor, idx) => ({ valor, ignorarConflito: !!ignorarConflito[idx] }));
      }
      await api.post(`/api/logistica/conferencia/${conferenciaId}/itens/${item.id}/conferir`, body);
      setAberto(false);
      setSeriais([""]);
      setLookups({});
      setIgnorarConflito({});
      onConfirmado();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível confirmar o item.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="cart" style={{ marginBottom: 10 }}>
      <button
        className="cart-row"
        style={{ width: "100%", textAlign: "left", gridTemplateColumns: "1fr auto auto" }}
        onClick={() => !bloqueado && setAberto((v) => !v)}
      >
        <span>
          <b>{item.product_code}</b>
          <small>
            {item.product_name}
            {item.exige_serial ? " · exige serial" : ""}
          </small>
        </span>
        <span>
          {fmt(item.quantidade_conferida)} / {fmt(item.quantidade_esperada)} {item.product_unit}
        </span>
        {completo ? <Check size={16} color="#1f8a52" /> : aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberto && !bloqueado && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid #e6ece8" }}>
          <div className="form-grid">
            <Field label={`Quantidade a confirmar (pendente: ${fmt(pendente)})`}>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => {
                  setQuantidade(e.target.value);
                  if (item.exige_serial) ajustarSeriaisParaQuantidade(Number(e.target.value) || 0);
                }}
              />
            </Field>
            <Field label="">
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 20 }}>
                <input type="checkbox" checked={permitirExcedente} onChange={(e) => setPermitirExcedente(e.target.checked)} />
                Permitir excedente (mais que o esperado)
              </label>
            </Field>
          </div>

          {item.exige_serial && (
            <div style={{ marginTop: 8 }}>
              {seriais.slice(0, qtdNumero).map((valor, idx) => {
                const lookup = lookups[idx];
                const mesmoProduto = lookup?.encontrado && lookup.encontrado.product_id === item.product_id;
                return (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <input
                      placeholder={`Serial ${idx + 1}`}
                      value={valor}
                      onChange={(e) => setSeriais((prev) => prev.map((s, i) => (i === idx ? e.target.value : s)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          consultarSerial(idx, valor);
                        }
                      }}
                      onBlur={() => consultarSerial(idx, valor)}
                    />
                    {lookup?.carregando && <small className="cart-empty">Consultando…</small>}
                    {lookup?.consultado && !lookup.encontrado && (
                      <small style={{ color: "#1f8a52" }}>Serial não localizado. Poderá ser recebido no estoque não organizado.</small>
                    )}
                    {lookup?.encontrado && mesmoProduto && (
                      <div className="error" style={{ background: "#fff8e6", color: "#8a6300", borderColor: "#ffe8a3" }}>
                        <AlertTriangle size={14} /> Serial já cadastrado no sistema (status: {lookup.encontrado.status}, posição:{" "}
                        {lookup.encontrado.position_code || "-"}).
                        <label style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={!!ignorarConflito[idx]}
                            onChange={(e) => setIgnorarConflito((prev) => ({ ...prev, [idx]: e.target.checked }))}
                          />
                          Confirmar mesmo assim (registra divergência de serial duplicado)
                        </label>
                      </div>
                    )}
                    {lookup?.encontrado && !mesmoProduto && (
                      <div className="error">
                        <AlertTriangle size={14} /> Este serial já pertence a outro produto ({lookup.encontrado.product_code}). Requer revisão de um
                        administrador.
                        {isAdmin && (
                          <label style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={!!ignorarConflito[idx]}
                              onChange={(e) => setIgnorarConflito((prev) => ({ ...prev, [idx]: e.target.checked }))}
                            />
                            Confirmar mesmo assim (registra divergência crítica)
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, margin: "8px 0" }}>
            <input type="checkbox" checked={usarPosicaoManual} onChange={(e) => setUsarPosicaoManual(e.target.checked)} />
            Escolher posição de destino (padrão: Estoque não organizado)
          </label>
          {usarPosicaoManual && <PosicaoSeletor mapa={mapa} value={positionId} onChange={setPositionId} />}

          {erro && <div className="error">{erro}</div>}
          <div className="modal-actions">
            <button className="primary" onClick={confirmar} disabled={salvando}>
              {salvando ? "Confirmando…" : "Confirmar item conferido"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
