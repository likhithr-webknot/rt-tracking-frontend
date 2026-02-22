import React, { useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

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
  const seenByName = new Set();
  for (const raw of list) {
    const id = String(raw?.id ?? "").trim();
    const name = extractCertificationName(raw);
    const listed = raw && typeof raw === "object" ? Boolean(raw.listed ?? true) : true;

    if (!name) {
      if (!id) continue;
      out.push({ id, name: id, listed });
      continue;
    }
    const nameKey = name.toLowerCase();
    if (seenByName.has(nameKey)) continue;
    seenByName.add(nameKey);
    out.push({ id: id || nameKey, name, listed });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export default function Certifications({
  certificationCatalog,
  onAddCertificationToCatalog,
  onEditCertificationInCatalog,
  onSetCertificationListed,
  onDeleteCertificationFromCatalog,
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState("");

  const [editModal, setEditModal] = useState({ open: false, id: null, name: "" });
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);

  const [toast, setToast] = useState(null); // { title, message? }
  const toastTimerRef = useRef(null);

  const catalog = useMemo(
    () => normalizeCatalogItems(certificationCatalog),
    [certificationCatalog]
  );

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

  function closeCatalogModal() {
    setShowCatalogModal(false);
    setCatalogDraft("");
  }

  function openEdit(item) {
    setEditModal({ open: true, id: item?.id ?? null, name: String(item?.name ?? "") });
  }

  function closeEdit() {
    setEditModal({ open: false, id: null, name: "" });
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Certifications
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Admin manages the certification registry. Employees can only complete items from this list.
          </p>
        </div>
      </header>

      <div className="relative group max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search certifications..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
        />
      </div>

      <section className="rt-panel overflow-hidden">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black tracking-tight">
              Certification Registry
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {catalog.length ? `${catalog.length} listed` : "No certifications listed yet."}
            </p>
          </div>

          <button
            onClick={() => setShowCatalogModal(true)}
            className="rt-btn-primary inline-flex items-center gap-2 px-6 py-3 font-black text-xs uppercase tracking-widest"
          >
            <Plus size={18} /> Add certification
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Certification</th>
                <th className="p-6 font-black">Status</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredCatalog.map((item) => (
                <tr key={String(item.id)} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{item.name}</div>
                    <div className="text-xs text-[rgb(var(--muted))] mt-1">
                      Employees will only be able to complete registry items.
                    </div>
                  </td>
                  <td className="p-6">
                    {item.listed ? (
                      <span className="text-[10px] font-black uppercase px-3 py-1 bg-emerald-500/10 text-emerald-300 rounded-lg border border-emerald-500/20">
                        Listed
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase px-3 py-1 bg-red-500/10 text-red-300 rounded-lg border border-red-500/20">
                        Unlisted
                      </span>
                    )}
                  </td>
                  <td className="p-6 text-right px-8">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-2.5 bg-[rgb(var(--surface-2))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] hover:brightness-95 rounded-xl transition-all border border-[rgb(var(--border))]"
                        title="Edit"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Edit3 size={18} />
                      </button>

                      <button
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          try {
                            await onSetCertificationListed?.(item.id, !item.listed);
                            showToast({
                              title: item.listed ? "Unlisted" : "Listed",
                              message: item.name,
                            });
                          } catch (err) {
                            showToast({
                              title: "Update failed",
                              message: err?.message || "Please try again.",
                            });
                          } finally {
                            setBusy(false);
                          }
                        }}
                        disabled={busy}
                        className={[
                          "p-2.5 rounded-xl transition-all border",
                          item.listed
                            ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500 hover:text-black border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500 hover:text-black border-emerald-500/20",
                        ].join(" ")}
                        title={item.listed ? "Unlist" : "List"}
                        aria-label={`${item.listed ? "Unlist" : "List"} ${item.name}`}
                      >
                        {item.listed ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>

                      <button
                        onClick={async () => {
                          if (busy) return;
                          setPendingDeleteItem(item);
                        }}
                        disabled={busy}
                        className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                        title="Delete"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredCatalog.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-500" colSpan={3}>
                    No certifications to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add to Catalog Modal */}
      {showCatalogModal ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Add Certification</h3>
                <p className="text-gray-500 text-sm mt-1">Adds an item to the admin registry.</p>
              </div>
              <button
                onClick={closeCatalogModal}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

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
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
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
                  className="rt-btn-ghost text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rt-btn-primary text-xs uppercase tracking-widest"
                >
                  {busy ? "Working…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Modal */}
      {editModal.open ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Edit Certification</h3>
                <p className="text-gray-500 text-sm mt-1">Updates the registry item name.</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

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
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
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
                  className="rt-btn-ghost text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rt-btn-primary text-xs uppercase tracking-widest"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
