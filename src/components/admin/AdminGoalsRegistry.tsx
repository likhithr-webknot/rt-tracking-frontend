// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addKpiDefinition,
  deleteKpiDefinition,
  fetchKpiDefinitions,
  normalizeKpiDefinitions,
  updateKpiDefinition,
} from "../../api/kpi-definitions";
import { useBands, useStreams } from "../../hooks/queries/useBandsStreams";
import KPIGoalsWorkspace from "./KPIGoalsWorkspace";
import CriteriaWeightIntegrityRadar from "./CriteriaWeightIntegrityRadar";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay from "../shared/ModalOverlay";
import Toast from "../shared/Toast";
import { exportKpisCsv } from "../../utils/entityCsvExport";

function normKey(v) {
  const s = String(v ?? "").trim();
  return s ? s.toLowerCase() : "unassigned";
}

function bandOptionValue(rows, bandText) {
  const t = String(bandText || "").trim();
  if (!t) return "";
  const row = rows.find(
    (r) => normKey(r.label) === normKey(t) || normKey(r.code) === normKey(t),
  );
  if (!row) return "";
  if (row.id && /^\d+$/.test(String(row.id))) return `id:${row.id}`;
  const c = String(row.code || "").trim();
  if (c) return `code:${c}`;
  return `label:${String(row.label || "").trim()}`;
}

function resolveBandFromToken(rows, token) {
  const s = String(token || "").trim();
  if (!s) return { band: "", bandId: "" };
  const idx = s.indexOf(":");
  const kind = idx === -1 ? "" : s.slice(0, idx);
  const payload = idx === -1 ? s : s.slice(idx + 1);
  let row = null;
  if (kind === "id") row = rows.find((r) => String(r.id) === payload);
  else if (kind === "code") row = rows.find((r) => String(r.code).trim() === payload);
  else if (kind === "label") row = rows.find((r) => String(r.label).trim() === payload);
  if (!row) return { band: "", bandId: "" };
  const band = String(row.label || row.code || "").trim();
  const bandId = row.id && /^\d+$/.test(String(row.id)) ? String(row.id) : "";
  return { band, bandId };
}

export default function AdminGoalsRegistry() {
  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allKpis, setAllKpis] = useState(null);
  const [allKpisLoaded, setAllKpisLoaded] = useState(false);
  const [allKpisLoading, setAllKpisLoading] = useState(false);
  const [allKpisError, setAllKpisError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [toast, setToast] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    evaluationCriteria: "",
    stream: "",
    band: "",
    bandToken: "",
    bandId: "",
    weight: "10%",
  });
  const [editing, setEditing] = useState(null);
  const [kpiToDelete, setKpiToDelete] = useState(null);

  const streamsQ = useStreams({ limit: 500, page: 0 });
  const bandsQ = useBands({ limit: 500, page: 0 });
  const catalogStreams = streamsQ.data?.items ?? [];
  const catalogBands = bandsQ.data?.items ?? [];
  const catalogLoading = Boolean(streamsQ.isLoading || bandsQ.isLoading);

  const kpiListForModal = useMemo(() => {
    if (Array.isArray(allKpis) && allKpis.length) return allKpis;
    return Array.isArray(kpis) ? kpis : [];
  }, [allKpis, kpis]);

  const modalStreamChoices = useMemo(() => {
    const fromCat = catalogStreams
      .filter((r) => r?.active !== false)
      .map((r) => String(r.label || r.code || "").trim())
      .filter(Boolean);
    const fromKpi = kpiListForModal.map((k) => String(k?.stream ?? "").trim()).filter(Boolean);
    return Array.from(new Set([...fromCat, ...fromKpi])).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true }),
    );
  }, [catalogStreams, kpiListForModal]);

  const modalBandRows = useMemo(() => {
    const base = catalogBands.filter((r) => r?.active !== false);
    const seen = new Set(
      base.map((r) => normKey(String(r.label || r.code || "").trim())).filter(Boolean),
    );
    const extra = [];
    for (const k of kpiListForModal) {
      const b = String(k?.band ?? "").trim();
      if (!b) continue;
      const k0 = normKey(b);
      if (seen.has(k0)) continue;
      seen.add(k0);
      extra.push({ id: null, code: "", label: b, active: true });
    }
    return [...base, ...extra];
  }, [catalogBands, kpiListForModal]);

  function positiveBandId(raw) {
    const n = Number.parseInt(String(raw ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const loadPage = useCallback(async () => {
    setLoading(true);
    setAllKpisError("");
    try {
      const raw = await fetchKpiDefinitions({ limit: pageSize, cursor });
      const items = Array.isArray(raw?.items) ? raw.items : [];
      setKpis(normalizeKpiDefinitions(items));
      setNextCursor(raw?.nextCursor != null && String(raw.nextCursor).trim() !== "" ? String(raw.nextCursor) : null);
    } catch (err) {
      setAllKpisError(err?.message || "Failed to load KPIs.");
      setKpis([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [cursor, pageSize]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    setCursor(null);
    setCursorStack([]);
    setNextCursor(null);
  }, [pageSize]);

  const onReloadAll = useCallback(async ({ silent } = {}) => {
    if (!silent) setAllKpisLoading(true);
    setAllKpisError("");
    try {
      const raw = await fetchKpiDefinitions({ limit: null });
      const items = Array.isArray(raw?.items) ? raw.items : [];
      setAllKpis(normalizeKpiDefinitions(items));
      setAllKpisLoaded(true);
    } catch (err) {
      const msg = err?.message || "Full KPI list failed.";
      setAllKpisError(msg);
      if (!silent) setToast({ title: "Load failed", message: msg, tone: "error" });
    } finally {
      setAllKpisLoading(false);
    }
  }, []);

  const onDeleteKpi = async (kpi) => {
    const target = kpi || kpiToDelete;
    if (!target?.id) return;
    try {
      await deleteKpiDefinition(target.id);
      setToast({ title: "Deleted", message: target.title });
      await loadPage();
      onReloadAll({ silent: true }).catch(() => {});
    } catch (err) {
      setToast({ title: "Delete failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setKpiToDelete(null);
    }
  };

  const pager = useMemo(
    () => ({
      canPrev: cursorStack.length > 0,
      canNext: Boolean(nextCursor),
      loading,
      label: "Goals",
      onPrev: () => {
        if (!cursorStack.length) return;
        const prev = cursorStack[cursorStack.length - 1];
        setCursorStack((s) => s.slice(0, -1));
        setCursor(prev);
      },
      onNext: () => {
        if (nextCursor == null) return;
        setCursorStack((s) => [...s, cursor]);
        setCursor(nextCursor);
      },
    }),
    [cursor, cursorStack, nextCursor, loading],
  );

  const radarKpis = useMemo(() => {
    if (Array.isArray(allKpis) && allKpis.length) return allKpis;
    return kpis;
  }, [allKpis, kpis]);

  return (
    <div className="space-y-6">
      <CriteriaWeightIntegrityRadar kpis={radarKpis} />
      <KPIGoalsWorkspace
        kpis={kpis}
        allKpis={allKpis}
        allKpisLoaded={allKpisLoaded}
        allKpisLoading={allKpisLoading}
        allKpisError={allKpisError}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        catalogStreams={catalogStreams}
        catalogBands={catalogBands}
        catalogLoading={catalogLoading}
        onAddKpi={() => {
          setDraft({
            title: "",
            evaluationCriteria: "",
            stream: "",
            band: "",
            bandToken: "",
            bandId: "",
            weight: "10%",
          });
          setAddOpen(true);
        }}
        onEditKpi={(kpi) =>
          setEditing({
            ...kpi,
            evaluationCriteria: kpi.evaluationCriteria || "",
            bandToken: bandOptionValue(modalBandRows, kpi.band),
          })
        }
        onDeleteKpi={(kpi) => setKpiToDelete(kpi)}
        loading={loading}
        onReload={loadPage}
        onReloadAll={onReloadAll}
        pager={pager}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50]}
        onPageSizeChange={(n) => setPageSize(n)}
        onImportComplete={async () => {
          await loadPage();
          await onReloadAll({ silent: true }).catch(() => {});
        }}
        onExportKpis={() => exportKpisCsv(allKpis?.length ? allKpis : kpis)}
        showToast={(t) => setToast(t)}
      />

      {addOpen ? (
        <ModalOverlay
          open={addOpen}
          onClose={() => setAddOpen(false)}
          header={<h3 className="font-semibold text-[rgb(var(--text))]">Add goal</h3>}
          maxWidth="max-w-lg"
          zIndex={80}
        >
          <form
            className="space-y-4 mt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { band: bandResolved, bandId } = resolveBandFromToken(modalBandRows, draft.bandToken);
                const bid = positiveBandId(bandId);
                if (!draft.evaluationCriteria.trim()) {
                  setToast({ title: "Missing field", message: "Evaluation criteria is required.", tone: "error" });
                  return;
                }
                await addKpiDefinition({
                  kpiName: draft.title,
                  title: draft.title,
                  evaluationCriteria: draft.evaluationCriteria.trim(),
                  stream: draft.stream,
                  band: bandResolved || draft.band,
                  ...(bid != null ? { bandId: bid } : {}),
                  weightage: draft.weight,
                });
                setToast({ title: "Goal added", message: draft.title });
                setAddOpen(false);
                await loadPage();
                onReloadAll({ silent: true }).catch(() => {});
              } catch (err) {
                setToast({ title: "Add failed", message: err?.message || "Please try again.", tone: "error" });
              }
            }}
          >
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Goal / objective *</label>
              <input
                className="mt-1 rt-input w-full"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Evaluation criteria *</label>
              <input
                className="mt-1 rt-input w-full"
                value={draft.evaluationCriteria}
                onChange={(e) => setDraft((d) => ({ ...d, evaluationCriteria: e.target.value }))}
                placeholder="e.g. Sr. Architect, Lead Developer"
                list="kpi-evaluation-criteria-suggestions"
                required
              />
              <datalist id="kpi-evaluation-criteria-suggestions">
                {Array.from(
                  new Set(
                    kpiListForModal
                      .map((k) => String(k?.evaluationCriteria ?? "").trim())
                      .filter(Boolean),
                  ),
                ).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Department *</label>
                <select
                  className="mt-1 rt-input w-full"
                  value={draft.stream}
                  onChange={(e) => setDraft((d) => ({ ...d, stream: e.target.value }))}
                  required
                >
                  <option value="">Select stream</option>
                  {modalStreamChoices.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Band</label>
                <select
                  className="mt-1 rt-input w-full"
                  value={draft.bandToken}
                  onChange={(e) => {
                    const tok = e.target.value;
                    const { band, bandId } = resolveBandFromToken(modalBandRows, tok);
                    setDraft((d) => ({ ...d, bandToken: tok, band, bandId }));
                  }}
                  required
                >
                  <option value="">Select band</option>
                  {modalBandRows.map((r) => {
                    const tok =
                      r.id && /^\d+$/.test(String(r.id))
                        ? `id:${r.id}`
                        : String(r.code || "").trim()
                          ? `code:${String(r.code).trim()}`
                          : `label:${String(r.label || "").trim()}`;
                    const label = String(r.label || r.code || "").trim();
                    if (!label) return null;
                    return (
                      <option key={tok} value={tok}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Weightage %</label>
              <input
                className="mt-1 rt-input w-full"
                value={draft.weight}
                onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
                placeholder="e.g. 10 or 10%"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rt-btn-ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="rt-btn-primary">
                Save
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}

      {editing ? (
        <ModalOverlay
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          header={<h3 className="font-semibold text-[rgb(var(--text))]">Edit goal</h3>}
          maxWidth="max-w-lg"
          zIndex={80}
        >
          <form
            className="space-y-4 mt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { band: bandResolved, bandId } = resolveBandFromToken(modalBandRows, editing.bandToken);
                const bid = positiveBandId(bandId);
                if (!editing.evaluationCriteria?.trim()) {
                  setToast({ title: "Missing field", message: "Evaluation criteria is required.", tone: "error" });
                  return;
                }
                await updateKpiDefinition({
                  id: editing.id,
                  kpiDefinitionId: editing.id,
                  title: editing.title,
                  kpiName: editing.title,
                  evaluationCriteria: String(editing.evaluationCriteria).trim(),
                  stream: editing.stream,
                  band: bandResolved || editing.band,
                  ...(bid != null ? { bandId: bid } : {}),
                  weightage: editing.weight,
                });
                setToast({ title: "Updated", message: editing.title });
                setEditing(null);
                await loadPage();
                onReloadAll({ silent: true }).catch(() => {});
              } catch (err) {
                setToast({ title: "Update failed", message: err?.message || "Please try again.", tone: "error" });
              }
            }}
          >
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Goal / objective *</label>
              <input
                className="mt-1 rt-input w-full"
                value={editing.title}
                onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Evaluation criteria *</label>
              <input
                className="mt-1 rt-input w-full"
                value={editing.evaluationCriteria || ""}
                onChange={(e) => setEditing((x) => ({ ...x, evaluationCriteria: e.target.value }))}
                placeholder="e.g. Sr. Architect, Lead Developer"
                list="kpi-evaluation-criteria-suggestions-edit"
                required
              />
              <datalist id="kpi-evaluation-criteria-suggestions-edit">
                {Array.from(
                  new Set(
                    kpiListForModal
                      .map((k) => String(k?.evaluationCriteria ?? "").trim())
                      .filter(Boolean),
                  ),
                ).map((c) => (
                  <option key={`edit-${c}`} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Department *</label>
                <select
                  className="mt-1 rt-input w-full"
                  value={editing.stream}
                  onChange={(e) => setEditing((x) => ({ ...x, stream: e.target.value }))}
                  required
                >
                  <option value="">Select stream</option>
                  {modalStreamChoices.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Band</label>
                <select
                  className="mt-1 rt-input w-full"
                  value={editing.bandToken || bandOptionValue(modalBandRows, editing.band)}
                  onChange={(e) => {
                    const tok = e.target.value;
                    const { band, bandId } = resolveBandFromToken(modalBandRows, tok);
                    setEditing((x) => ({ ...x, bandToken: tok, band, bandId: bandId || x.bandId }));
                  }}
                  required
                >
                  <option value="">Select band</option>
                  {modalBandRows.map((r) => {
                    const tok =
                      r.id && /^\d+$/.test(String(r.id))
                        ? `id:${r.id}`
                        : String(r.code || "").trim()
                          ? `code:${String(r.code).trim()}`
                          : `label:${String(r.label || "").trim()}`;
                    const label = String(r.label || r.code || "").trim();
                    if (!label) return null;
                    return (
                      <option key={tok} value={tok}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Weightage %</label>
              <input
                className="mt-1 rt-input w-full"
                value={editing.weight}
                onChange={(e) => setEditing((x) => ({ ...x, weight: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rt-btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="rt-btn-primary">
                Save
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}

      <ConfirmDialog
        open={Boolean(kpiToDelete)}
        title="Delete goal"
        message={kpiToDelete ? `Delete goal "${kpiToDelete.title}"?` : ""}
        confirmText="Delete"
        confirmVariant="danger"
        onCancel={() => setKpiToDelete(null)}
        onConfirm={() => onDeleteKpi()}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
