// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Eye,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  importCsvSingle,
  importCsvBulk,
  CSV_ENTITY_MAP,
  CSV_BULK_FIELD_MAP,
  CSV_BULK_FIELD_TO_ENTITY,
} from "../../api/csv-import";
import {
  CSV_ENTITY_SCHEMAS,
  normalizeCsvTextForEntity,
  parseCsvRecords,
  validateEmployeesCsvRecords,
} from "../../utils/csvImportNormalize";
import ModalOverlay from "../shared/ModalOverlay";

const ENTITY_ICONS = {
  employees: Users,
  bands: Layers,
  streams: Layers,
  "webknot-values": Sparkles,
  "kpi-definitions": Target,
  certifications: Award,
  "designation-lookups": BookOpen,
  "monthly-submissions": FileSpreadsheet,
};

const ENTITY_COLORS = {
  employees: "text-blue-500",
  bands: "text-blue-500",
  streams: "text-emerald-500",
  "webknot-values": "text-amber-500",
  "kpi-definitions": "text-rose-500",
  certifications: "text-teal-500",
  "designation-lookups": "text-blue-500",
  "monthly-submissions": "text-cyan-500",
};

function schemaHint(entityKey) {
  const schema = CSV_ENTITY_SCHEMAS[entityKey];
  if (!schema) return "";
  const cols = Object.keys(schema.columns || {});
  return cols.join(", ");
}

/* ───── entity config (aligned with public/sample-csv/*.csv) ───── */
const ENTITY_OPTIONS = Object.keys(CSV_ENTITY_SCHEMAS)
  .filter((key) => CSV_ENTITY_MAP[key])
  .map((key) => ({
    key,
    label: CSV_ENTITY_SCHEMAS[key].label,
    icon: ENTITY_ICONS[key] || FileSpreadsheet,
    hint: schemaHint(key),
    samplePath: CSV_ENTITY_SCHEMAS[key].samplePath,
    color: ENTITY_COLORS[key] || "text-[rgb(var(--primary))]",
  }));

const BULK_FIELDS = Object.entries(CSV_BULK_FIELD_MAP).map(([entityKey, field]) => ({
  field,
  entityKey,
  label: CSV_ENTITY_SCHEMAS[entityKey]?.label || field,
  samplePath: CSV_ENTITY_SCHEMAS[entityKey]?.samplePath,
}));

const BULK_LABEL_BY_FIELD = Object.fromEntries(BULK_FIELDS.map((item) => [item.field, item.label]));

function formatFileSize(file) {
  if (!(file instanceof File)) return "0 KB";
  return `${(file.size / 1024).toFixed(1)} KB`;
}

const MAX_PREVIEW_DATA_ROWS = 30;
const MAX_PREVIEW_COLS = 40;
/** Hard caps when “show all” is on — avoids freezing the tab on accidental multi‑MB pastes. */
const FULL_PREVIEW_MAX_ROWS = 200000;
const FULL_PREVIEW_MAX_COLS = 512;
const PREVIEW_CELL_MAX = 240;
const FULL_PREVIEW_CELL_MAX = 8000;

/**
 * Split into lines and parse each for a table preview (multiline quoted fields are not supported).
 * @param {object} options
 * @param {number} options.maxDataRows — max body rows (excluding header); use large value for “full” mode
 * @param {number} options.maxCols
 * @param {number} options.cellMax — max characters per cell before ellipsis
 */
function parseCsvPreview(
  text,
  { maxDataRows = MAX_PREVIEW_DATA_ROWS, maxCols = MAX_PREVIEW_COLS, cellMax = PREVIEW_CELL_MAX, entityKey = null } = {} as ApiOptions,
) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parsed = entityKey ? normalizeCsvTextForEntity(entityKey, raw).records : parseCsvRecords(raw);
  const approxTotalLines = parsed.length;
  const maxBody = Number.isFinite(maxDataRows) && maxDataRows > 0 ? Math.floor(maxDataRows) : MAX_PREVIEW_DATA_ROWS;
  const lineLimit = Math.min(parsed.length, maxBody + 1);
  const selected = parsed.slice(0, lineLimit);
  const rows = selected.map((line) =>
    line.map((c) => {
      const s = String(c);
      return s.length > cellMax ? `${s.slice(0, cellMax)}…` : s;
    }).slice(0, maxCols),
  );
  const truncated = parsed.length > lineLimit;
  const firstFull = parsed[0] || [];
  const extraCols = firstFull.length > maxCols;
  const normMeta = entityKey ? normalizeCsvTextForEntity(entityKey, raw) : null;
  let validationErrors = [];
  let validationWarnings = [];
  if (entityKey === "employees" && normMeta?.records?.length) {
    const v = validateEmployeesCsvRecords(normMeta.records);
    validationErrors = v.errors || [];
    validationWarnings = v.warnings || [];
  }
  const missingRequired = normMeta?.missingRequired || [];
  return {
    rows,
    truncated,
    approxTotalLines,
    extraCols,
    columnCap: maxCols,
    rowLimit: lineLimit,
    totalNonEmptyLines: approxTotalLines,
    warnings: [...(normMeta?.warnings || []), ...validationWarnings],
    missingRequired,
    validationErrors,
    importBlocked: missingRequired.length > 0 || validationErrors.length > 0,
  };
}

function CsvPreviewTable({
  rows,
  truncated,
  approxTotalLines,
  extraCols,
  columnCap = MAX_PREVIEW_COLS,
  fullMode = false,
  onToggleFull = null,
  emptyMessage = "No rows to preview.",
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="text-xs text-[rgb(var(--muted))] py-2">{emptyMessage}</p>;
  }
  const header = rows[0];
  const body = rows.slice(1);
  const dataRowsShown = body.length;
  const approxDataLines = approxTotalLines > 0 ? Math.max(0, approxTotalLines - 1) : 0;
  const likelyMoreRows = approxDataLines > dataRowsShown;
  const showFullToggle = typeof onToggleFull === "function" && (truncated || extraCols || likelyMoreRows || fullMode);
  return (
    <div className="mt-3 space-y-2">
      {showFullToggle ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-[11px] font-semibold text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]"
            onClick={onToggleFull}
          >
            {fullMode ? (
              <>
                <Minimize2 size={14} className="text-[rgb(var(--muted))]" />
                Compact preview
              </>
            ) : (
              <>
                <Maximize2 size={14} className="text-[rgb(var(--primary))]" />
                Show entire file (up to {FULL_PREVIEW_MAX_ROWS.toLocaleString()} rows, {FULL_PREVIEW_MAX_COLS} cols)
              </>
            )}
          </button>
        </div>
      ) : null}
      <div
        className={`overflow-auto rounded-lg border border-[rgb(var(--border))] ${
          fullMode ? "max-h-[min(85vh,1400px)]" : "max-h-[min(320px,40vh)]"
        }`}
      >
        <table className="w-full text-left text-[11px] border-collapse min-w-max">
          <thead className="sticky top-0 z-[1] bg-[rgb(var(--surface-2))] border-b border-[rgb(var(--border))]">
            <tr>
              {header.map((h, i) => (
                <th
                  key={`h-${i}`}
                  className={
                    fullMode
                      ? "py-2 px-2 font-semibold text-[rgb(var(--text))] align-top max-w-[min(24rem,40vw)] break-words"
                      : "py-2 px-2 font-semibold text-[rgb(var(--text))] whitespace-nowrap max-w-[14rem] truncate"
                  }
                  title={h}
                >
                  {h || `Column ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {body.map((r, ri) => {
              const padded = [...r];
              while (padded.length < header.length) padded.push("");
              return (
                <tr key={`r-${ri}`} className="hover:bg-[rgb(var(--surface))]/80">
                  {header.map((_, ci) => (
                    <td
                      key={`c-${ri}-${ci}`}
                      className={
                        fullMode
                          ? "py-1.5 px-2 text-[rgb(var(--muted))] align-top break-words whitespace-pre-wrap max-w-[min(36rem,55vw)]"
                          : "py-1.5 px-2 text-[rgb(var(--muted))] max-w-[14rem] truncate align-top"
                      }
                      title={padded[ci] ?? ""}
                    >
                      {padded[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[rgb(var(--muted))] flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Showing <span className="font-mono text-[rgb(var(--text))]">{dataRowsShown}</span> data row{dataRowsShown !== 1 ? "s" : ""}
          {approxTotalLines ? (
            <>
              {" "}
              · file <span className="font-mono">{approxTotalLines}</span> non-empty line{approxTotalLines !== 1 ? "s" : ""}{" "}
              (incl. header)
            </>
          ) : null}
        </span>
        {truncated ? (
          <span className="text-amber-600 dark:text-amber-400">
            {fullMode
              ? `Preview capped at ${FULL_PREVIEW_MAX_ROWS.toLocaleString()} rows for browser safety.`
              : "More rows exist — use “Show entire file” for the full capped preview."}
          </span>
        ) : null}
        {extraCols ? (
          <span className="text-amber-600 dark:text-amber-400">First {columnCap} columns — use “Show entire file” for all (up to {FULL_PREVIEW_MAX_COLS}).</span>
        ) : null}
      </p>
    </div>
  );
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
  const [singlePreview, setSinglePreview] = useState(null);
  const [singlePreviewLoading, setSinglePreviewLoading] = useState(false);
  const [bulkPreviews, setBulkPreviews] = useState({});
  /** `single` or `bulk:field` → full capped preview (rows/cols) */
  const [fullViewByPreviewKey, setFullViewByPreviewKey] = useState({});
  const singleInputRef = useRef(null);
  const bulkInputRefs = useRef({});
  const reviewInputRefs = useRef({});

  const clearResult = useCallback(() => setResult(null), []);
  const activeEntityOption = ENTITY_OPTIONS.find((e) => e.key === selectedEntity) || ENTITY_OPTIONS[0];
  const bulkFileCount = Object.values(bulkFiles).filter((f) => f instanceof File).length;
  const totalSelectedFiles = mode === "single" ? (singleFile ? 1 : 0) : bulkFileCount;

  const reviewRows = useMemo(() => reviewPayload?.rows || [], [reviewPayload]);
  const canConfirmReview = reviewRows.some((row) => row.file instanceof File);

  useEffect(() => {
    setFullViewByPreviewKey((prev) => {
      const next = { ...prev };
      delete next.single;
      return next;
    });
  }, [singleFile]);

  useEffect(() => {
    setFullViewByPreviewKey((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith("bulk:")) delete next[k];
      }
      return next;
    });
  }, [bulkFiles]);

  useEffect(() => {
    if (!(singleFile instanceof File)) {
      setSinglePreview(null);
      setSinglePreviewLoading(false);
      return undefined;
    }
    let cancelled = false;
    setSinglePreviewLoading(true);
    setSinglePreview(null);
    singleFile
      .text()
      .then((t) => {
        if (cancelled) return;
        try {
          const full = Boolean(fullViewByPreviewKey.single);
          setSinglePreview({
            ...parseCsvPreview(
              t,
              full
                ? {
                    maxDataRows: FULL_PREVIEW_MAX_ROWS,
                    maxCols: FULL_PREVIEW_MAX_COLS,
                    cellMax: FULL_PREVIEW_CELL_MAX,
                    entityKey: selectedEntity,
                  }
                : { entityKey: selectedEntity },
            ),
            error: "",
          });
        } catch (e) {
          setSinglePreview({
            rows: [],
            truncated: false,
            approxTotalLines: 0,
            extraCols: false,
            columnCap: MAX_PREVIEW_COLS,
            error: e?.message || "Could not parse CSV.",
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setSinglePreview({
          rows: [],
          truncated: false,
          approxTotalLines: 0,
          extraCols: false,
          columnCap: MAX_PREVIEW_COLS,
          error: e?.message || "Could not read file.",
        });
      })
      .finally(() => {
        if (!cancelled) setSinglePreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [singleFile, fullViewByPreviewKey.single, selectedEntity]);

  useEffect(() => {
    const entries = Object.entries(bulkFiles).filter(([, f]) => f instanceof File);
    if (!entries.length) {
      setBulkPreviews({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      entries.map(([field, f]) =>
        f.text().then((text) => {
          try {
            const full = Boolean(fullViewByPreviewKey[`bulk:${field}`]);
            const entityKey = CSV_BULK_FIELD_TO_ENTITY[field] || field;
            return [
              field,
              {
                ...parseCsvPreview(
                  text,
                  full
                    ? {
                        maxDataRows: FULL_PREVIEW_MAX_ROWS,
                        maxCols: FULL_PREVIEW_MAX_COLS,
                        cellMax: FULL_PREVIEW_CELL_MAX,
                        entityKey,
                      }
                    : { entityKey },
                ),
                error: "",
              },
            ];
          } catch (e) {
            return [
              field,
              {
                rows: [],
                truncated: false,
                approxTotalLines: 0,
                extraCols: false,
                columnCap: MAX_PREVIEW_COLS,
                error: e?.message || "Could not parse CSV.",
              },
            ];
          }
        }),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setBulkPreviews(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [bulkFiles, fullViewByPreviewKey]);

  /* ── single import ── */
  async function handleSingleImport(fileToImport = singleFile, entityToImport = selectedEntity) {
    if (!fileToImport || loading) return;
    setLoading(true);
    setResult(null);
    const entity = entityToImport;
    try {
      const res = await importCsvSingle(entity, fileToImport);
      const warnNote =
        Array.isArray(res?.warnings) && res.warnings.length
          ? ` ${res.warnings.join(" ")}`
          : "";
      const msg = (res?.message || `Successfully imported ${entity}.`) + warnNote;
      setResult({ type: "success", message: msg.trim() });
      setHistory((h) => [{ ts: Date.now(), entity, status: "success", message: msg }, ...h].slice(0, 20));
      setSingleFile(null);
      if (singleInputRef.current) singleInputRef.current.value = "";
      onImportComplete?.();
      showToast?.({ title: "Import Successful", message: msg, tone: "success" });
    } catch (err) {
      const pathNote = err?.path ? ` Endpoint: ${err.path}.` : "";
      const hint =
        err?.status >= 500 && entity === "employees"
          ? " Import bands, departments, and designation lookups first; each row must use band/department/designation values that already exist (see sample CSV)."
          : "";
      const msg = `${err?.message || "Import failed."}${pathNote}${hint}`;
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
        <div className="absolute -bottom-20 -left-12 w-52 h-52 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <h2 className="rt-title">CSV Import</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-1">
              Review datasets before writing them into the database.
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
                      {opt.samplePath ? (
                        <a
                          href={opt.samplePath}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-block text-[10px] font-semibold text-[rgb(var(--primary))] hover:underline"
                        >
                          Download template
                        </a>
                      ) : null}
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

          {singleFile ? (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
                <Eye size={16} className="text-[rgb(var(--primary))] shrink-0" />
                File preview
              </div>
              <p className="text-[10px] text-[rgb(var(--muted))] mt-1">
                First row is treated as the header. Very large files are partially read in the browser for this preview only.
              </p>
              {singlePreviewLoading ? (
                <div className="flex items-center gap-2 mt-4 text-xs text-[rgb(var(--muted))]">
                  <Loader2 size={14} className="animate-spin shrink-0" />
                  Reading CSV…
                </div>
              ) : singlePreview?.error ? (
                <p className="text-xs text-red-600 dark:text-red-400 mt-3">{singlePreview.error}</p>
              ) : (
                <>
                {singlePreview?.missingRequired?.length ? (
                  <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    {singlePreview.warnings?.[0] ||
                      `Missing required columns: ${singlePreview.missingRequired.join(", ")}`}
                  </div>
                ) : singlePreview?.validationErrors?.length ? (
                  <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200 space-y-1">
                    {singlePreview.validationErrors.slice(0, 8).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    {singlePreview.validationErrors.length > 8 ? (
                      <p>…and {singlePreview.validationErrors.length - 8} more.</p>
                    ) : null}
                  </div>
                ) : singlePreview?.warnings?.length ? (
                  <div className="mt-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-xs text-[rgb(var(--muted))]">
                    {singlePreview.warnings.join(" ")}
                  </div>
                ) : null}
                <CsvPreviewTable
                  rows={singlePreview?.rows}
                  truncated={singlePreview?.truncated}
                  approxTotalLines={singlePreview?.approxTotalLines}
                  extraCols={singlePreview?.extraCols}
                  columnCap={singlePreview?.columnCap ?? MAX_PREVIEW_COLS}
                  fullMode={Boolean(fullViewByPreviewKey.single)}
                  onToggleFull={() =>
                    setFullViewByPreviewKey((p) => ({ ...p, single: !p.single }))
                  }
                />
                </>
              )}
            </div>
          ) : null}

          {/* upload button */}
          <div className="flex justify-end">
            <button
              onClick={openReviewDialog}
              disabled={
                !singleFile ||
                loading ||
                singlePreview?.importBlocked
              }
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
            <div className="rounded-lg p-2.5 bg-blue-500/10 text-blue-500">
              <Database size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-semibold text-[rgb(var(--text))]">Bulk Import</h3>
              <p className="text-xs text-[rgb(var(--muted))] mt-0.5">Upload multiple CSV files at once — one per entity</p>
            </div>
          </div>

          <div className="space-y-3">
            {BULK_FIELDS.map(({ field, label, samplePath, entityKey }) => {
              const file = bulkFiles[field];
              const preview = bulkPreviews[field];
              return (
                <div
                  key={field}
                  className={`rounded-lg border p-3 transition-colors space-y-3 ${
                    file
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[rgb(var(--text))]">{label}</div>
                    <div className="text-[10px] text-[rgb(var(--muted))] font-mono mt-0.5 truncate">
                      {schemaHint(entityKey)}
                    </div>
                    {samplePath ? (
                      <a
                        href={samplePath}
                        download
                        className="mt-1 inline-block text-[10px] font-semibold text-[rgb(var(--primary))] hover:underline"
                      >
                        Download template
                      </a>
                    ) : null}
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
                  {file ? (
                    <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 pt-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[rgb(var(--text))] mb-1">
                        <Eye size={12} className="text-[rgb(var(--primary))]" />
                        Preview
                      </div>
                      {!bulkPreviews[field] ? (
                        <div className="flex items-center gap-2 text-[11px] text-[rgb(var(--muted))] py-2">
                          <Loader2 size={12} className="animate-spin" />
                          Reading…
                        </div>
                      ) : preview?.error ? (
                        <p className="text-[11px] text-red-600 dark:text-red-400">{preview.error}</p>
                      ) : (
                        <>
                          {preview?.missingRequired?.length ? (
                            <div className="mb-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                              {preview.warnings?.[0] ||
                                `Missing required columns: ${preview.missingRequired.join(", ")}`}
                            </div>
                          ) : null}
                          <CsvPreviewTable
                            rows={preview.rows}
                            truncated={preview.truncated}
                            approxTotalLines={preview.approxTotalLines}
                            extraCols={preview.extraCols}
                            columnCap={preview.columnCap ?? MAX_PREVIEW_COLS}
                            fullMode={Boolean(fullViewByPreviewKey[`bulk:${field}`])}
                            onToggleFull={() =>
                              setFullViewByPreviewKey((p) => ({
                                ...p,
                                [`bulk:${field}`]: !p[`bulk:${field}`],
                              }))
                            }
                          />
                        </>
                      )}
                    </div>
                  ) : null}
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
        maxWidth="max-w-5xl"
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

                  {row.file ? (
                    <div className="mt-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[rgb(var(--text))] mb-1">
                        <Eye size={12} className="text-[rgb(var(--primary))]" />
                        Preview
                      </div>
                      {(() => {
                        const pv = row.id === "single" ? singlePreview : bulkPreviews[row.field];
                        if (!pv && (row.id === "single" ? singlePreviewLoading : !bulkPreviews[row.field])) {
                          return (
                            <div className="flex items-center gap-2 text-[11px] text-[rgb(var(--muted))] py-2">
                              <Loader2 size={12} className="animate-spin" />
                              Reading…
                            </div>
                          );
                        }
                        if (pv?.error) {
                          return <p className="text-[11px] text-red-600 dark:text-red-400">{pv.error}</p>;
                        }
                        if (pv) {
                          const previewKey =
                            row.id === "single" ? "single" : `bulk:${row.field}`;
                          return (
                            <CsvPreviewTable
                              rows={pv.rows}
                              truncated={pv.truncated}
                              approxTotalLines={pv.approxTotalLines}
                              extraCols={pv.extraCols}
                              columnCap={pv.columnCap ?? MAX_PREVIEW_COLS}
                              fullMode={Boolean(fullViewByPreviewKey[previewKey])}
                              onToggleFull={() =>
                                setFullViewByPreviewKey((p) => ({
                                  ...p,
                                  [previewKey]: !p[previewKey],
                                }))
                              }
                            />
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ) : null}
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
