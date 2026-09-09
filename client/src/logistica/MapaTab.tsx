import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogPosicao } from "../types";
import { dt, Empty, Field, fmt, Modal } from "./ui";

type BuscaResultado = {
  porProduto: { position_id: number; quantity: number; position_code: string; product_id: number; product_code: string; product_name: string }[];
  posicoes: { id: number; code: string; name: string }[];
};

type PosicaoDetalhe = {
  posicao: LogPosicao & { rack_code: string; rack_name: string; aisle_code: string; aisle_name: string; row_code: string; row_name: string };
  produtos: { quantity: number; id: number; code: string; name: string; unit: string }[];
  movimentacoes: any[];
};

function levelClass(p: LogPosicao, selected: boolean) {
  if (selected) return "rack-level selected";
  if (!p.active || p.blocked) return "rack-level blocked";
  if (p.total_quantity > 0) return "rack-level occupied";
  return "rack-level empty";
}

function levelStatusText(p: LogPosicao) {
  if (p.blocked) return "Bloqueada";
  if (!p.active) return "Inativa";
  if (p.total_quantity > 0) return `${p.product_count} produto(s) · ${fmt(p.total_quantity)} un.`;
  return "Vazia";
}

export default function MapaTab({ mapa, isAdmin, onAtualizado }: { mapa: LogMapa; isAdmin: boolean; onAtualizado: () => void }) {
  const [rowId, setRowId] = useState<number | null>(null);
  const [aisleId, setAisleId] = useState<number | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<PosicaoDetalhe | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");
  const [busca, setBusca] = useState<BuscaResultado | null>(null);

  const [modalFileira, setModalFileira] = useState<null | "novo" | "editar">(null);
  const [modalCorredor, setModalCorredor] = useState<null | "novo" | "editar">(null);
  const [modalMontante, setModalMontante] = useState<null | "novo" | "editar">(null);
  const [rackEditando, setRackEditando] = useState<any>(null);

  const row = mapa.rows.find((r) => r.id === rowId) || null;
  const aisle = row?.aisles.find((a) => a.id === aisleId) || null;

  useEffect(() => {
    if (!mapa.rows.length) return;
    if (!rowId || !mapa.rows.some((r) => r.id === rowId)) {
      setRowId(mapa.rows.find((r) => r.active)?.id ?? mapa.rows[0].id);
    }
  }, [mapa, rowId]);

  useEffect(() => {
    if (!row) {
      setAisleId(null);
      return;
    }
    if (!aisleId || !row.aisles.some((a) => a.id === aisleId)) {
      setAisleId(row.aisles.find((a) => a.active)?.id ?? row.aisles[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const posicaoIndex = useMemo(() => {
    const idx: Record<number, { rowId: number; aisleId: number }> = {};
    for (const r of mapa.rows) {
      for (const a of r.aisles) {
        for (const rack of a.racks) {
          for (const pos of rack.positions) idx[pos.id] = { rowId: r.id, aisleId: a.id };
        }
      }
    }
    return idx;
  }, [mapa]);

  useEffect(() => {
    if (!selectedPositionId) {
      setDetalhe(null);
      return;
    }
    api.get<PosicaoDetalhe>(`/api/logistica/mapa/posicoes/${selectedPositionId}`).then(setDetalhe);
  }, [selectedPositionId, mapa]);

  const buscar = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setBusca(null);
      return;
    }
    const r = await api.get<BuscaResultado>(`/api/logistica/mapa/buscar?q=${encodeURIComponent(q)}`);
    setBusca(r);
  };

  const matchIds = useMemo(() => {
    if (!busca) return null;
    const s = new Set<number>();
    busca.porProduto.forEach((p) => s.add(p.position_id));
    busca.posicoes.forEach((p) => s.add(p.id));
    return s;
  }, [busca]);

  const centralizar = (posId: number) => {
    const loc = posicaoIndex[posId];
    if (loc) {
      setRowId(loc.rowId);
      setAisleId(loc.aisleId);
    }
    setSelectedPositionId(posId);
  };

  const patchPosicao = async (id: number, patch: Record<string, unknown>) => {
    await api.patch(`/api/logistica/mapa/posicoes/${id}`, patch);
    onAtualizado();
  };

  if (!mapa.rows.length) {
    return (
      <section>
        <Empty text="O mapa do galpão ainda não tem nenhuma fileira cadastrada." />
        {isAdmin && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="primary" onClick={() => setModalFileira("novo")}>
              <Plus size={16} /> Criar primeira fileira
            </button>
          </div>
        )}
        {modalFileira === "novo" && (
          <FileiraModal
            onClose={() => setModalFileira(null)}
            onSaved={() => {
              setModalFileira(null);
              onAtualizado();
            }}
          />
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="edit-toolbar">
        <div className="part-search" style={{ minWidth: 280 }}>
          <Search />
          <input value={query} onChange={(e) => buscar(e.target.value)} placeholder="Buscar produto ou posição (ex.: F01-C02-M05-N03)" />
        </div>
        {isAdmin && (
          <div className="segmented grow" style={{ maxWidth: 260, margin: 0 }}>
            <button className={!editMode ? "active in" : ""} onClick={() => setEditMode(false)}>
              Visualizar
            </button>
            <button className={editMode ? "active in" : ""} onClick={() => setEditMode(true)}>
              Editar
            </button>
          </div>
        )}
      </div>

      <div className="log-nav">
        <select
          value={rowId ?? ""}
          onChange={(e) => {
            setRowId(Number(e.target.value) || null);
            setSelectedPositionId(null);
          }}
        >
          {mapa.rows
            .filter((r) => r.active || isAdmin)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.active ? "" : "(inativa) "}
                {r.name} ({r.code})
              </option>
            ))}
        </select>
        <select
          value={aisleId ?? ""}
          onChange={(e) => {
            setAisleId(Number(e.target.value) || null);
            setSelectedPositionId(null);
          }}
          disabled={!row}
        >
          {(row?.aisles || [])
            .filter((a) => a.active || isAdmin)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.active ? "" : "(inativo) "}
                {a.name} ({a.code})
              </option>
            ))}
        </select>

        {editMode && isAdmin && (
          <>
            <button className="secondary" onClick={() => setModalFileira("novo")}>
              <Plus size={15} /> Fileira
            </button>
            {row && (
              <button className="icon-btn" title="Editar fileira" onClick={() => setModalFileira("editar")}>
                <Pencil size={16} />
              </button>
            )}
            <button className="secondary" disabled={!row} onClick={() => setModalCorredor("novo")}>
              <Plus size={15} /> Corredor
            </button>
            {aisle && (
              <button className="icon-btn" title="Editar corredor" onClick={() => setModalCorredor("editar")}>
                <Pencil size={16} />
              </button>
            )}
            <button className="secondary" disabled={!aisle} onClick={() => setModalMontante("novo")}>
              <Plus size={15} /> Montante
            </button>
          </>
        )}
      </div>

      <div className="log-map-layout">
        <div className="rack-grid">
          {(aisle?.racks || []).filter((r) => r.active || isAdmin).map((rack) => (
            <div key={rack.id} className={rack.active ? "rack" : "rack inactive"} style={rack.color ? { borderLeft: `4px solid ${rack.color}` } : undefined}>
              <div className="rack-head">
                <span>
                  {rack.name} ({rack.code})
                </span>
                {editMode && isAdmin && (
                  <button
                    className="icon-btn"
                    title="Editar montante"
                    onClick={() => {
                      setRackEditando(rack);
                      setModalMontante("editar");
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <div className="rack-levels">
                {rack.positions.map((p) => (
                  <button
                    key={p.id}
                    className={`${levelClass(p, p.id === selectedPositionId)} ${
                      matchIds ? (matchIds.has(p.id) ? "map-search-hit" : "map-search-dim") : ""
                    }`}
                    onClick={() => centralizar(p.id)}
                  >
                    <b>{p.code}</b>
                    <small>{levelStatusText(p)}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!(aisle?.racks || []).length && <Empty text="Esse corredor ainda não tem nenhum montante." />}
        </div>

        <div className="panel position-panel" style={{ padding: 16, minHeight: 260 }}>
          {busca ? (
            <BuscaPainel busca={busca} onSelecionar={centralizar} />
          ) : detalhe ? (
            <PosicaoDetalhePainel detalhe={detalhe} isAdmin={isAdmin} editMode={editMode} onPatch={(patch) => patchPosicao(detalhe.posicao.id, patch)} />
          ) : (
            <Empty text="Clique em uma posição do mapa para ver os detalhes." />
          )}
        </div>
      </div>

      {modalFileira === "novo" && (
        <FileiraModal
          onClose={() => setModalFileira(null)}
          onSaved={() => {
            setModalFileira(null);
            onAtualizado();
          }}
        />
      )}
      {modalFileira === "editar" && row && (
        <FileiraModal
          fileira={row}
          onClose={() => setModalFileira(null)}
          onSaved={() => {
            setModalFileira(null);
            onAtualizado();
          }}
        />
      )}
      {modalCorredor === "novo" && row && (
        <CorredorModal
          rowId={row.id}
          onClose={() => setModalCorredor(null)}
          onSaved={() => {
            setModalCorredor(null);
            onAtualizado();
          }}
        />
      )}
      {modalCorredor === "editar" && aisle && (
        <CorredorModal
          rowId={row!.id}
          corredor={aisle}
          onClose={() => setModalCorredor(null)}
          onSaved={() => {
            setModalCorredor(null);
            onAtualizado();
          }}
        />
      )}
      {modalMontante === "novo" && aisle && (
        <MontanteModal
          aisleId={aisle.id}
          onClose={() => setModalMontante(null)}
          onSaved={() => {
            setModalMontante(null);
            onAtualizado();
          }}
        />
      )}
      {modalMontante === "editar" && rackEditando && (
        <MontanteModal
          aisleId={aisle!.id}
          montante={rackEditando}
          onClose={() => {
            setModalMontante(null);
            setRackEditando(null);
          }}
          onSaved={() => {
            setModalMontante(null);
            setRackEditando(null);
            onAtualizado();
          }}
        />
      )}
    </section>
  );
}

function BuscaPainel({ busca, onSelecionar }: { busca: BuscaResultado; onSelecionar: (id: number) => void }) {
  return (
    <div>
      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 10px" }}>
        Resultados da busca
      </p>
      {!busca.porProduto.length && !busca.posicoes.length && <Empty text="Nada encontrado para esse termo." />}
      {busca.porProduto.map((r) => (
        <button
          key={`p${r.position_id}-${r.product_id}`}
          className="rack-level occupied"
          style={{ width: "100%", marginBottom: 8, cursor: "pointer" }}
          onClick={() => onSelecionar(r.position_id)}
        >
          <b>{r.position_code}</b>
          <small>
            {r.product_code} · {r.product_name} · {fmt(r.quantity)} un.
          </small>
        </button>
      ))}
      {busca.posicoes.map((p) => (
        <button key={`pos${p.id}`} className="rack-level empty" style={{ width: "100%", marginBottom: 8, cursor: "pointer" }} onClick={() => onSelecionar(p.id)}>
          <b>{p.code}</b>
          <small>{p.name || "Posição"}</small>
        </button>
      ))}
    </div>
  );
}

function PosicaoDetalhePainel({
  detalhe,
  isAdmin,
  editMode,
  onPatch,
}: {
  detalhe: PosicaoDetalhe;
  isAdmin: boolean;
  editMode: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const { posicao, produtos, movimentacoes } = detalhe;
  const [nome, setNome] = useState(posicao.name);

  useEffect(() => setNome(posicao.name), [posicao.id, posicao.name]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <b className="code" style={{ fontSize: 15 }}>
            {posicao.code}
          </b>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#7b8e85" }}>
            {posicao.row_name} · {posicao.aisle_name} · {posicao.rack_name} · Nível {posicao.level_number}
          </p>
        </div>
      </div>

      <div className="detail-meta">
        <div>
          <span>Situação</span>
          <b>{posicao.blocked ? "Bloqueada" : posicao.active ? "Ativa" : "Inativa"}</b>
        </div>
        <div>
          <span>Saldo total</span>
          <b>{fmt(produtos.reduce((s, p) => s + p.quantity, 0))}</b>
        </div>
      </div>

      {isAdmin && editMode && (
        <div style={{ marginBottom: 14 }}>
          <Field label="Nome da posição">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
              <button className="secondary" onClick={() => onPatch({ name: nome })}>
                Salvar
              </button>
            </div>
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={() => onPatch({ active: !posicao.active })}>
              {posicao.active ? "Inativar" : "Ativar"}
            </button>
            <button className="secondary" onClick={() => onPatch({ blocked: !posicao.blocked })}>
              {posicao.blocked ? "Desbloquear" : "Bloquear"}
            </button>
          </div>
        </div>
      )}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "14px 0 8px" }}>
        Produtos armazenados
      </p>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th className="num">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id}>
                <td>
                  <b className="code">{p.code}</b>
                </td>
                <td>{p.name}</td>
                <td className="num">
                  {fmt(p.quantity)} {p.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!produtos.length && <Empty text="Posição vazia." />}
      </div>

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "14px 0 8px" }}>
        Últimas movimentações
      </p>
      <div className="table-wrap" style={{ maxHeight: 220 }}>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th className="num">Qtd.</th>
            </tr>
          </thead>
          <tbody>
            {movimentacoes.map((m: any) => (
              <tr key={m.id}>
                <td>{dt(m.created_at)}</td>
                <td>{m.type}</td>
                <td className="num">{fmt(m.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!movimentacoes.length && <Empty text="Nenhuma movimentação nessa posição ainda." />}
      </div>
    </div>
  );
}

function FileiraModal({ fileira, onClose, onSaved }: { fileira?: any; onClose: () => void; onSaved: () => void }) {
  const editando = !!fileira;
  const [code, setCode] = useState(fileira?.code || "");
  const [name, setName] = useState(fileira?.name || "");
  const [color, setColor] = useState(fileira?.color || "");
  const [active, setActive] = useState(fileira ? !!fileira.active : true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      if (editando) {
        await api.patch(`/api/logistica/mapa/fileiras/${fileira.id}`, { name, color, active });
      } else {
        await api.post("/api/logistica/mapa/fileiras", { code, name, color });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar a fileira.");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir a fileira ${fileira.name}? Só é possível se ela nunca foi usada.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.del(`/api/logistica/mapa/fileiras/${fileira.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir a fileira.");
      setSaving(false);
    }
  };

  return (
    <Modal title={editando ? "Editar fileira" : "Nova fileira"} onClose={onClose}>
      <div className="form-grid">
        {!editando && (
          <Field label="Código *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: F01" />
          </Field>
        )}
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fileira 1" />
        </Field>
        <Field label="Cor (opcional)">
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0caf65" />
        </Field>
      </div>
      {editando && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Fileira ativa
        </label>
      )}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {editando && (
          <button className="secondary" onClick={excluir} disabled={saving} style={{ marginRight: "auto", color: "#b64a3c" }}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !name.trim() || (!editando && !code.trim())} onClick={salvar}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function CorredorModal({
  rowId,
  corredor,
  onClose,
  onSaved,
}: {
  rowId: number;
  corredor?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = !!corredor;
  const [code, setCode] = useState(corredor?.code || "");
  const [name, setName] = useState(corredor?.name || "");
  const [active, setActive] = useState(corredor ? !!corredor.active : true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      if (editando) {
        await api.patch(`/api/logistica/mapa/corredores/${corredor.id}`, { name, active });
      } else {
        await api.post("/api/logistica/mapa/corredores", { rowId, code, name });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o corredor.");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o corredor ${corredor.name}? Só é possível se ele nunca foi usado.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.del(`/api/logistica/mapa/corredores/${corredor.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o corredor.");
      setSaving(false);
    }
  };

  return (
    <Modal title={editando ? "Editar corredor" : "Novo corredor"} onClose={onClose}>
      <div className="form-grid">
        {!editando && (
          <Field label="Código *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: C02" />
          </Field>
        )}
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Corredor 2" />
        </Field>
      </div>
      {editando && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Corredor ativo
        </label>
      )}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {editando && (
          <button className="secondary" onClick={excluir} disabled={saving} style={{ marginRight: "auto", color: "#b64a3c" }}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !name.trim() || (!editando && !code.trim())} onClick={salvar}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function MontanteModal({
  aisleId,
  montante,
  onClose,
  onSaved,
}: {
  aisleId: number;
  montante?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = !!montante;
  const [code, setCode] = useState(montante?.code || "");
  const [name, setName] = useState(montante?.name || "");
  const [levelsCount, setLevelsCount] = useState(montante?.levels_count ?? 4);
  const [color, setColor] = useState(montante?.color || "");
  const [active, setActive] = useState(montante ? !!montante.active : true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      if (editando) {
        await api.patch(`/api/logistica/mapa/montantes/${montante.id}`, { name, color, active, levelsCount: Number(levelsCount) });
      } else {
        await api.post("/api/logistica/mapa/montantes", { aisleId, code, name, levelsCount: Number(levelsCount), color });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o montante.");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o montante ${montante.name}? Só é possível se ele nunca foi usado.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.del(`/api/logistica/mapa/montantes/${montante.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o montante.");
      setSaving(false);
    }
  };

  return (
    <Modal title={editando ? "Editar montante" : "Novo montante"} subtitle="Cada nível do montante vira automaticamente uma posição no galpão." onClose={onClose}>
      <div className="form-grid">
        {!editando && (
          <Field label="Código *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: M05" />
          </Field>
        )}
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Montante 5" />
        </Field>
        <Field label="Quantidade de níveis *">
          <input type="number" min={1} max={20} value={levelsCount} onChange={(e) => setLevelsCount(e.target.value)} />
        </Field>
        <Field label="Cor (opcional)">
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0caf65" />
        </Field>
      </div>
      {editando && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Montante ativo
        </label>
      )}
      {editando && Number(levelsCount) < montante.levels_count && (
        <div className="error" style={{ background: "#fff8e6", color: "#8a6300", borderColor: "#ffe8a3" }}>
          Reduzir os níveis só funciona se os níveis removidos estiverem vazios e sem histórico.
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        {editando && (
          <button className="secondary" onClick={excluir} disabled={saving} style={{ marginRight: "auto", color: "#b64a3c" }}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !name.trim() || (!editando && !code.trim())} onClick={salvar}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
