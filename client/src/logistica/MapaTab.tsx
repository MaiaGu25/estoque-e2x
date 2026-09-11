import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Pencil, Plus, RotateCw, Search, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "../api";
import type { LogMapa, LogMontante, LogPosicao } from "../types";
import { dt, Empty, Field, fmt, Modal } from "./ui";

const GRID = 20;
const MIN_SIZE = 40;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1100;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;

type BuscaResultado = {
  porProduto: { position_id: number; quantity: number; position_code: string; product_id: number; product_code: string; product_name: string }[];
  posicoes: { id: number; code: string; name: string }[];
};

type PosicaoDetalhe = {
  posicao: LogPosicao & { side_code: string; side_name: string; rack_code: string; rack_name: string };
  produtos: { quantity: number; id: number; code: string; name: string; unit: string }[];
  movimentacoes: any[];
};

type Retangulo = { x: number; y: number; width: number; height: number };

type DragInfo = {
  mode: "move" | "resize";
  corner?: "nw" | "ne" | "sw" | "se";
  rackId: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  current: Retangulo;
};

function snap(n: number) {
  return Math.round(n / GRID) * GRID;
}

function levelClass(p: LogPosicao) {
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

function ocupacaoRack(rack: LogMontante) {
  let total = 0;
  for (const side of rack.sides) for (const p of side.positions) total += p.total_quantity;
  return total;
}

export default function MapaTab({ mapa, isAdmin, onAtualizado }: { mapa: LogMapa; isAdmin: boolean; onAtualizado: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<PosicaoDetalhe | null>(null);
  const [query, setQuery] = useState("");
  const [busca, setBusca] = useState<BuscaResultado | null>(null);
  const [override, setOverride] = useState<(Retangulo & { rackId: number }) | null>(null);
  const [modalMontante, setModalMontante] = useState(false);
  const [modalLado, setModalLado] = useState<null | { rackId: number; lado?: any }>(null);
  const [modalAndar, setModalAndar] = useState<null | "novo" | "editar">(null);
  const [panelError, setPanelError] = useState("");

  const dragRef = useRef<DragInfo | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const selectedRack = mapa.racks.find((r) => r.id === selectedRackId) || null;
  const selectedFloor = mapa.floors.find((f) => f.id === selectedFloorId) || null;
  const racksDoAndar = mapa.racks.filter((r) => r.floor_id === selectedFloorId && !r.is_holding_area && !r.is_separation_area);

  useEffect(() => {
    if (!mapa.floors.length) return;
    if (!selectedFloorId || !mapa.floors.some((f) => f.id === selectedFloorId)) {
      setSelectedFloorId(mapa.floors.find((f) => f.active)?.id ?? mapa.floors[0].id);
    }
  }, [mapa.floors, selectedFloorId]);

  useEffect(() => {
    if (!selectedPositionId) {
      setDetalhe(null);
      return;
    }
    api.get<PosicaoDetalhe>(`/api/logistica/mapa/posicoes/${selectedPositionId}`).then(setDetalhe);
  }, [selectedPositionId, mapa]);

  const posicaoParaRack = useMemo(() => {
    const idx: Record<number, number> = {};
    for (const rack of mapa.racks) for (const side of rack.sides) for (const p of side.positions) idx[p.id] = rack.id;
    return idx;
  }, [mapa]);

  const buscar = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setBusca(null);
      return;
    }
    const r = await api.get<BuscaResultado>(`/api/logistica/mapa/buscar?q=${encodeURIComponent(q)}`);
    setBusca(r);
  };

  const matchRackIds = useMemo(() => {
    if (!busca) return null;
    const s = new Set<number>();
    busca.porProduto.forEach((p) => {
      const rackId = posicaoParaRack[p.position_id];
      if (rackId) s.add(rackId);
    });
    busca.posicoes.forEach((p) => {
      const rackId = posicaoParaRack[p.id];
      if (rackId) s.add(rackId);
    });
    return s;
  }, [busca, posicaoParaRack]);

  const selecionarRack = (rackId: number | null) => {
    setSelectedRackId(rackId);
    setSelectedPositionId(null);
    setPanelError("");
  };

  const abrirResultado = (posId: number) => {
    const rackId = posicaoParaRack[posId];
    const rack = mapa.racks.find((r) => r.id === rackId);
    if (rack) setSelectedFloorId(rack.floor_id);
    setSelectedRackId(rackId ?? null);
    setSelectedPositionId(posId);
    setQuery("");
    setBusca(null);
    setTimeout(() => document.getElementById(`rack-${rackId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 50);
  };

  const patchRack = async (id: number, patch: Record<string, unknown>) => {
    try {
      await api.patch(`/api/logistica/mapa/montantes/${id}`, patch);
      setPanelError("");
      onAtualizado();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Não foi possível atualizar o montante.");
    }
  };

  const patchPosicao = async (id: number, patch: Record<string, unknown>) => {
    await api.patch(`/api/logistica/mapa/posicoes/${id}`, patch);
    onAtualizado();
  };

  const excluirRack = async (rack: LogMontante) => {
    if (!confirm(`Excluir o montante ${rack.name}? Só é possível se ele nunca foi usado.`)) return;
    try {
      await api.del(`/api/logistica/mapa/montantes/${rack.id}`);
      setSelectedRackId(null);
      onAtualizado();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "Não foi possível excluir o montante.");
    }
  };

  // ---- Arrastar/redimensionar (mouse e toque, sem biblioteca externa) ----

  const iniciarArraste = (e: React.PointerEvent, rack: LogMontante) => {
    if (!editMode || !isAdmin) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "move",
      rackId: rack.id,
      startX: rack.x,
      startY: rack.y,
      startW: rack.width,
      startH: rack.height,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      current: { x: rack.x, y: rack.y, width: rack.width, height: rack.height },
    };
    selecionarRack(rack.id);
  };

  const iniciarRedimensionar = (e: React.PointerEvent, rack: LogMontante, corner: DragInfo["corner"]) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode: "resize",
      corner,
      rackId: rack.id,
      startX: rack.x,
      startY: rack.y,
      startW: rack.width,
      startH: rack.height,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      current: { x: rack.x, y: rack.y, width: rack.width, height: rack.height },
    };
  };

  const moverPonteiro = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startClientX) / zoom;
    const dy = (e.clientY - d.startClientY) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;

    let x = d.startX;
    let y = d.startY;
    let width = d.startW;
    let height = d.startH;

    if (d.mode === "move") {
      x = d.startX + dx;
      y = d.startY + dy;
    } else if (d.corner) {
      if (d.corner.includes("e")) width = d.startW + dx;
      if (d.corner.includes("w")) {
        width = d.startW - dx;
        x = d.startX + dx;
      }
      if (d.corner.includes("s")) height = d.startH + dy;
      if (d.corner.includes("n")) {
        height = d.startH - dy;
        y = d.startY + dy;
      }
      width = Math.max(MIN_SIZE, width);
      height = Math.max(MIN_SIZE, height);
    }

    const rect = { x: Math.max(0, snap(x)), y: Math.max(0, snap(y)), width: snap(width), height: snap(height) };
    d.current = rect;
    setOverride({ rackId: d.rackId, ...rect });
  };

  const soltarPonteiro = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setOverride(null);
    if (!d.moved) return;
    patchRack(d.rackId, d.current);
  };

  const rotacionar = (rack: LogMontante) => {
    const proximo = ({ 0: 90, 90: 180, 180: 270, 270: 0 } as const)[rack.rotation];
    patchRack(rack.id, { rotation: proximo, width: rack.height, height: rack.width });
  };

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + 0.1) * 10) / 10));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - 0.1) * 10) / 10));
  const centralizar = () => {
    setZoom(1);
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  };

  return (
    <section>
      <div className="edit-toolbar">
        <div className="part-search" style={{ minWidth: 260 }}>
          <Search />
          <input value={query} onChange={(e) => buscar(e.target.value)} placeholder="Buscar produto ou posição (ex.: MA-A-P003)" />
        </div>
        <div className="zoom-controls">
          <button onClick={zoomOut} title="Diminuir zoom">
            <ZoomOut size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} title="Aumentar zoom">
            <ZoomIn size={15} />
          </button>
        </div>
        <button className="secondary" onClick={centralizar}>
          <LocateFixed size={15} /> Centralizar
        </button>
        {mapa.floors.length > 0 && (
          <select
            value={selectedFloorId ?? ""}
            onChange={(e) => {
              setSelectedFloorId(Number(e.target.value) || null);
              selecionarRack(null);
            }}
            style={{ height: 38 }}
          >
            {mapa.floors
              .filter((f) => f.active || isAdmin)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.active ? "" : "(inativo) "}
                  {f.name} ({f.code})
                </option>
              ))}
          </select>
        )}
        {editMode && isAdmin && (
          <>
            <button className="secondary" onClick={() => setModalAndar("novo")}>
              <Plus size={15} /> Andar
            </button>
            {selectedFloor && (
              <button className="icon-btn" title="Editar andar" onClick={() => setModalAndar("editar")}>
                <Pencil size={16} />
              </button>
            )}
          </>
        )}
        {isAdmin && (
          <div className="segmented" style={{ maxWidth: 260, margin: 0 }}>
            <button className={!editMode ? "active in" : ""} onClick={() => setEditMode(false)}>
              Visualizar
            </button>
            <button className={editMode ? "active in" : ""} onClick={() => setEditMode(true)}>
              Editar
            </button>
          </div>
        )}
        {editMode && isAdmin && (
          <button className="primary" onClick={() => setModalMontante(true)}>
            <Plus size={15} /> Montante
          </button>
        )}
      </div>

      <div className="log-map-layout">
        <div className="warehouse-viewport" ref={viewportRef}>
          <div style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
            <div
              className="warehouse-canvas"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})` }}
              onClick={() => selecionarRack(null)}
            >
              {!racksDoAndar.length && (
                <div className="warehouse-empty-hint">Esse andar ainda não tem nenhum montante. Crie um para começar a desenhar o galpão.</div>
              )}
              {racksDoAndar.map((rack) => {
                const rect = override?.rackId === rack.id ? override : rack;
                const ocupado = ocupacaoRack(rack) > 0;
                const selecionado = rack.id === selectedRackId;
                const dim = matchRackIds ? !matchRackIds.has(rack.id) : false;
                const classes = ["warehouse-rack"];
                if (selecionado) classes.push("selected");
                if (!rack.active) classes.push("inactive");
                else if (ocupado) classes.push("occupied");
                if (dim) classes.push("dim");
                return (
                  <div
                    key={rack.id}
                    id={`rack-${rack.id}`}
                    className={classes.join(" ")}
                    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selecionarRack(rack.id);
                    }}
                    onPointerDown={(e) => iniciarArraste(e, rack)}
                    onPointerMove={moverPonteiro}
                    onPointerUp={soltarPonteiro}
                  >
                    <b>{rack.code}</b>
                    <small>{rack.name}</small>
                    {selecionado && editMode && isAdmin && (
                      <>
                        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                          <div
                            key={corner}
                            className={`resize-handle ${corner}`}
                            onPointerDown={(e) => iniciarRedimensionar(e, rack, corner)}
                            onPointerMove={moverPonteiro}
                            onPointerUp={soltarPonteiro}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel position-panel" style={{ padding: 16, minHeight: 260 }}>
          {panelError && <div className="error">{panelError}</div>}
          {busca ? (
            <BuscaPainel busca={busca} onSelecionar={abrirResultado} />
          ) : selectedPositionId && detalhe ? (
            <PosicaoDetalhePainel
              detalhe={detalhe}
              isAdmin={isAdmin}
              editMode={editMode}
              onVoltar={() => setSelectedPositionId(null)}
              onPatch={(patch) => patchPosicao(detalhe.posicao.id, patch)}
            />
          ) : selectedRack ? (
            <MontanteDetalhePainel
              rack={selectedRack}
              floors={mapa.floors}
              isAdmin={isAdmin}
              editMode={editMode}
              onPatchRack={(patch) => patchRack(selectedRack.id, patch)}
              onRotate={() => rotacionar(selectedRack)}
              onDelete={() => excluirRack(selectedRack)}
              onOpenLado={(rackId, lado) => setModalLado({ rackId, lado })}
              onSelectPosition={setSelectedPositionId}
            />
          ) : (
            <Empty text="Clique em um montante no mapa para ver os detalhes." />
          )}
        </div>
      </div>

      {modalMontante && selectedFloorId && (
        <MontanteModal
          floorId={selectedFloorId}
          onClose={() => setModalMontante(false)}
          onCreated={(id) => {
            setModalMontante(false);
            selecionarRack(id);
            onAtualizado();
          }}
        />
      )}
      {modalLado && (
        <LadoModal
          rackId={modalLado.rackId}
          lado={modalLado.lado}
          onClose={() => setModalLado(null)}
          onSaved={() => {
            setModalLado(null);
            onAtualizado();
          }}
        />
      )}
      {modalAndar === "novo" && (
        <AndarModal
          onClose={() => setModalAndar(null)}
          onSaved={() => {
            setModalAndar(null);
            onAtualizado();
          }}
        />
      )}
      {modalAndar === "editar" && selectedFloor && (
        <AndarModal
          andar={selectedFloor}
          onClose={() => setModalAndar(null)}
          onSaved={() => {
            setModalAndar(null);
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

function MontanteDetalhePainel({
  rack,
  floors,
  isAdmin,
  editMode,
  onPatchRack,
  onRotate,
  onDelete,
  onOpenLado,
  onSelectPosition,
}: {
  rack: LogMontante;
  floors: { id: number; code: string; name: string; active: number }[];
  isAdmin: boolean;
  editMode: boolean;
  onPatchRack: (patch: Record<string, unknown>) => void;
  onRotate: () => void;
  onDelete: () => void;
  onOpenLado: (rackId: number, lado?: any) => void;
  onSelectPosition: (id: number) => void;
}) {
  const [nome, setNome] = useState(rack.name);
  const [cor, setCor] = useState(rack.color);
  const [geo, setGeo] = useState({ x: rack.x, y: rack.y, width: rack.width, height: rack.height });

  useEffect(() => {
    setNome(rack.name);
    setCor(rack.color);
    setGeo({ x: rack.x, y: rack.y, width: rack.width, height: rack.height });
  }, [rack.id, rack.name, rack.color, rack.x, rack.y, rack.width, rack.height]);

  const podeEditar = isAdmin && editMode && !rack.is_holding_area && !rack.is_separation_area;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <b className="code" style={{ fontSize: 15 }}>
            {rack.code}
          </b>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#7b8e85" }}>{rack.name}</p>
        </div>
      </div>

      {rack.is_holding_area && (
        <div className="error" style={{ background: "#fff8e6", color: "#8a6300", borderColor: "#ffe8a3" }}>
          Esse é o estoque de recebimento usado pelo cadastro de produtos com quantidade inicial - não aparece desenhado no mapa e não pode ser editado ou excluído.
        </div>
      )}
      {rack.is_separation_area && (
        <div className="error" style={{ background: "#fff8e6", color: "#8a6300", borderColor: "#ffe8a3" }}>
          Essa é a área de separação usada pela Separação de pedidos para reservar itens até a expedição - não aparece desenhada no mapa e não pode ser editada ou excluída.
        </div>
      )}

      <div className="detail-meta">
        <div>
          <span>Situação</span>
          <b>{rack.active ? "Ativo" : "Inativo"}</b>
        </div>
        <div>
          <span>Orientação</span>
          <b>{rack.rotation % 180 === 0 ? "Horizontal" : "Vertical"}</b>
        </div>
      </div>

      {podeEditar && (
        <div style={{ marginBottom: 14 }}>
          <Field label="Andar">
            <select value={rack.floor_id} onChange={(e) => onPatchRack({ floorId: Number(e.target.value) })}>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
              <button className="secondary" onClick={() => onPatchRack({ name: nome })}>
                Salvar
              </button>
            </div>
          </Field>
          <Field label="Cor (opcional)">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="#0caf65" />
              <button className="secondary" onClick={() => onPatchRack({ color: cor })}>
                Salvar
              </button>
            </div>
          </Field>
          <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "0 0 6px", fontSize: 11 }}>
            Posição e tamanho no mapa (também dá pra arrastar direto no desenho)
          </p>
          <div className="form-grid">
            <Field label="X">
              <input type="number" value={geo.x} onChange={(e) => setGeo({ ...geo, x: Number(e.target.value) })} onBlur={() => onPatchRack({ x: geo.x })} />
            </Field>
            <Field label="Y">
              <input type="number" value={geo.y} onChange={(e) => setGeo({ ...geo, y: Number(e.target.value) })} onBlur={() => onPatchRack({ y: geo.y })} />
            </Field>
            <Field label="Largura">
              <input
                type="number"
                value={geo.width}
                onChange={(e) => setGeo({ ...geo, width: Number(e.target.value) })}
                onBlur={() => onPatchRack({ width: geo.width })}
              />
            </Field>
            <Field label="Altura">
              <input
                type="number"
                value={geo.height}
                onChange={(e) => setGeo({ ...geo, height: Number(e.target.value) })}
                onBlur={() => onPatchRack({ height: geo.height })}
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary" onClick={onRotate}>
              <RotateCw size={14} /> Girar 90°
            </button>
            <button className="secondary" onClick={() => onPatchRack({ active: !rack.active })}>
              {rack.active ? "Inativar" : "Ativar"}
            </button>
            <button className="secondary" onClick={onDelete} style={{ color: "#b64a3c" }}>
              <Trash2 size={14} /> Excluir
            </button>
          </div>
        </div>
      )}

      <p className="cart-empty" style={{ textAlign: "left", padding: 0, margin: "14px 0 8px" }}>
        Lados e prateleiras
      </p>
      <div className="rack-sides">
        {rack.sides.map((side) => (
          <div className="side-column" key={side.id}>
            <div className="side-head">
              <span>
                Lado {side.code}
                {side.name && side.name !== `Lado ${side.code}` ? ` · ${side.name}` : ""}
              </span>
              {podeEditar && (
                <button className="icon-btn" title="Editar lado" onClick={() => onOpenLado(rack.id, side)}>
                  <Pencil size={12} />
                </button>
              )}
            </div>
            <div className="rack-levels">
              {side.positions.map((p) => (
                <button key={p.id} className={levelClass(p)} onClick={() => onSelectPosition(p.id)}>
                  <b>{p.code}</b>
                  <small>{levelStatusText(p)}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        {podeEditar && (
          <button className="add-side-btn" onClick={() => onOpenLado(rack.id)}>
            <Plus size={14} /> Lado
          </button>
        )}
        {!rack.sides.length && !podeEditar && <Empty text="Esse montante ainda não tem lados cadastrados." />}
      </div>
    </div>
  );
}

function PosicaoDetalhePainel({
  detalhe,
  isAdmin,
  editMode,
  onVoltar,
  onPatch,
}: {
  detalhe: PosicaoDetalhe;
  isAdmin: boolean;
  editMode: boolean;
  onVoltar: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const { posicao, produtos, movimentacoes } = detalhe;
  const [nome, setNome] = useState(posicao.name);

  useEffect(() => setNome(posicao.name), [posicao.id, posicao.name]);

  return (
    <div>
      <button className="icon-btn" onClick={onVoltar} style={{ marginBottom: 8, color: "#0a9d5b", fontSize: 12, fontWeight: 700 }}>
        ← Voltar ao montante {posicao.rack_code}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <b className="code" style={{ fontSize: 15 }}>
            {posicao.code}
          </b>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#7b8e85" }}>
            {posicao.rack_name} · Lado {posicao.side_code} · Prateleira {posicao.shelf_number}
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

function MontanteModal({ floorId, onClose, onCreated }: { floorId: number; onClose: () => void; onCreated: (id: number) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      const r = await api.post<{ ok: true; id: number }>("/api/logistica/mapa/montantes", {
        floorId,
        code,
        name,
        color,
        x: 20,
        y: 20,
        width: 140,
        height: 90,
      });
      onCreated(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o montante.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Novo montante" subtitle="Ele aparece no canto do mapa - depois é só arrastar até o lugar certo e adicionar os lados." onClose={onClose}>
      <div className="form-grid">
        <Field label="Código *">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: MA" />
        </Field>
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Montante A" />
        </Field>
        <Field label="Cor (opcional)">
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0caf65" />
        </Field>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || !name.trim() || !code.trim()} onClick={salvar}>
          {saving ? "Criando…" : "Criar montante"}
        </button>
      </div>
    </Modal>
  );
}

function LadoModal({
  rackId,
  lado,
  onClose,
  onSaved,
}: {
  rackId: number;
  lado?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = !!lado;
  const [code, setCode] = useState(lado?.code || "");
  const [name, setName] = useState(lado?.name || "");
  const [shelvesCount, setShelvesCount] = useState(lado?.shelves_count ?? 8);
  const [active, setActive] = useState(lado ? !!lado.active : true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      if (editando) {
        await api.patch(`/api/logistica/mapa/lados/${lado.id}`, { name, active, shelvesCount: Number(shelvesCount) });
      } else {
        await api.post("/api/logistica/mapa/lados", { rackId, code, name, shelvesCount: Number(shelvesCount) });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o lado.");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o lado ${lado.code}? Só é possível se ele nunca foi usado.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.del(`/api/logistica/mapa/lados/${lado.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o lado.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editando ? "Editar lado" : "Novo lado do montante"}
      subtitle="Cada prateleira do lado vira automaticamente uma posição no galpão."
      onClose={onClose}
    >
      <div className="form-grid">
        {!editando && (
          <Field label="Código *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: A" />
          </Field>
        )}
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lado A (frente)" />
        </Field>
        <Field label="Quantidade de prateleiras *">
          <input type="number" min={1} max={300} value={shelvesCount} onChange={(e) => setShelvesCount(e.target.value)} />
        </Field>
      </div>
      {editando && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Lado ativo
        </label>
      )}
      {editando && Number(shelvesCount) < lado.shelves_count && (
        <div className="error" style={{ background: "#fff8e6", color: "#8a6300", borderColor: "#ffe8a3" }}>
          Reduzir as prateleiras só funciona se as removidas estiverem vazias e sem histórico.
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

function AndarModal({ andar, onClose, onSaved }: { andar?: any; onClose: () => void; onSaved: () => void }) {
  const editando = !!andar;
  const [code, setCode] = useState(andar?.code || "");
  const [name, setName] = useState(andar?.name || "");
  const [active, setActive] = useState(andar ? !!andar.active : true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    setErr("");
    try {
      if (editando) {
        await api.patch(`/api/logistica/mapa/andares/${andar.id}`, { name, active });
      } else {
        await api.post("/api/logistica/mapa/andares", { code, name });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar o andar.");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o andar ${andar.name}? Só é possível se ele não tiver nenhum montante.`)) return;
    setSaving(true);
    setErr("");
    try {
      await api.del(`/api/logistica/mapa/andares/${andar.id}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o andar.");
      setSaving(false);
    }
  };

  return (
    <Modal title={editando ? "Editar andar" : "Novo andar"} onClose={onClose}>
      <div className="form-grid">
        {!editando && (
          <Field label="Código *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 2" />
          </Field>
        )}
        <Field label="Nome *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Andar 2" />
        </Field>
      </div>
      {editando && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Andar ativo
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
