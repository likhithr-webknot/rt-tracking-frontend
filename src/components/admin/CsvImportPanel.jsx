import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
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

/* ───── component ───── */

export default function CsvImportPanel({ onImportComplete, showToast }) {
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [selectedEntity, setSelectedEntity] = useState("employees");
  const [singleFile, setSingleFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState({}); // { field: File }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: "success" | "error", message: string }
  const [history, setHistory] = useState([]); // [{ ts, entity, status, message }]
  const singleInputRef = useRef(null);
  const bulkInputRefs = useRef({});

  const clearResult = useCallback(() => setResult(null), []);

  /* ── single import ── */
  async function handleSingleImport() {
    if (!singleFile || loading) return;
    setLoading(true);
    setResult(null);
    const entity = selectedEntity;
    try {
      const res = await importCsvSingle(entity, singleFile);
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
  async function handleBulkImport() {
    const entries = Object.entries(bulkFiles).filter(([, f]) => f instanceof File);
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

  function removeBulkFile(field) {
    setBulkFiles((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (bulkInputRefs.current[field]) bulkInputRefs.current[field].value = "";
  }

  const bulkFileCount = Object.values(bulkFiles).filter((f) => f instanceof File).length;
  const activeEntityOption = ENTITY_OPTIONS.find((e) => e.key === selectedEntity) || ENTITY_OPTIONS[0];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── header ── */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="rt-title">CSV Import</h2>
          <p className="text-sm text-[rgb(var(--muted))] mt-1">
            Upload CSV files to populate or update system data.
          </p>
        </div>
      </header>

      {/* ── mode toggle ── */}
      <div className="flex gap-2">
        <button
          onClick={() => { setMode("single"); setResult(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === "single"
              ? "bg-[rgb(var(--primary))] text-white"
              : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
          }`}
        >
          <FileUp size={14} className="inline mr-1.5 -mt-0.5" />
          Single Entity
        </button>
        <button
          onClick={() => { setMode("bulk"); setResult(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === "bulk"
              ? "bg-[rgb(var(--primary))] text-white"
              : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
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
              onClick={handleSingleImport}
              disabled={!singleFile || loading}
              className="rt-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import {activeEntityOption.label}</>}
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
              onClick={handleBulkImport}
              disabled={bulkFileCount === 0 || loading}
              className="rt-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import All</>}
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
    </div>
  );
}
