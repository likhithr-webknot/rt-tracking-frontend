import React, { useMemo, useRef, useState } from "react";
import { certificationIdIsApiBacked } from "../../api/certifications";
import { Edit3, Eye, EyeOff, Plus, Search, Trash2 } from "lucide-react";
import Toast from "../shared/Toast";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import { exportCertificationsCsv } from "../../utils/entityCsvExport";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay from "../shared/ModalOverlay";
import CursorPagination from "../shared/CursorPagination";

function extractCertificationName(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";

  const direct = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
  if (direct) return direct;

  if (raw.certification && typeof raw.certification === "object") {
    const nested = String(
      raw.certification.name ?? raw.certification.certificationName ?? raw.certification.title ?? ""
    ).trim();
    if (nested) return nested;
  }

  if (typeof raw.certification === "string") {
    const nestedText = raw.certification.trim();
    if (nestedText) return nestedText;
  }

  return "";
}

function normalizeCatalogItems(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    const name = extractCertificationName(raw);
    const idRaw = raw?.id != null && String(raw.id).trim() !== "" ? String(raw.id).trim() : null;
    const listed = raw && typeof raw === "object" ? Boolean(raw.listed ?? true) : true;
    if (!name && !idRaw) continue;
    const displayName = name || idRaw || "Certification";
    const rowKey = idRaw ?? `row-${i}-${displayName.toLowerCase().slice(0, 48)}`;
    out.push({
      id: idRaw,
      name: displayName,
      listed,
      rowKey,
      apiBacked: certificationIdIsApiBacked(idRaw),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export default function Certifications({
  certificationCatalog,
  localRegistryOnly = false,
  catalogLoading = false,
  onAddCertificationToCatalog,
  onEditCertificationInCatalog,
  onSetCertificationListed,
  onDeleteCertificationFromCatalog,
  onImportComplete,
  pager,
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState("");

  const [editModal, setEditModal] = useState({ open: false, id: null, name: "" });
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);

  const [toast, setToast] = useState(null); // { title, message? }
  const toastTimerRef = useRef(null);

  const catalog = useMemo(() => {
    const rows = normalizeCatalogItems(certificationCatalog);
    return rows.map((r) => ({
      ...r,
      canMutate: localRegistryOnly ? Boolean(r.name) : r.apiBacked,
    }));
  }, [certificationCatalog, localRegistryOnly]);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  const filteredCatalog = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((item) => item.name.toLowerCase().includes(q));
  }, [catalog, query]);
  const listedCount = useMemo(
    () => catalog.filter((item) => Boolean(item?.listed)).length,
    [catalog]
  );
  const unlistedCount = Math.max(0, catalog.length - listedCount);

  function closeCatalogModal() {
    setShowCatalogModal(false);
    setCatalogDraft("");
  }

  function openEdit(item) {
    if (!item?.canMutate) {
      showToast({
        title: "Cannot edit",
        message: "This row has no server id yet. Refresh the page or wait for the list to load from the API.",
      });
      return;
    }
    setEditModal({ open: true, id: item?.id ?? null, name: String(item?.name ?? "") });
  }

  function closeEdit() {
    setEditModal({ open: false, id: null, name: "" });
  }

  return (
    <AdminPageShell className="space-y-8">
      <AdminPageHeader
        title="Certifications"
        subtitle="Manage the master list of certifications available to employees."
      >
        <EntityCsvToolbar
          entityKey="certifications"
          onImportComplete={() => onImportComplete?.()}
          onExport={() => exportCertificationsCsv(catalog)}
          showToast={showToast}
        />
      </AdminPageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Total</div>
          <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{catalog.length}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Listed</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-500">{listedCount}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Unlisted</div>
          <div className="mt-1 text-2xl font-semibold text-amber-500">{unlistedCount}</div>
        </div>
      </div>

      <div className="relative group max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={20} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search certifications..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
        />
      </div>

      <section>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <p className="text-sm text-[rgb(var(--muted))]">
              {catalog.length ? `${catalog.length} certifications in registry` : "No certifications listed yet."}
            </p>
          </div>

          <button
            onClick={() => setShowCatalogModal(true)}
            className="rt-btn-primary"
          >
            <Plus size={18} /> Add Certification
          </button>
        </div>

        {/* ── Desktop table ── */}
        <div className="rt-panel overflow-hidden hidden lg:block">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="px-6 py-4 font-semibold">Certification</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredCatalog.map((item) => (
                <tr key={String(item.rowKey)} className="hover:bg-[rgb(var(--surface-2))]/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-[rgb(var(--text))] tracking-tight">{item.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    {item.listed ? (
                      <span className="rt-badge rt-badge--success uppercase">
                        <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                        Listed
                      </span>
                    ) : (
                      <span className="rt-badge rt-badge--neutral uppercase">
                        Unlisted
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        disabled={busy || !item.canMutate}
                        className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title={item.canMutate ? "Edit" : "API-managed — not editable here"}
                        aria-label={`Edit ${item.name}`}
                      >
                        <Edit3 size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          try {
                            await onSetCertificationListed?.(item.id, !item.listed);
                            showToast({ title: item.listed ? "Unlisted" : "Listed", message: item.name });
                          } catch (err) {
                            showToast({ title: "Update failed", message: err?.message || "Please try again." });
                          } finally {
                            setBusy(false);
                          }
                        }}
                        disabled={busy || !item.canMutate}
                        className={[
                          "p-2 rounded-md transition-all",
                          item.listed
                            ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
                        ].join(" ")}
                        title={item.listed ? "Unlist" : "List"}
                        aria-label={`${item.listed ? "Unlist" : "List"} ${item.name}`}
                      >
                        {item.listed ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!busy) setPendingDeleteItem(item);
                        }}
                        disabled={busy || !item.canMutate}
                        className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        title={item.canMutate ? "Delete" : "API-managed — not deletable here"}
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredCatalog.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={3}>
                    No certifications to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ── Mobile cards ── */}
        <div className="lg:hidden space-y-3">
          {filteredCatalog.map((item) => (
            <div key={String(item.rowKey)} className="rt-panel p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[rgb(var(--text))] tracking-tight truncate">{item.name}</div>
                <div className="mt-1.5">
                  {item.listed ? (
                    <span className="text-[10px] font-semibold uppercase px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md">Listed</span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase px-2.5 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded-md">Unlisted</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  disabled={busy || !item.canMutate}
                  className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title={item.canMutate ? "Edit" : "API-managed — not editable here"}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    try {
                      await onSetCertificationListed?.(item.id, !item.listed);
                      showToast({ title: item.listed ? "Unlisted" : "Listed", message: item.name });
                    } catch (err) {
                      showToast({ title: "Update failed", message: err?.message || "Please try again." });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy || !item.canMutate}
                  className={[
                    "p-2 rounded-md transition-all",
                    item.listed
                      ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                      : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
                  ].join(" ")}
                  title={item.listed ? "Unlist" : "List"}
                >
                  {item.listed ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!busy) setPendingDeleteItem(item);
                  }}
                  disabled={busy || !item.canMutate}
                  className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title={item.canMutate ? "Delete" : "API-managed — not deletable here"}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {filteredCatalog.length === 0 ? (
            <div className="rt-panel p-8 text-center text-[rgb(var(--muted))] text-sm">No certifications to show.</div>
          ) : null}
        </div>
      </section>

      
      {showCatalogModal ? (
        <ModalOverlay
          open={showCatalogModal}
          onClose={closeCatalogModal}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="font-semibold uppercase tracking-tight">Add Certification</h3>
              <p className="text-[rgb(var(--muted))] text-sm mt-1">Adds an item to the admin registry.</p>
            </div>
          }
        >

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const name = String(catalogDraft || "").trim();
                if (!name) {
                  showToast({ title: "Missing field", message: "Enter a certification name." });
                  return;
                }
                const exists = catalog.some((c) => c.name.toLowerCase() === name.toLowerCase());
                if (exists) {
                  showToast({ title: "Already exists", message: name });
                  return;
                }
                setBusy(true);
                try {
                  await onAddCertificationToCatalog?.(name);
                  showToast({ title: "Added to registry", message: name });
                  closeCatalogModal();
                } catch (err) {
                  showToast({
                    title: "Add failed",
                    message: err?.message || "Please try again.",
                  });
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">
                  Certification *
                </label>
                <input
                  value={catalogDraft}
                  onChange={(e) => setCatalogDraft(e.target.value)}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., AWS Solutions Architect Associate"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCatalogModal}
                  className="rt-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rt-btn-primary"
                >
                  {busy ? "Working…" : "Add"}
                </button>
              </div>
            </form>
        </ModalOverlay>
      ) : null}

      
      {editModal.open ? (
        <ModalOverlay
          open={editModal.open}
          onClose={closeEdit}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="font-semibold uppercase tracking-tight">Edit Certification</h3>
              <p className="text-gray-500 text-sm mt-1">Updates the registry item name.</p>
            </div>
          }
        >

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const nextName = String(editModal.name || "").trim();
                if (!nextName) {
                  showToast({ title: "Missing field", message: "Enter a certification name." });
                  return;
                }
                const exists = catalog.some(
                  (c) => c.name.toLowerCase() === nextName.toLowerCase() && String(c.id) !== String(editModal.id)
                );
                if (exists) {
                  showToast({ title: "Already exists", message: nextName });
                  return;
                }
                setBusy(true);
                try {
                  await onEditCertificationInCatalog?.(editModal.id, nextName);
                  showToast({ title: "Updated", message: nextName });
                  closeEdit();
                } catch (err) {
                  showToast({
                    title: "Update failed",
                    message: err?.message || "Please try again.",
                  });
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">
                  Certification *
                </label>
                <input
                  value={editModal.name}
                  onChange={(e) => setEditModal((p) => ({ ...p, name: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., AWS Solutions Architect Associate"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={busy}
                  className="rt-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rt-btn-primary"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
        </ModalOverlay>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteItem)}
        title="Delete Certification"
        message={`Delete "${String(pendingDeleteItem?.name ?? "")}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        busy={busy}
        onCancel={() => setPendingDeleteItem(null)}
        onConfirm={async () => {
          const item = pendingDeleteItem;
          if (!item) return;
          setBusy(true);
          try {
            await onDeleteCertificationFromCatalog?.(item.id);
            showToast({ title: "Deleted", message: item.name });
            setPendingDeleteItem(null);
          } catch (err) {
            showToast({
              title: "Delete failed",
              message: err?.message || "Please try again.",
            });
          } finally {
            setBusy(false);
          }
        }}
      />

      {pager ? (
        <div className="pt-4">
          <CursorPagination
            canPrev={Boolean(pager.canPrev)}
            canNext={Boolean(pager.canNext)}
            onPrev={pager.onPrev}
            onNext={pager.onNext}
            loading={Boolean(pager.loading)}
            label={pager.label}
          />
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
