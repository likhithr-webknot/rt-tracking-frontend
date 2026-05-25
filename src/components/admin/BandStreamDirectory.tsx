import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Eye, EyeOff, Plus, RefreshCw, Trash2, X } from "lucide-react";
import SearchField from "../shared/SearchField";
import { STANDARD_BAND_CODES } from "../../utils/directoryCatalog";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import { exportBandsCsv, exportDepartmentsCsv } from "../../utils/entityCsvExport";
import Toast from "../shared/Toast";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import {
  addBand,
  addStream,
  deleteBandOrDeactivate,
  deleteStream,
  fetchBands,
  fetchStreams,
  normalizeDirectoryPage,
  updateBand,
  updateStream,
} from "../../api/band-stream-directory";
import type { BandPayload, DirectoryRow } from "../../api/band-stream-directory";
import { queryKeys } from "../../hooks/queries";

const BAND_STREAM_DIRECTORY_QUERY_KEY = queryKeys.bandStreamDirectory.all;

const BAND_CODES = STANDARD_BAND_CODES;
const BAND_TYPE_OPTIONS = ["BOTH", "TECH", "NON_TECH"] as const;

type RowKind = "band" | "stream";
type EditorMode = "add" | "edit";

interface EditorState {
  open: boolean;
  mode: EditorMode;
  type: RowKind;
  originalCode: string;
  originalId: string;
  originalLabel: string;
  originalBandType: string;
  code: string;
  label: string;
  active: boolean;
  bandType: string;
  sortOrder: string;
}

const CLOSED_EDITOR: EditorState = {
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
};

type ToastPayload = { title: string; message?: string; tone?: string };

type PendingDelete = { type: RowKind; row: DirectoryRow } | null;

function messageFromUnknown(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return "failed to load";
}

function titleFor(type: RowKind) {
  return type === "band" ? "Band" : "Stream";
}

function fallbackLabel(type: RowKind, code: string) {
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

async function collectDirectoryPageRows(
  fetchPage: (cursor: string | null) => Promise<unknown>
): Promise<DirectoryRow[]> {
  const rows: DirectoryRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 30; i += 1) {
    const data = await fetchPage(cursor);
    const page = normalizeDirectoryPage(data);
    rows.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const byCode = new Map<string, DirectoryRow>();
  for (const row of rows) {
    const key = String(row.code || "").trim();
    if (!key) continue;
    const prev = byCode.get(key);
    if (!prev) {
      byCode.set(key, row);
      continue;
    }
    const prevId = String(prev.id ?? "").trim();
    const nextId = String(row.id ?? "").trim();
    if (nextId && !prevId) byCode.set(key, row);
  }
  return Array.from(byCode.values());
}

async function fetchBandStreamDirectoryData(): Promise<{
  bands: DirectoryRow[];
  streams: DirectoryRow[];
  loadErrors: string[];
}> {
  const [bandResult, streamResult] = await Promise.allSettled([
    collectDirectoryPageRows((c) => fetchBands({ limit: 100, cursor: c, search: null })),
    collectDirectoryPageRows((c) => fetchStreams({ limit: 100, cursor: c, search: null, activeOnly: null })),
  ]);
  const loadErrors: string[] = [];
  const bands = bandResult.status === "fulfilled" ? bandResult.value : [];
  const streams = streamResult.status === "fulfilled" ? streamResult.value : [];
  if (bandResult.status === "rejected") {
    loadErrors.push(`Bands: ${messageFromUnknown(bandResult.reason)}`);
  }
  if (streamResult.status === "rejected") {
    loadErrors.push(`Streams: ${messageFromUnknown(streamResult.reason)}`);
  }
  return { bands, streams, loadErrors };
}

export default function BandStreamDirectory() {
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({
    queryKey: BAND_STREAM_DIRECTORY_QUERY_KEY,
    queryFn: fetchBandStreamDirectoryData,
  });

  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editor, setEditor] = useState<EditorState>(CLOSED_EDITOR);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const bands = directoryQuery.data?.bands ?? [];
  const streams = directoryQuery.data?.streams ?? [];
  const directoryLoadError = directoryQuery.data?.loadErrors?.length
    ? directoryQuery.data.loadErrors.join(" | ")
    : "";
  const loading = directoryQuery.isFetching;

  const showToast = useCallback((nextToast: ToastPayload) => {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const refetchDirectory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: BAND_STREAM_DIRECTORY_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    if (!directoryQuery.isFetched) return;
    const errs = directoryQuery.data?.loadErrors;
    if (!errs?.length) return;
    showToast({
      title: "Directory load failed",
      message: errs.join(" | "),
      tone: "error",
    });
  }, [directoryQuery.isFetched, directoryQuery.data?.loadErrors, showToast]);

  const q = String(query || "").trim().toLowerCase();
  const filteredBands = useMemo(() => {
    if (!q) return bands;
    return bands.filter(
      (row) =>
        String(row.code || "").toLowerCase().includes(q) || String(row.label || "").toLowerCase().includes(q)
    );
  }, [bands, q]);

  const filteredStreams = useMemo(() => {
    if (!q) return streams;
    return streams.filter(
      (row) =>
        String(row.code || "").toLowerCase().includes(q) || String(row.label || "").toLowerCase().includes(q)
    );
  }, [streams, q]);

  const missingBandCodes = useMemo(() => {
    const existing = new Set(bands.map((x) => String(x.code || "").trim()));
    return BAND_CODES.filter((code) => !existing.has(code));
  }, [bands]);

  const streamCodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const row of streams) {
      const code = String(row.code || "").trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      options.push(code);
    }
    return options.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [streams]);

  function openAdd(type: RowKind) {
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

  function openEdit(type: RowKind, row: DirectoryRow) {
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
        row.sortOrder == null || Number.isNaN(Number(row.sortOrder)) ? "" : String(row.sortOrder),
    });
  }

  function closeEditor() {
    if (saving) return;
    setEditor(CLOSED_EDITOR);
  }

  function bandRowHasRestId(row: Pick<DirectoryRow, "id">) {
    const id = String(row?.id ?? "").trim();
    return /^\d+$/.test(id);
  }

  function bandCanDelete(row: Pick<DirectoryRow, "id" | "code">) {
    if (bandRowHasRestId(row)) return true;
    return Boolean(String(row?.code ?? "").trim());
  }

  async function submitEditor(e: React.FormEvent) {
    e.preventDefault();
    const type: RowKind = editor.type === "stream" ? "stream" : "band";
    const code = String(editor.code || "").trim();
    const originalCode = String(editor.originalCode || "").trim();
    const originalId = String(editor.originalId || "").trim();
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
      const keyOf = (value: string) => String(value || "").trim().toUpperCase();
      const codeKey = keyOf(code);
      const originalCodeKey = keyOf(originalCode);
      const duplicate = (type === "band" ? bands : streams).some((row) => {
        const rowCodeKey = keyOf(String(row?.code || ""));
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
      const payload: BandPayload = {
        code,
        label,
        name: label,
        designation: label,
        ...(type === "stream" ? { active: Boolean(editor.active) } : {}),
        bandType: String(editor.bandType || "BOTH").trim().toUpperCase() || "BOTH",
        sortOrder: sortOrder === "" ? null : Number.parseInt(sortOrder, 10),
      };

      if (type === "band") {
        if (editor.mode === "add") {
          await addBand({
            name: code,
            designation: label,
            bandType: payload.bandType,
          });
        } else {
          if (!bandRowHasRestId({ id: originalId })) {
            throw new Error("This band has no server id — refresh the list and try again.");
          }
          await updateBand(originalId, {
            id: originalId,
            bandId: originalId,
            name: label,
            designation: label,
            bandType: payload.bandType,
          });
        }
      } else if (editor.mode === "add") {
        await addStream({ name: label || code });
      } else {
        const streamPayload: BandPayload = { name: label, label };
        if (bandRowHasRestId({ id: originalId })) {
          const rid = String(originalId).trim();
          streamPayload.id = rid;
          streamPayload.departmentId = rid;
          streamPayload.streamId = rid;
        }
        const streamKey = bandRowHasRestId({ id: originalId })
          ? originalId
          : String(originalCode || code).trim();
        await updateStream(streamKey, streamPayload);
      }

      await refetchDirectory();
      showToast({
        title: editor.mode === "add" ? `${titleFor(type)} added` : `${titleFor(type)} updated`,
        message: code,
      });
      closeEditor();
    } catch (err) {
      const message = String(err instanceof Error ? err.message : "Failed to save changes.").trim();
      const duplicateMatch = /already exists with name:\s*([A-Za-z0-9_-]+)/i.exec(message);
      if (duplicateMatch) {
        await refetchDirectory().catch(() => {
          void 0;
        });
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

  async function toggleStreamActive(row: DirectoryRow) {
    const key = bandRowHasRestId(row) ? String(row.id).trim() : String(row.code || "").trim();
    if (!key) return;
    try {
      await updateStream(key, {
        active: !row.active,
        ...(bandRowHasRestId(row)
          ? {
              id: String(row.id).trim(),
              departmentId: String(row.id).trim(),
              streamId: String(row.id).trim(),
            }
          : {}),
      });
      await refetchDirectory();
    } catch (err) {
      showToast({
        title: "Update failed",
        message: err instanceof Error ? err.message : "Please try again.",
        tone: "error",
      });
    }
  }

  function requestDeleteBand(row: DirectoryRow) {
    if (!bandCanDelete(row)) {
      showToast({
        title: "Cannot delete band",
        message: "Band code is missing. Refresh the directory and try again.",
        tone: "error",
      });
      return;
    }
    setPendingDelete({ type: "band", row });
  }

  async function onConfirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      const type: RowKind = target.type === "stream" ? "stream" : "band";
      const code = String(target.row.code || "").trim();
      if (type === "band") {
        if (!bandCanDelete(target.row)) {
          showToast({
            title: "Cannot delete",
            message: "Band code is missing.",
            tone: "error",
          });
          return;
        }
        const outcome = await deleteBandOrDeactivate(target.row as unknown as Record<string, unknown>);
        if (outcome.hardDeleted) {
          showToast({ title: "Band deleted", message: code });
        } else {
          showToast({
            title: "Band deactivated",
            message: "Employees still reference this band, so it was hidden instead of removed.",
            tone: "warning",
          });
        }
      } else {
        await deleteStream(target.row as unknown as Record<string, unknown>);
        showToast({ title: "Department deleted", message: code });
      }
      await refetchDirectory();
      setPendingDelete(null);
    } catch (err) {
      showToast({
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  const activeStreams = streams.filter((x) => x.active).length;

  return (
    <AdminPageShell className="space-y-6 animate-in fade-in duration-300">
      {directoryLoadError ? (
        <div className="rt-panel-subtle px-4 py-3 text-sm text-amber-900 dark:text-amber-100" role="status">
          <div className="font-semibold">Directory could not be loaded</div>
          <p className="mt-1 text-xs whitespace-pre-wrap opacity-90">{directoryLoadError}</p>
        </div>
      ) : null}

      <AdminPageHeader
        title="Bands & Departments"
        subtitle="Canonical bands and departments for KPIs, employees, and designations."
      >
        <div className="flex flex-wrap gap-2">
          <div className="rt-stat min-w-[7rem]">
            <div className="rt-field-label">Bands</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{bands.length}</div>
          </div>
          <div className="rt-stat min-w-[7rem]">
            <div className="rt-field-label">Departments</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{streams.length}</div>
            <div className="text-[11px] text-[rgb(var(--muted))]">{activeStreams} active</div>
          </div>
        </div>
      </AdminPageHeader>

      <div className="rt-toolbar-panel">
        <SearchField
          label="Find a band or department"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="Type a code or name, e.g. B4 or Developer"
          hint="Matches both tables below. Use Clear to show everything again."
        />
        {query.trim() ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[rgb(var(--muted))]">
            <span>
              Showing {filteredBands.length} band{filteredBands.length === 1 ? "" : "s"} and{" "}
              {filteredStreams.length} department{filteredStreams.length === 1 ? "" : "s"}
            </span>
            <button type="button" className="rt-btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setQuery("")}>
              Clear all
            </button>
          </div>
        ) : null}
        <div className="rt-toolbar-actions border-t border-[rgb(var(--border))] pt-4">
          <button
            type="button"
            onClick={() => refetchDirectory()}
            disabled={loading}
            className="rt-btn-secondary"
            title="Refresh lists"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <EntityCsvToolbar
            entityKey="bands"
            importLabel="Import bands"
            exportLabel="Export bands"
            replaceCatalog
            onExport={() => exportBandsCsv(bands)}
            onImportComplete={() => refetchDirectory()}
            confirmImportMessage="Replace all bands from CSV? Unused bands not assigned to anyone are removed."
            showToast={showToast}
          />
          <EntityCsvToolbar
            entityKey="streams"
            importLabel="Import depts"
            exportLabel="Export depts"
            replaceCatalog
            onExport={() => exportDepartmentsCsv(streams)}
            onImportComplete={() => refetchDirectory()}
            confirmImportMessage="Replace department list from CSV? Streams not in the file are deactivated."
            showToast={showToast}
          />
          <button onClick={() => openAdd("band")} className="rt-btn-primary" type="button">
            <Plus size={16} /> Add band
          </button>
          <button onClick={() => openAdd("stream")} className="rt-btn-soft" type="button">
            <Plus size={16} /> Add department
          </button>
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rt-panel min-w-0 flex flex-col max-h-[min(70vh,640px)] overflow-hidden">
          <div className="shrink-0 border-b border-[rgb(var(--border))] px-5 py-4">
            <h3 className="rt-section-title">Bands</h3>
            <p className="rt-section-subtitle">Employee level codes — scroll inside this panel.</p>
          </div>
          <div className="min-w-0 flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
                  {["Code", "Label", "Type", ""].map((h) => (
                    <th
                      key={h || "actions"}
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBands.map((row) => (
                  <tr key={`band:${row.id || row.code}`} className="rt-table-row-interactive">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[rgb(var(--text))]">{row.code}</td>
                    <td className="px-4 py-3 text-[rgb(var(--text))]">{row.label}</td>
                    <td className="px-4 py-3">
                      <span className="rt-badge rt-badge--primary uppercase">{String(row.bandType || "BOTH")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEdit("band", row)} className="rt-btn-ghost p-2" title="Edit">
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteBand(row)}
                          className="rt-btn-ghost p-2 text-red-500"
                          title="Delete or hide if in use"
                          disabled={!bandCanDelete(row)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredBands.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-[rgb(var(--muted))]">
                      No bands match your search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rt-panel min-w-0 flex flex-col max-h-[min(70vh,640px)] overflow-hidden">
          <div className="shrink-0 border-b border-[rgb(var(--border))] px-5 py-4">
            <h3 className="rt-section-title">Departments</h3>
            <p className="rt-section-subtitle">Department details — scroll inside this panel.</p>
          </div>
          <div className="min-w-0 flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
                  {["Code", "Label", "Status", ""].map((h) => (
                    <th
                      key={h || "actions"}
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStreams.map((row) => (
                  <tr key={`stream:${row.id || row.code}`} className="rt-table-row-interactive">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.code}</td>
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3">
                      <span className={row.active ? "rt-badge rt-badge--success uppercase" : "rt-badge rt-badge--neutral uppercase"}>
                        {row.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEdit("stream", row)} className="rt-btn-ghost p-2" title="Edit">
                          <Edit3 size={15} />
                        </button>
                        <button type="button" onClick={() => toggleStreamActive(row)} className="rt-btn-ghost p-2" title={row.active ? "Deactivate" : "Activate"}>
                          {row.active ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ type: "stream", row })}
                          className="rt-btn-ghost p-2 text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredStreams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-[rgb(var(--muted))]">
                      No departments match your search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ModalOverlay
        open={editor.open}
        onClose={closeEditor}
        maxWidth="max-w-lg"
        zIndex={110}
        title={editor.open ? (editor.mode === "add" ? `Add ${titleFor(editor.type)}` : `Edit ${titleFor(editor.type)}`) : ""}
        subtitle="Update directory metadata for UI and filtering."
        footer={
          editor.open ? (
            <>
              <button type="button" onClick={closeEditor} className="rt-btn-ghost">
                Cancel
              </button>
              <button type="submit" form="band-stream-editor-form" disabled={saving} className="rt-btn-primary">
                {saving ? "Saving…" : editor.mode === "add" ? "Add" : "Save Changes"}
              </button>
            </>
          ) : null
        }
      >
            <form id="band-stream-editor-form" onSubmit={submitEditor} className="space-y-4 -mt-1">
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
                      {(missingBandCodes.length ? missingBandCodes : [...BAND_CODES]).map((code) => (
                        <option key={`${editor.type}:option:${code}`} value={code}>
                          {code}
                        </option>
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
                      placeholder="e.g., Engineering"
                    />
                  )
                ) : (
                  <input
                    value={editor.code}
                    readOnly={editor.type === "band"}
                    onChange={(e) =>
                      editor.type === "band"
                        ? void 0
                        : setEditor((prev) => ({ ...prev, code: e.target.value }))
                    }
                    className={[
                      "mt-2 rt-input text-sm",
                      editor.type === "band" ? "opacity-70 cursor-not-allowed" : "",
                    ].join(" ")}
                    title={editor.type === "band" ? "Band code is fixed after creation" : undefined}
                  />
                )}
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Label *</label>
                <input
                  value={editor.label}
                  onChange={(e) => setEditor((prev) => ({ ...prev, label: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder={fallbackLabel(editor.type, editor.code)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Sort Order
                  </label>
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
                      {BAND_TYPE_OPTIONS.map((t) => (
                        <option key={`band-type:${t}`} value={t}>
                          {t}
                        </option>
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

            </form>
      </ModalOverlay>

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={`Delete ${titleFor(pendingDelete.type)}`}
          message={
            pendingDelete.type === "band"
              ? `Remove ${pendingDelete.row.code || "this band"} from the directory. If employees still use this band, the server will hide it instead of deleting the row.`
              : `This will remove ${pendingDelete.row.code || "this row"} from the directory.`
          }
          confirmText={deleting ? "Deleting..." : "Delete"}
          cancelText="Cancel"
          confirmVariant="danger"
          busy={deleting}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            if (deleting) return;
            setPendingDelete(null);
          }}
        />
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
