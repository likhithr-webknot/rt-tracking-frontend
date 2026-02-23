import React, { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, Layers, Plus, Search, Trash2, X } from "lucide-react";
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
  updateStream,
} from "../../api/band-stream-directory.js";

const BAND_CODES = ["B1", "B2", "B3", "B4", "B5", "B5H", "B5L", "B6H", "B6L", "B7H", "B7L", "B8"];
const STREAM_CODES = ["Development", "QA", "Devops", "DATA", "UI_UX"];

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
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editor, setEditor] = useState({
    open: false,
    mode: "add",
    type: "band",
    code: "",
    label: "",
    active: true,
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

  async function loadDirectory(fetcher) {
    const rows = [];
    let cursor = null;
    for (let i = 0; i < 30; i += 1) {
      const data = await fetcher({ limit: 100, cursor });
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
  }

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [bandRows, streamRows] = await Promise.all([
        loadDirectory(fetchBands),
        loadDirectory(fetchStreams),
      ]);
      setBands(bandRows);
      setStreams(streamRows);
    } catch (err) {
      setError(err?.message || "Failed to load bands and streams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const missingStreamCodes = useMemo(() => {
    const existing = new Set(streams.map((x) => String(x.code || "").trim()));
    return STREAM_CODES.filter((code) => !existing.has(code));
  }, [streams]);

  function openAdd(type) {
    const options = type === "band" ? missingBandCodes : missingStreamCodes;
    const code = options[0] || (type === "band" ? BAND_CODES[0] : STREAM_CODES[0]);
    setEditor({
      open: true,
      mode: "add",
      type,
      code,
      label: fallbackLabel(type, code),
      active: true,
      sortOrder: "",
    });
  }

  function openEdit(type, row) {
    if (!row) return;
    setEditor({
      open: true,
      mode: "edit",
      type,
      code: String(row.code || "").trim(),
      label: String(row.label || "").trim(),
      active: Boolean(row.active),
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
      code: "",
      label: "",
      active: true,
      sortOrder: "",
    });
  }

  async function submitEditor(e) {
    e.preventDefault();
    const type = editor.type === "stream" ? "stream" : "band";
    const code = String(editor.code || "").trim();
    const label = String(editor.label || "").trim();
    const sortOrder = String(editor.sortOrder || "").trim();

    if (!code) {
      showToast({ title: "Missing code", message: `${titleFor(type)} code is required.` });
      return;
    }
    if (!label) {
      showToast({ title: "Missing label", message: `${titleFor(type)} label is required.` });
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        label,
        active: Boolean(editor.active),
        sortOrder: sortOrder === "" ? null : Number.parseInt(sortOrder, 10),
      };
      if (editor.mode === "add") {
        payload.code = code;
      }

      if (type === "band") {
        if (editor.mode === "add") await addBand(payload);
        else await updateBand(code, payload);
      } else {
        if (editor.mode === "add") await addStream(payload);
        else await updateStream(code, payload);
      }

      await reload();
      showToast({
        title: editor.mode === "add" ? `${titleFor(type)} added` : `${titleFor(type)} updated`,
        message: code,
      });
      closeEditor();
    } catch (err) {
      const message = err?.message || "Failed to save changes.";
      setError(message);
      showToast({ title: "Save failed", message });
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
        await updateBand(code, { active: !row.active });
      } else {
        await updateStream(code, { active: !row.active });
      }
      await reload();
    } catch (err) {
      showToast({ title: "Update failed", message: err?.message || "Please try again." });
    }
  }

  async function onConfirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      const type = target.type === "stream" ? "stream" : "band";
      const code = String(target?.row?.code || "").trim();
      if (type === "band") await deleteBand(code);
      else await deleteStream(code);
      await reload();
      showToast({ title: `${titleFor(type)} deleted`, message: code });
      setPendingDelete(null);
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setDeleting(false);
    }
  }

  const activeBands = bands.filter((x) => x.active).length;
  const activeStreams = streams.filter((x) => x.active).length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">Band & Stream Directory</h2>
          <p className="text-slate-500 text-sm mt-2">
            Manage canonical bands and streams used across KPI and employee workflows.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 min-w-[260px]">
          <div className="rt-panel-subtle rounded-2xl px-4 py-3">
            <div className="rt-kicker">Bands</div>
            <div className="mt-1 text-2xl font-black text-[rgb(var(--text))]">{bands.length}</div>
            <div className="text-[11px] text-[rgb(var(--muted))]">{activeBands} active</div>
          </div>
          <div className="rt-panel-subtle rounded-2xl px-4 py-3">
            <div className="rt-kicker">Streams</div>
            <div className="mt-1 text-2xl font-black text-[rgb(var(--text))]">{streams.length}</div>
            <div className="text-[11px] text-[rgb(var(--muted))]">{activeStreams} active</div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative max-w-xl flex-1 min-w-[260px]">
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
            className="rt-btn-primary inline-flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest"
          >
            <Plus size={16} /> Add Band
          </button>
          <button
            onClick={() => openAdd("stream")}
            className="rt-btn-primary inline-flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest"
          >
            <Plus size={16} /> Add Stream
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="rt-panel overflow-hidden">
          <div className="p-6 flex items-center justify-between">
            <div className="rt-section-header">
              <h3 className="rt-section-title">Bands</h3>
              <p className="rt-section-subtitle">Used in employee profiles and KPI mapping.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-5 font-black">Code</th>
                <th className="p-5 font-black">Label</th>
                <th className="p-5 font-black">State</th>
                <th className="p-5 text-right font-black">Actions</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredBands.map((row) => (
                <tr key={`band:${row.code}`} className="hover:bg-[rgb(var(--surface-2))]">
                  <td className="p-5 font-mono text-[rgb(var(--text))]">{row.code}</td>
                  <td className="p-5 text-[rgb(var(--text))]">{row.label}</td>
                  <td className="p-5">
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${row.active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit("band", row)} className="p-2.5 rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500 hover:text-white transition-all" title="Edit">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => toggleActive("band", row)} className="p-2.5 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-white transition-all" title={row.active ? "Deactivate" : "Activate"}>
                        {row.active ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => setPendingDelete({ type: "band", row })} className="p-2.5 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white transition-all" title="Delete">
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

        <section className="rt-panel overflow-hidden">
          <div className="p-6 flex items-center justify-between">
            <div className="rt-section-header">
              <h3 className="rt-section-title">Streams</h3>
              <p className="rt-section-subtitle">Canonical stream names for KPI visibility.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-5 font-black">Code</th>
                <th className="p-5 font-black">Label</th>
                <th className="p-5 font-black">State</th>
                <th className="p-5 text-right font-black">Actions</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredStreams.map((row) => (
                <tr key={`stream:${row.code}`} className="hover:bg-[rgb(var(--surface-2))]">
                  <td className="p-5 font-mono text-[rgb(var(--text))]">{row.code}</td>
                  <td className="p-5 text-[rgb(var(--text))]">{row.label}</td>
                  <td className="p-5">
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${row.active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit("stream", row)} className="p-2.5 rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500 hover:text-white transition-all" title="Edit">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => toggleActive("stream", row)} className="p-2.5 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-white transition-all" title={row.active ? "Deactivate" : "Activate"}>
                        {row.active ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => setPendingDelete({ type: "stream", row })} className="p-2.5 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white transition-all" title="Delete">
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
                <h3 className="font-black uppercase tracking-tight">
                  {editor.mode === "add" ? `Add ${titleFor(editor.type)}` : `Edit ${titleFor(editor.type)}`}
                </h3>
                <p className="text-gray-500 text-sm mt-1">Update directory metadata for UI and filtering.</p>
              </div>
              <button onClick={closeEditor} className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitEditor} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  {titleFor(editor.type)} Code *
                </label>
                {editor.mode === "add" ? (
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
                    {(editor.type === "band" ? (missingBandCodes.length ? missingBandCodes : BAND_CODES) : (missingStreamCodes.length ? missingStreamCodes : STREAM_CODES))
                      .map((code) => (
                        <option key={`${editor.type}:option:${code}`} value={code}>{code}</option>
                      ))}
                  </select>
                ) : (
                  <input value={editor.code} readOnly className="mt-2 rt-input text-sm opacity-80 cursor-not-allowed" />
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
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
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Sort Order</label>
                  <input
                    value={editor.sortOrder}
                    onChange={(e) => setEditor((prev) => ({ ...prev, sortOrder: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="e.g., 1"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-3 mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={Boolean(editor.active)}
                      onChange={(e) => setEditor((prev) => ({ ...prev, active: e.target.checked }))}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-sm text-[rgb(var(--text))]">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeEditor} className="rt-btn-ghost text-xs uppercase tracking-widest">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rt-btn-primary text-xs uppercase tracking-widest">
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
