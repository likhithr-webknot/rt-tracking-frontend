import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import {
  addBand,
  addStream,
  deleteBand,
  deleteStream,
  fetchBands,
  fetchStreams,
  normalizeDirectoryPage,
  updateBand,
  updateBandType,
  updateStream,
} from "../../api/band-stream-directory.js";

const BAND_CODES = ["B1", "B2", "B3", "B4", "B5", "B5H", "B5L", "B6H", "B6L", "B7H", "B7L", "B8"];
const BAND_TYPE_OPTIONS = ["BOTH", "TECH", "NON_TECH"];

function titleFor(type) {
  return type === "band" ? "Band" : "Stream";
}

function fallbackLabel(type, code) {
  if (type === "stream") {
    if (code === "UI_UX") return "UI/UX";
    if (code === "Devops") return "DevOps";
    if (code === "DATA") return "Data";
  }
  if (type === "band" && /^B\d/.test(String(code || ""))) {
    return `Band ${String(code).slice(1)}`;
  }
  return String(code || "");
}

export default function BandStreamDirectory() {
  const [bands, setBands] = useState([]);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editor, setEditor] = useState({
    open: false,
    mode: "add",
    type: "band",
    originalCode: "",
    originalId: "",
    originalLabel: "",
    originalBandType: "BOTH",
    code: "",
    label: "",
    active: true,
    bandType: "BOTH",
    sortOrder: "",
  });
  const [pendingDelete, setPendingDelete] = useState(null); // { type, row }

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  const loadDirectory = useCallback(async (fetcher, { search = null, activeOnly = null } = {}) => {
    const rows = [];
    let cursor = null;
    for (let i = 0; i < 30; i += 1) {
      const data = await fetcher({ limit: 100, cursor, search, activeOnly });
      const page = normalizeDirectoryPage(data);
      rows.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const deduped = [];
    const seen = new Set();
    for (const row of rows) {
      const key = String(row?.code || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }
    return deduped;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const [bandResult, streamResult] = await Promise.allSettled([
      loadDirectory(fetchBands, { search: null }),
      loadDirectory(fetchStreams, { search: null, activeOnly: null }),
    ]);

    if (bandResult.status === "fulfilled") {
      setBands(bandResult.value);
    } else {
      setBands([]);
    }
    if (streamResult.status === "fulfilled") {
      setStreams(streamResult.value);
    } else {
      setStreams([]);
    }

    const errors = [];
    if (bandResult.status === "rejected") {
      errors.push(`Bands: ${bandResult.reason?.message || "failed to load"}`);
    }
    if (streamResult.status === "rejected") {
      errors.push(`Streams: ${streamResult.reason?.message || "failed to load"}`);
    }
    if (errors.length) {
      showToast({ title: "Directory load failed", message: errors.join(" | "), tone: "error" });
    }
    setLoading(false);
  }, [loadDirectory]);

  useEffect(() => {
    reload().catch(() => { void 0; });
  }, [reload]);

  const q = String(query || "").trim().toLowerCase();
  const filteredBands = useMemo(() => {
    if (!q) return bands;
    return bands.filter((row) =>
      String(row.code || "").toLowerCase().includes(q) ||
      String(row.label || "").toLowerCase().includes(q)
    );
  }, [bands, q]);

  const filteredStreams = useMemo(() => {
    if (!q) return streams;
    return streams.filter((row) =>
      String(row.code || "").toLowerCase().includes(q) ||
      String(row.label || "").toLowerCase().includes(q)
    );
  }, [streams, q]);

  const missingBandCodes = useMemo(() => {
    const existing = new Set(bands.map((x) => String(x.code || "").trim()));
    return BAND_CODES.filter((code) => !existing.has(code));
  }, [bands]);
  const streamCodeOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const row of streams) {
      const code = String(row?.code || "").trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      options.push(code);
    }
    return options.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [streams]);

  function openAdd(type) {
    const options = type === "band" ? missingBandCodes : streamCodeOptions;
    const code = options[0] || "";
    setEditor({
      open: true,
      mode: "add",
      type,
      originalCode: "",
      originalId: "",
      originalLabel: "",
      originalBandType: "BOTH",
      code,
      label: fallbackLabel(type, code),
      active: true,
      bandType: "BOTH",
      sortOrder: "",
    });
  }

  function openEdit(type, row) {
    if (!row) return;
    setEditor({
      open: true,
      mode: "edit",
      type,
      originalCode: String(row.code || "").trim(),
      originalId: String(row.id || "").trim(),
      originalLabel: String(row.label || "").trim(),
      originalBandType: String(row.bandType || "BOTH").trim().toUpperCase() || "BOTH",
      code: String(row.code || "").trim(),
      label: String(row.label || "").trim(),
      active: type === "stream" ? Boolean(row.active) : true,
      bandType: String(row.bandType || "BOTH").trim().toUpperCase() || "BOTH",
      sortOrder:
        row.sortOrder == null || Number.isNaN(Number(row.sortOrder))
          ? ""
          : String(row.sortOrder),
    });
  }

  function closeEditor() {
    if (saving) return;
    setEditor({
      open: false,
      mode: "add",
      type: "band",
      originalCode: "",
      originalId: "",
      originalLabel: "",
      originalBandType: "BOTH",
      code: "",
      label: "",
      active: true,
      bandType: "BOTH",
      sortOrder: "",
    });
  }

  async function submitEditor(e) {
    e.preventDefault();
    const type = editor.type === "stream" ? "stream" : "band";
    const code = String(editor.code || "").trim();
    const originalCode = String(editor.originalCode || "").trim();
    const originalId = String(editor.originalId || "").trim();
    const originalLabel = String(editor.originalLabel || "").trim();
    const originalBandType = String(editor.originalBandType || "BOTH").trim().toUpperCase() || "BOTH";
    const label = String(editor.label || "").trim();
    const sortOrder = String(editor.sortOrder || "").trim();

    if (!code) {
      showToast({ title: "Missing code", message: `${titleFor(type)} code is required.`, tone: "error" });
      return;
    }
    if (!label) {
      showToast({ title: "Missing label", message: `${titleFor(type)} label is required.`, tone: "error" });
      return;
    }
    if (editor.mode === "edit") {
      const keyOf = (value) => String(value || "").trim().toUpperCase();
      const codeKey = keyOf(code);
      const originalCodeKey = keyOf(originalCode);
      const duplicate = (type === "band" ? bands : streams).some((row) => {
        const rowCodeKey = keyOf(row?.code);
        if (!rowCodeKey || rowCodeKey !== codeKey) return false;
        const rowId = String(row?.id || "").trim();
        if (originalId && rowId) return rowId !== originalId;
        return rowCodeKey !== originalCodeKey;
      });
      if (duplicate) {
        showToast({
          title: "Duplicate code",
          message: `${titleFor(type)} code "${code}" already exists.`,
          tone: "error",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        code,
        label,
        ...(type === "stream" ? { active: Boolean(editor.active) } : {}),
        bandType: String(editor.bandType || "BOTH").trim().toUpperCase() || "BOTH",
        sortOrder: sortOrder === "" ? null : Number.parseInt(sortOrder, 10),
      };

      if (type === "band") {
        if (editor.mode === "add") await addBand(payload);
        else {
          const nextBandType = String(payload.bandType || "BOTH").trim().toUpperCase() || "BOTH";
          const codeChanged = String(code).trim().toUpperCase() !== String(originalCode).trim().toUpperCase();
          const labelChanged = String(label).trim() !== String(originalLabel).trim();
          const bandTypeChanged = nextBandType !== originalBandType;
          let bandTypeApplied = false;
          const bandTarget = originalId || originalCode || code;
          if (!codeChanged && !labelChanged && bandTypeChanged && originalId) {
            await updateBandType(originalId, nextBandType);
            bandTypeApplied = true;
          } else {
            await updateBand(bandTarget, { ...payload, code });
          }
          if (originalId && bandTypeChanged && !bandTypeApplied) {
            try {
              await updateBandType(originalId, nextBandType);
            } catch (err) {
              if (!(err?.status === 404 || err?.status === 405)) throw err;
            }
          }
        }
      } else {
        if (editor.mode === "add") await addStream(payload);
        else await updateStream(originalCode || code, payload);
      }

      await reload();
      showToast({
        title: editor.mode === "add" ? `${titleFor(type)} added` : `${titleFor(type)} updated`,
        message: code,
      });
      closeEditor();
    } catch (err) {
      const message = String(err?.message || "Failed to save changes.").trim();
      const duplicateMatch = /already exists with name:\s*([A-Za-z0-9_-]+)/i.exec(message);
      if (duplicateMatch) {
        await reload().catch(() => { void 0; });
        const bandName = duplicateMatch[1] || code;
        showToast({
          title: "Band already exists",
          message: `${bandName} already exists in backend. Directory was refreshed to sync latest data.`,
          tone: "error",
        });
      } else {
        showToast({ title: "Save failed", message, tone: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(type, row) {
    if (!row) return;
    const code = String(row.code || "").trim();
    if (!code) return;
    try {
      if (type === "band") {
        const bandId = String(row?.id || "").trim();
        if (!bandId) throw new Error("Band id is missing.");
        const current = String(row?.bandType || "BOTH").toUpperCase();
        const next = current === "BOTH" ? "TECH" : current === "TECH" ? "NON_TECH" : "BOTH";
        await updateBandType(bandId, next);
      } else {
        await updateStream(code, { active: !row.active });
      }
      await reload();
    } catch (err) {
      showToast({ title: "Update failed", message: err?.message || "Please try again.", tone: "error" });
    }
  }

  async function onConfirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      const type = target.type === "stream" ? "stream" : "band";
      const code = String(target?.row?.code || "").trim();
      const bandId = String(target?.row?.id || "").trim();
      if (type === "band") await deleteBand(bandId || code);
      else await deleteStream(code);
      await reload();
      showToast({ title: `${titleFor(type)} deleted`, message: code });
      setPendingDelete(null);
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const activeStreams = streams.filter((x) => x.active).length;

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex w-full min-w-0 flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="min-w-0">
          <h2 className="rt-title">Bands & Departments</h2>
          <p className="text-slate-500 text-sm mt-2">
            Manage canonical bands and streams used across KPI and employee workflows.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 min-w-[260px]">
          <div className="rt-panel-subtle rounded-lg px-4 py-3">
            <div className="rt-kicker">Bands</div>
            <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{bands.length}</div>
            <div className="text-[11px] text-[rgb(var(--muted))]">Total bands</div>
          </div>
          <div className="rt-panel-subtle rounded-lg px-4 py-3">
            <div className="rt-kicker">Departments</div>
            <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{streams.length}</div>
            <div className="text-[11px] text-[rgb(var(--muted))]">{activeStreams} active</div>
          </div>
        </div>
      </header>

      <div className="flex w-full min-w-0 flex-wrap gap-3 items-center justify-between">
        <div className="relative max-w-xl min-w-0 flex-1 basis-[min(100%,260px)]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or label..."
            className="w-full rt-input py-4 pl-12 pr-4 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openAdd("band")}
            className="rt-btn-primary"
          >
            <Plus size={16} /> Add Band
          </button>
          <button
            onClick={() => openAdd("stream")}
            className="rt-btn-primary"
          >
            <Plus size={16} /> Add Department
          </button>
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rt-panel min-w-0 overflow-hidden">
          <div className="p-6 flex items-center justify-between">
            <div className="rt-section-header">
              <h3 className="rt-section-title">Bands</h3>
              <p className="rt-section-subtitle">Used in employee profiles and KPI mapping.</p>
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-0 text-left table-fixed">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="w-[22%] p-5 font-semibold">Code</th>
                <th className="p-5 font-semibold">Label</th>
                <th className="w-[18%] p-5 font-semibold">Type</th>
                <th className="w-[140px] p-5 text-right font-semibold">Actions</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredBands.map((row) => (
                <tr key={`band:${row.code}`} className="hover:bg-[rgb(var(--surface-2))]">
                  <td className="p-5 font-mono text-[rgb(var(--text))] align-top">
                    <span className="block truncate" title={row.code}>{row.code}</span>
                  </td>
                  <td className="min-w-0 p-5 text-[rgb(var(--text))] align-top">
                    <span className="block break-words" title={row.label}>{row.label}</span>
                  </td>
                  <td className="p-5">
                    <span className="inline-flex rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest bg-blue-500/10 text-blue-300">
                      {String(row.bandType || "BOTH")}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit("band", row)} className="p-2 rounded-md text-amber-500 hover:bg-amber-500/10 transition-all" title="Cycle Band Type">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => setPendingDelete({ type: "band", row })} className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredBands.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-[rgb(var(--muted))]" colSpan={4}>No bands to show.</td>
                </tr>
              ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rt-panel min-w-0 overflow-hidden">
          <div className="p-6 flex items-center justify-between">
            <div className="rt-section-header">
              <h3 className="rt-section-title">Departments</h3>
              <p className="rt-section-subtitle">Departments in the organization.</p>
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-0 text-left table-fixed">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="w-[22%] p-5 font-semibold">Code</th>
                <th className="p-5 font-semibold">Label</th>
                <th className="w-[18%] p-5 font-semibold">State</th>
                <th className="w-[160px] p-5 text-right font-semibold">Actions</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredStreams.map((row) => (
                <tr key={`stream:${row.code}`} className="hover:bg-[rgb(var(--surface-2))]">
                  <td className="p-5 font-mono text-[rgb(var(--text))] align-top">
                    <span className="block truncate" title={row.code}>{row.code}</span>
                  </td>
                  <td className="min-w-0 p-5 text-[rgb(var(--text))] align-top">
                    <span className="block break-words" title={row.label}>{row.label}</span>
                  </td>
                  <td className="p-5">
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${row.active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit("stream", row)} className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all" title="Edit">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => toggleActive("stream", row)} className="p-2 rounded-md text-amber-500 hover:bg-amber-500/10 transition-all" title={row.active ? "Deactivate" : "Activate"}>
                        {row.active ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => setPendingDelete({ type: "stream", row })} className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredStreams.length === 0 ? (
                <tr>
                  <td className="p-8 text-center text-[rgb(var(--muted))]" colSpan={4}>No streams to show.</td>
                </tr>
              ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editor.open ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold uppercase tracking-tight">
                  {editor.mode === "add" ? `Add ${titleFor(editor.type)}` : `Edit ${titleFor(editor.type)}`}
                </h3>
                <p className="text-gray-500 text-sm mt-1">Update directory metadata for UI and filtering.</p>
              </div>
              <button onClick={closeEditor} className="p-2 rounded-md hover:bg-[rgb(var(--surface-2))]" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitEditor} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {titleFor(editor.type)} Code *
                </label>
                {editor.mode === "add" ? (
                  editor.type === "band" ? (
                    <select
                      value={editor.code}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          code: e.target.value,
                          label: prev.label || fallbackLabel(prev.type, e.target.value),
                        }))
                      }
                      className="mt-2 rt-input text-sm"
                    >
                      {(missingBandCodes.length ? missingBandCodes : BAND_CODES).map((code) => (
                        <option key={`${editor.type}:option:${code}`} value={code}>{code}</option>
                      ))}
                    </select>
                  ) : streamCodeOptions.length > 0 ? (
                    <select
                      value={editor.code}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          code: e.target.value,
                          label: prev.label || fallbackLabel(prev.type, e.target.value),
                        }))
                      }
                      className="mt-2 rt-input text-sm"
                    >
                      {streamCodeOptions.map((code) => (
                        <option key={`${editor.type}:option:${code}`} value={code}>{code}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={editor.code}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          code: e.target.value,
                          label: prev.label || fallbackLabel(prev.type, e.target.value),
                        }))
                      }
                      className="mt-2 rt-input text-sm"
                      placeholder="Enter stream code from backend"
                    />
                  )
                ) : (
                  <input
                    value={editor.code}
                    onChange={(e) => setEditor((prev) => ({ ...prev, code: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  />
                )}
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Label *
                </label>
                <input
                  value={editor.label}
                  onChange={(e) => setEditor((prev) => ({ ...prev, label: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder={fallbackLabel(editor.type, editor.code)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sort Order</label>
                  <input
                    value={editor.sortOrder}
                    onChange={(e) => setEditor((prev) => ({ ...prev, sortOrder: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="e.g., 1"
                  />
                </div>
                {editor.type === "band" ? (
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Band Type
                    </label>
                    <select
                      value={String(editor.bandType || "BOTH")}
                      onChange={(e) => setEditor((prev) => ({ ...prev, bandType: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    >
                      {BAND_TYPE_OPTIONS.map((type) => (
                        <option key={`band-type:${type}`} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {editor.type === "stream" ? (
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-3 mt-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(editor.active)}
                        onChange={(e) => setEditor((prev) => ({ ...prev, active: e.target.checked }))}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="text-sm text-[rgb(var(--text))]">Active</span>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeEditor} className="rt-btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rt-btn-primary">
                  {saving ? "Saving…" : editor.mode === "add" ? "Add" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={`Delete ${titleFor(pendingDelete.type)}`}
          message={`This will remove ${pendingDelete?.row?.code || "this row"} from the directory.`}
          confirmText={deleting ? "Deleting..." : "Delete"}
          cancelText="Cancel"
          variant="danger"
          loading={deleting}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            if (deleting) return;
            setPendingDelete(null);
          }}
        />
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
