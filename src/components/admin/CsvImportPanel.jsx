import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  FileUp,
  Database,
  Users,
  Layers,
  Award,
  Target,
  Sparkles,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { importCsvSingle, importCsvBulk, CSV_ENTITY_MAP, CSV_BULK_FIELD_MAP } from "../../api/csv-import.js";
import ModalOverlay from "../shared/ModalOverlay.jsx";

/* ───── entity config ───── */
const ENTITY_OPTIONS = [
  { key: "employees", label: "Employees", icon: Users, hint: "employeeId, employeeName, email, empRole, band, stream", color: "text-blue-500" },
  { key: "bands", label: "Bands", icon: Layers, hint: "code", color: "text-purple-500" },
  { key: "streams", label: "Streams", icon: Layers, hint: "code", color: "text-emerald-500" },
  { key: "webknot-values", label: "Webknot Values", icon: Sparkles, hint: "title, evaluationCriteria", color: "text-amber-500" },
  { key: "kpi-definitions", label: "KPI Definitions", icon: Target, hint: "band, stream, kpiName, weightage", color: "text-rose-500" },
  { key: "certifications", label: "Certifications", icon: Award, hint: "name", color: "text-teal-500" },
  { key: "designation-lookups", label: "Designation Lookups", icon: BookOpen, hint: "stream, band, designation", color: "text-indigo-500" },
];

const BULK_FIELDS = [
  { field: "employees", label: "Employees" },
  { field: "bands", label: "Bands" },
  { field: "streams", label: "Streams" },
  { field: "webknotValues", label: "Webknot Values" },
  { field: "kpiDefinitions", label: "KPI Definitions" },
  { field: "certifications", label: "Certifications" },
  { field: "designationLookups", label: "Designation Lookups" },
];

const BULK_LABEL_BY_FIELD = Object.fromEntries(BULK_FIELDS.map((item) => [item.field, item.label]));

function formatFileSize(file) {
  if (!(file instanceof File)) return "0 KB";
  return `${(file.size / 1024).toFixed(1)} KB`;
}

/* ───── component ───── */

export default function CsvImportPanel({ onImportComplete, showToast }) {
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [selectedEntity, setSelectedEntity] = useState("employees");
  const [singleFile, setSingleFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState({}); // { field: File }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: "success" | "error", message: string }
  const [history, setHistory] = useState([]); // [{ ts, entity, status, message }]
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPayload, setReviewPayload] = useState(null);
  const singleInputRef = useRef(null);
  const bulkInputRefs = useRef({});
  const reviewInputRefs = useRef({});

  const clearResult = useCallback(() => setResult(null), []);
  const activeEntityOption = ENTITY_OPTIONS.find((e) => e.key === selectedEntity) || ENTITY_OPTIONS[0];
  const bulkFileCount = Object.values(bulkFiles).filter((f) => f instanceof File).length;
  const totalSelectedFiles = mode === "single" ? (singleFile ? 1 : 0) : bulkFileCount;

  const reviewRows = useMemo(() => reviewPayload?.rows || [], [reviewPayload]);
  const canConfirmReview = reviewRows.some((row) => row.file instanceof File);

  /* ── single import ── */
  async function handleSingleImport(fileToImport = singleFile, entityToImport = selectedEntity) {
    if (!fileToImport || loading) return;
    setLoading(true);
    setResult(null);
    const entity = entityToImport;
    try {
      const res = await importCsvSingle(entity, fileToImport);
      const msg = res?.message || `Successfully imported ${entity}.`;
      setResult({ type: "success", message: msg });
      setHistory((h) => [{ ts: Date.now(), entity, status: "success", message: msg }, ...h].slice(0, 20));
      setSingleFile(null);
      if (singleInputRef.current) singleInputRef.current.value = "";
      onImportComplete?.();
      showToast?.({ title: "Import Successful", message: msg, tone: "success" });
    } catch (err) {
      const msg = err?.message || "Import failed.";
      setResult({ type: "error", message: msg });
      setHistory((h) => [{ ts: Date.now(), entity, status: "error", message: msg }, ...h].slice(0, 20));
      showToast?.({ title: "Import Failed", message: msg, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  /* ── bulk import ── */
  async function handleBulkImport(files = bulkFiles) {
    const entries = Object.entries(files).filter(([, f]) => f instanceof File);
    if (!entries.length || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const payload = Object.fromEntries(entries);
      const res = await importCsvBulk(payload);
      const msg = res?.message || `Bulk import completed (${entries.length} file${entries.length > 1 ? "s" : ""}).`;
      setResult({ type: "success", message: msg });
      setHistory((h) => [{ ts: Date.now(), entity: "bulk", status: "success", message: msg }, ...h].slice(0, 20));
      setBulkFiles({});
      Object.values(bulkInputRefs.current).forEach((ref) => { if (ref) ref.value = ""; });
      onImportComplete?.();
      showToast?.({ title: "Bulk Import Successful", message: msg, tone: "success" });
    } catch (err) {
      const msg = err?.message || "Bulk import failed.";
      setResult({ type: "error", message: msg });
      setHistory((h) => [{ ts: Date.now(), entity: "bulk", status: "error", message: msg }, ...h].slice(0, 20));
      showToast?.({ title: "Bulk Import Failed", message: msg, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  function openReviewDialog() {
    if (loading) return;

    if (mode === "single") {
      if (!(singleFile instanceof File)) return;
      setReviewPayload({
        mode: "single",
        entity: selectedEntity,
        rows: [{
          id: "single",
          field: selectedEntity,
          label: activeEntityOption.label,
          hint: activeEntityOption.hint,
          file: singleFile,
        }],
      });
      setReviewOpen(true);
      return;
    }

    const rows = Object.entries(bulkFiles)
      .filter(([, f]) => f instanceof File)
      .map(([field, file]) => ({
        id: field,
        field,
        label: BULK_LABEL_BY_FIELD[field] || field,
        hint: `mapped field: ${field}`,
        file,
      }));

    if (!rows.length) return;

    setReviewPayload({ mode: "bulk", rows });
    setReviewOpen(true);
  }

  function closeReviewDialog() {
    setReviewOpen(false);
    setReviewPayload(null);
    reviewInputRefs.current = {};
  }

  function updateReviewRowFile(rowId, file) {
    if (!(file instanceof File)) return;

    setReviewPayload((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row) => (row.id === rowId ? { ...row, file } : row));
      return { ...prev, rows };
    });

    if (rowId === "single") {
      setSingleFile(file);
      if (singleInputRef.current) {
        singleInputRef.current.value = "";
      }
      return;
    }

    setBulkFiles((prev) => ({ ...prev, [rowId]: file }));
    if (bulkInputRefs.current[rowId]) {
      bulkInputRefs.current[rowId].value = "";
    }
  }

  function removeReviewRow(rowId) {
    setReviewPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, rows: prev.rows.filter((row) => row.id !== rowId) };
    });

    if (rowId === "single") {
      setSingleFile(null);
      if (singleInputRef.current) {
        singleInputRef.current.value = "";
      }
      return;
    }

    removeBulkFile(rowId);
  }

  async function confirmReviewedImport() {
    if (!reviewPayload || loading) return;

    if (reviewPayload.mode === "single") {
      const [row] = reviewPayload.rows;
      if (!(row?.file instanceof File)) return;
      await handleSingleImport(row.file, reviewPayload.entity);
      closeReviewDialog();
      return;
    }

    const payload = Object.fromEntries(
      reviewPayload.rows
        .filter((row) => row.file instanceof File)
        .map((row) => [row.field, row.file]),
    );

    if (!Object.keys(payload).length) return;
    await handleBulkImport(payload);
    closeReviewDialog();
  }

  function removeBulkFile(field) {
    setBulkFiles((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (bulkInputRefs.current[field]) bulkInputRefs.current[field].value = "";
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      <div className="rt-panel p-5 sm:p-6 overflow-hidden relative">
        <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <p className="rt-kicker mb-1">Import Control</p>
            <h2 className="rt-title">CSV Import</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-1">
              Review every dataset before writing into the database.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Mode</p>
              <p className="text-sm font-semibold text-[rgb(var(--text))] mt-1">{mode === "single" ? "Single" : "Bulk"}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Files Ready</p>
              <p className="text-sm font-semibold text-[rgb(var(--text))] mt-1">{totalSelectedFiles}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── header ── */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h3 className="rt-section-title">Choose Import Strategy</h3>
          <p className="text-sm text-[rgb(var(--muted))] mt-1">
            Import one dataset at a time or push multiple files in one reviewed batch.
          </p>
        </div>
      </header>

      {/* ── mode toggle ── */}
      <div className="inline-flex gap-2 p-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
        <button
          onClick={() => { setMode("single"); setResult(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "single"
              ? "bg-[rgb(var(--primary))] text-white shadow-md"
              : "bg-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
          }`}
        >
          <FileUp size={14} className="inline mr-1.5 -mt-0.5" />
          Single Entity
        </button>
        <button
          onClick={() => { setMode("bulk"); setResult(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "bulk"
              ? "bg-[rgb(var(--primary))] text-white shadow-md"
              : "bg-transparent text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
          }`}
        >
          <Database size={14} className="inline mr-1.5 -mt-0.5" />
          Bulk Import
        </button>
      </div>

      {/* ── result toast ── */}
      {result ? (
        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
          result.type === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
        }`}>
          {result.type === "success" ? <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{result.type === "success" ? "Import Successful" : "Import Failed"}</p>
            <p className="mt-0.5 text-xs opacity-80">{result.message}</p>
          </div>
          <button onClick={clearResult} className="p-1 hover:opacity-70 flex-shrink-0"><X size={14} /></button>
        </div>
      ) : null}

      {/* ═══════ SINGLE MODE ═══════ */}
      {mode === "single" ? (
        <div className="rt-panel p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-lg p-2.5 bg-blue-500/10 text-blue-500">
              <FileUp size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-semibold text-[rgb(var(--text))]">Single Entity Import</h3>
              <p className="text-xs text-[rgb(var(--muted))] mt-0.5">Upload one CSV for a specific data type</p>
            </div>
          </div>

          {/* entity picker */}
          <div>
            <label className="rt-kicker mb-2 block">Entity Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ENTITY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = selectedEntity === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedEntity(opt.key)}
                    className={`flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm transition-all ${
                      isActive
                        ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/5 ring-1 ring-[rgb(var(--primary))]/20"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:bg-[rgb(var(--surface-2))]"
                    }`}
                  >
                    <Icon size={16} className={isActive ? "text-[rgb(var(--primary))]" : opt.color} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold truncate ${isActive ? "text-[rgb(var(--primary))]" : "text-[rgb(var(--text))]"}`}>{opt.label}</div>
                      <div className="text-[10px] text-[rgb(var(--muted))] truncate mt-0.5 font-mono">{opt.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* file drop zone */}
          <div>
            <label className="rt-kicker mb-2 block">CSV File</label>
            <div
              className={`relative group rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                singleFile
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-[rgb(var(--border))] hover:border-[rgb(var(--primary))]/40 bg-[rgb(var(--surface))]"
              }`}
              onClick={() => singleInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer?.files?.[0];
                if (file && file.name.endsWith(".csv")) {
                  setSingleFile(file);
                  setResult(null);
                }
              }}
            >
              <input
                ref={singleInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setSingleFile(file); setResult(null); }
                }}
              />
              {singleFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet size={24} className="text-emerald-500" />
                  <div className="text-left">
                    <p className="font-semibold text-sm text-[rgb(var(--text))]">{singleFile.name}</p>
                    <p className="text-[11px] text-[rgb(var(--muted))]">{(singleFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSingleFile(null); if (singleInputRef.current) singleInputRef.current.value = ""; }}
                    className="ml-2 p-1.5 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={28} className="mx-auto text-[rgb(var(--muted))] mb-2" />
                  <p className="text-sm font-semibold text-[rgb(var(--text))]">
                    Drop CSV file here or <span className="text-[rgb(var(--primary))] underline underline-offset-2">browse</span>
                  </p>
                  <p className="text-xs text-[rgb(var(--muted))] mt-1">
                    Required headers: <span className="font-mono">{activeEntityOption.hint}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* upload button */}
          <div className="flex justify-end">
            <button
              onClick={openReviewDialog}
              disabled={!singleFile || loading}
              className="rt-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><FileSpreadsheet size={14} /> Review And Import {activeEntityOption.label}</>}
            </button>
          </div>
        </div>
      ) : null}

      {/* ═══════ BULK MODE ═══════ */}
      {mode === "bulk" ? (
        <div className="rt-panel p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-lg p-2.5 bg-purple-500/10 text-purple-500">
              <Database size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-semibold text-[rgb(var(--text))]">Bulk Import</h3>
              <p className="text-xs text-[rgb(var(--muted))] mt-0.5">Upload multiple CSV files at once — one per entity</p>
            </div>
          </div>

          <div className="space-y-3">
            {BULK_FIELDS.map(({ field, label }) => {
              const file = bulkFiles[field];
              return (
                <div
                  key={field}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    file
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[rgb(var(--text))]">{label}</div>
                    {file ? (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                        {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <div className="text-[11px] text-[rgb(var(--muted))] mt-0.5">No file selected</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {file ? (
                      <button
                        onClick={() => removeBulkFile(field)}
                        className="p-1.5 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                    <label className="rt-btn-ghost rt-btn-sm cursor-pointer">
                      <FileSpreadsheet size={14} />
                      Choose
                      <input
                        ref={(el) => { bulkInputRefs.current[field] = el; }}
                        type="file"
                        accept=".csv"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { setBulkFiles((prev) => ({ ...prev, [field]: f })); setResult(null); }
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-[rgb(var(--muted))]">
              {bulkFileCount} file{bulkFileCount !== 1 ? "s" : ""} selected
            </p>
            <button
              onClick={openReviewDialog}
              disabled={bulkFileCount === 0 || loading}
              className="rt-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Review And Import All</>}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── import history ── */}
      {history.length > 0 ? (
        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h3 className="rt-section-title">Import History</h3>
              <p className="rt-section-subtitle">Recent import operations this session</p>
            </div>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {history.map((entry, idx) => (
              <div key={`hist-${idx}`} className="rt-panel-subtle p-3 flex items-center gap-3">
                {entry.status === "success"
                  ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                  : <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-[rgb(var(--text))]">{entry.entity}</span>
                  <span className="text-xs text-[rgb(var(--muted))] ml-2">{entry.message}</span>
                </div>
                <span className="text-[10px] text-[rgb(var(--muted))] font-mono flex-shrink-0">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ModalOverlay
        open={reviewOpen}
        onClose={loading ? undefined : closeReviewDialog}
        maxWidth="max-w-4xl"
        header={(
          <div>
            <p className="rt-kicker">Final Review</p>
            <h3 className="rt-section-title mt-1">Confirm Data Before Import</h3>
            <p className="text-xs text-[rgb(var(--muted))] mt-1">
              Validate the mapped datasets and update any file before saving to the database.
            </p>
          </div>
        )}
      >
        <div className="space-y-3">
          {reviewRows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[rgb(var(--text))]">{row.label}</p>
                  <p className="text-[11px] text-[rgb(var(--muted))] mt-0.5">{row.hint}</p>
                  {row.file ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 break-all">
                      {row.file.name} ({formatFileSize(row.file)})
                    </p>
                  ) : (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">No file attached</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="rt-btn-ghost rt-btn-sm cursor-pointer">
                    <FileSpreadsheet size={14} />
                    Replace
                    <input
                      ref={(el) => { reviewInputRefs.current[row.id] = el; }}
                      type="file"
                      accept=".csv"
                      className="sr-only"
                      onChange={(e) => {
                        const nextFile = e.target.files?.[0];
                        if (nextFile) updateReviewRowFile(row.id, nextFile);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeReviewRow(row.id)}
                    className="rt-btn-ghost rt-btn-sm text-red-600 dark:text-red-400"
                  >
                    <X size={14} />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-[rgb(var(--muted))]">
            {reviewRows.filter((row) => row.file instanceof File).length} file{reviewRows.filter((row) => row.file instanceof File).length !== 1 ? "s" : ""} ready for import
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeReviewDialog}
              disabled={loading}
              className="rt-btn-ghost rt-btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReviewedImport}
              disabled={!canConfirmReview || loading}
              className="rt-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Database size={14} /> Confirm Import</>}
            </button>
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}
