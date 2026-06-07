// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, Plus, Trash2 } from "lucide-react";
import SearchField from "../shared/SearchField";
import ListPaginationBar from "../shared/ListPaginationBar";
import { useClientPagination } from "../../hooks/useClientPagination";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import Toast from "../shared/Toast";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import {
  createDesignationLookup,
  deleteDesignationLookup,
  fetchAllDesignations,
  updateDesignationLookup,
} from "../../api/designations";
import { fetchBands, fetchStreams, normalizeDirectoryPage } from "../../api/band-stream-directory";
import { exportDesignationsCsv } from "../../utils/entityCsvExport";

const CLOSED_EDITOR = {
  open: false,
  mode: "add",
  id: "",
  bandId: "",
  bandCode: "",
  department: "",
  designation: "",
};

function rowBandCode(row) {
  return String(row?.band?.name ?? row?.bandCode ?? row?.band ?? "").trim();
}

function rowDepartment(row) {
  return String(row?.department ?? row?.stream ?? "").trim();
}

function rowDesignation(row) {
  return String(row?.name ?? row?.designation ?? "").trim();
}

function rowId(row) {
  return String(row?.id ?? "").trim();
}

async function loadDirectoryOptions() {
  const [bandRes, streamRes] = await Promise.allSettled([
    fetchBands({ limit: 100, cursor: null, search: null }),
    fetchStreams({ limit: 100, cursor: null, search: null, activeOnly: null }),
  ]);
  const bands =
    bandRes.status === "fulfilled" ? normalizeDirectoryPage(bandRes.value).items : [];
  const streams =
    streamRes.status === "fulfilled" ? normalizeDirectoryPage(streamRes.value).items : [];
  return { bands, streams };
}

export default function DesignationsWorkspace() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [bands, setBands] = useState([]);
  const [streams, setStreams] = useState([]);
  const [editor, setEditor] = useState(CLOSED_EDITOR);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAllDesignations({ search: search.trim(), limit: 500 });
      setRows(res.rows || []);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        setRows([]);
        setToast({
          title: "No job titles yet",
          message: "Import designation lookups from CSV, or add titles with Add job title.",
          tone: "warning",
        });
        return;
      }
      setRows([]);
      setToast({
        title: "Could not load designations",
        message: err?.message || "Try again after importing bands, streams, and lookups.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let alive = true;
    loadDirectoryOptions()
      .then(({ bands: b, streams: s }) => {
        if (alive) {
          setBands(b);
          setStreams(s);
        }
      })
      .catch(() => {
        if (alive) {
          setBands([]);
          setStreams([]);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const bandOptions = useMemo(() => {
    return bands
      .map((row) => {
        const code = String(row?.code ?? "").trim();
        const id = row?.id != null && /^\d+$/.test(String(row.id)) ? String(row.id) : "";
        const label = String(row?.label ?? row?.name ?? code).trim() || code;
        return id && code ? { id, code, label } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [bands]);

  const streamOptions = useMemo(() => {
    return streams
      .filter((row) => row?.active !== false)
      .map((row) => {
        const label = String(row?.label ?? row?.name ?? row?.code ?? "").trim();
        return label ? { value: label, label } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [streams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const band = rowBandCode(row).toLowerCase();
      const stream = rowDepartment(row).toLowerCase();
      const title = rowDesignation(row).toLowerCase();
      return band.includes(q) || stream.includes(q) || title.includes(q);
    });
  }, [rows, search]);

  const listPagination = useClientPagination(filtered, {
    pageSize: 25,
    pageSizeOptions: [25, 50, 100],
    resetKey: search,
  });

  function openAdd() {
    setEditor({
      open: true,
      mode: "add",
      id: "",
      bandId: bandOptions[0]?.id || "",
      bandCode: bandOptions[0]?.code || "",
      department: streamOptions[0]?.value || "",
      designation: "",
    });
  }

  function openEdit(row) {
    const bandCode = rowBandCode(row);
    const matchedBand =
      bandOptions.find((opt) => opt.code === bandCode) ||
      bandOptions.find((opt) => opt.code.toUpperCase() === bandCode.toUpperCase()) ||
      null;
    setEditor({
      open: true,
      mode: "edit",
      id: rowId(row),
      bandId: matchedBand?.id || String(row?.band?.id ?? row?.bandId ?? "").trim(),
      bandCode: matchedBand?.code || bandCode,
      department: rowDepartment(row),
      designation: rowDesignation(row),
    });
  }

  function closeEditor() {
    if (saving) return;
    setEditor(CLOSED_EDITOR);
  }

  async function submitEditor(e) {
    e.preventDefault();
    const designation = String(editor.designation || "").trim();
    const department = String(editor.department || "").trim();
    const bandId = String(editor.bandId || "").trim();
    const bandCode = String(editor.bandCode || "").trim();

    if (!designation) {
      setToast({ title: "Missing title", message: "Enter a job title.", tone: "error" });
      return;
    }
    if (!department) {
      setToast({ title: "Missing department", message: "Pick a department.", tone: "error" });
      return;
    }
    if (!bandId && !bandCode) {
      setToast({ title: "Missing band", message: "Pick a band.", tone: "error" });
      return;
    }

    setSaving(true);
    try {
      const payload = { designation, department, bandId: bandId || undefined, band: bandCode || undefined };
      if (editor.mode === "add") {
        await createDesignationLookup(payload);
        setToast({ title: "Job title added", message: `${designation} saved.`, tone: "success" });
      } else {
        if (!editor.id) throw new Error("This row has no server id — refresh and try again.");
        await updateDesignationLookup(editor.id, payload);
        setToast({ title: "Job title updated", message: `${designation} saved.`, tone: "success" });
      }
      closeEditor();
      await load();
    } catch (err) {
      setToast({
        title: editor.mode === "add" ? "Could not add" : "Could not update",
        message: err?.message || "Try again.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = rowId(pendingDelete);
    if (!id) {
      setToast({
        title: "Cannot delete",
        message: "This row has no server id — re-import or refresh the list.",
        tone: "error",
      });
      setPendingDelete(null);
      return;
    }
    setDeleting(true);
    try {
      await deleteDesignationLookup(id);
      setToast({
        title: "Job title deleted",
        message: rowDesignation(pendingDelete) || "Removed from lookups.",
        tone: "success",
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      setToast({
        title: "Could not delete",
        message: err?.message || "Try again.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Designations"
        subtitle="Band × department job titles used in employee profiles and promotion paths."
      >
        <button type="button" className="rt-btn-primary shrink-0 whitespace-nowrap" onClick={openAdd}>
          <Plus size={14} />
          Add job title
        </button>
        <EntityCsvToolbar
          entityKey="designation-lookups"
          importLabel="Import lookups"
          exportLabel="Export CSV"
          replaceCatalog
          onExport={() => exportDesignationsCsv(rows)}
          onImportComplete={load}
          confirmImportMessage="Replace designation lookups from CSV? Rows not in the file are removed. Import bands and streams first."
          showToast={(t) => setToast(t)}
        />
      </AdminPageHeader>

      <div className="rt-toolbar-panel">
        <SearchField
          label="Find a job title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          placeholder="Department, band, or title name"
          hint={`${filtered.length} row${filtered.length === 1 ? "" : "s"} shown`}
        />
      </div>

      <div className="pulse-surface overflow-hidden">
        <div className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">Lookup table</h2>
          <p className="pulse-section-subtitle mt-0.5">{listPagination.rangeLabel}</p>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
              <tr>
                <th className="p-4">Stream</th>
                <th className="p-4">Band</th>
                <th className="p-4">Designation</th>
                <th className="p-4 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <Loader2 className="animate-spin mx-auto" size={24} />
                  </td>
                </tr>
              ) : null}
              {!loading &&
                listPagination.slice.map((row) => (
                  <tr
                    key={row.id ?? `${rowDepartment(row)}-${rowBandCode(row)}-${rowDesignation(row)}`}
                    className="hover:bg-[rgb(var(--surface-2))]"
                  >
                    <td className="p-4">{rowDepartment(row) || "—"}</td>
                    <td className="p-4 font-mono text-xs">{rowBandCode(row) || "—"}</td>
                    <td className="p-4 font-medium">{rowDesignation(row) || "—"}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rt-btn-ghost p-2"
                          title="Edit job title"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(row)}
                          className="rt-btn-ghost p-2 text-red-500"
                          title="Delete job title"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && !filtered.length ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-[rgb(var(--muted))]">
                    No designations yet. Add a job title or import bands, streams, and designation lookups CSV.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {listPagination.show ? (
          <ListPaginationBar
            rangeLabel={listPagination.rangeLabel}
            page={listPagination.page}
            maxPage={listPagination.maxPage}
            pageSize={listPagination.pageSize}
            pageSizeOptions={listPagination.pageSizeOptions}
            loading={loading}
            onPageChange={listPagination.setPage}
            onPageSizeChange={listPagination.setPageSize}
          />
        ) : null}
      </div>

      <ModalOverlay
        open={editor.open}
        onClose={closeEditor}
        maxWidth="max-w-lg"
        zIndex={110}
        title={editor.mode === "add" ? "Add job title" : "Edit job title"}
        subtitle="Job titles are matched by band and department when adding employees."
        footer={
          editor.open ? (
            <DialogFooter>
              <button type="button" onClick={closeEditor} className="rt-btn-ghost" disabled={saving}>
                Cancel
              </button>
              <button type="submit" form="designation-editor-form" disabled={saving} className="rt-btn-primary">
                {saving ? "Saving…" : editor.mode === "add" ? "Add" : "Save changes"}
              </button>
            </DialogFooter>
          ) : null
        }
      >
        <form id="designation-editor-form" onSubmit={submitEditor} className="space-y-4 -mt-1">
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Band *</label>
            <select
              value={editor.bandId}
              onChange={(e) => {
                const next = bandOptions.find((opt) => opt.id === e.target.value);
                setEditor((prev) => ({
                  ...prev,
                  bandId: next?.id || "",
                  bandCode: next?.code || "",
                }));
              }}
              className="mt-2 rt-input text-sm w-full"
            >
              {bandOptions.length === 0 ? <option value="">No bands loaded</option> : null}
              {bandOptions.map((opt) => (
                <option key={`band:${opt.id}`} value={opt.id}>
                  {opt.code} — {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Department *</label>
            <select
              value={editor.department}
              onChange={(e) => setEditor((prev) => ({ ...prev, department: e.target.value }))}
              className="mt-2 rt-input text-sm w-full"
            >
              {streamOptions.length === 0 ? <option value="">No departments loaded</option> : null}
              {streamOptions.map((opt) => (
                <option key={`dept:${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Job title *</label>
            <input
              value={editor.designation}
              onChange={(e) => setEditor((prev) => ({ ...prev, designation: e.target.value }))}
              className="mt-2 rt-input text-sm w-full"
              placeholder="e.g., Software Engineer II"
            />
          </div>
        </form>
      </ModalOverlay>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete job title?"
        message={
          pendingDelete
            ? `Remove "${rowDesignation(pendingDelete)}" for ${rowDepartment(pendingDelete)} / ${rowBandCode(pendingDelete)}?`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
