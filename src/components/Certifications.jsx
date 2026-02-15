import React, { useMemo, useRef, useState } from "react";
import { CheckCircle2, Edit3, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";

function normalizeCatalogItems(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seenByName = new Set();
  for (const raw of list) {
    const id = String(raw?.id ?? "").trim();
    const name = String(raw?.name ?? raw ?? "").trim();
    const listed = raw && typeof raw === "object" ? Boolean(raw.listed ?? true) : true;

    if (!name) continue;
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

  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState("");

  const [editModal, setEditModal] = useState({ open: false, id: null, name: "" });

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
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">
            Certifications
          </h2>
          <p className="text-gray-500 text-sm mt-2">
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
          className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-purple-500 outline-none transition-all"
        />
      </div>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">
              Certification Registry
            </h3>
            <p className="text-gray-500 text-sm mt-1">
              {catalog.length ? `${catalog.length} listed` : "No certifications listed yet."}
            </p>
          </div>

          <button
            onClick={() => setShowCatalogModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 text-white px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all"
          >
            <Plus size={18} /> Add certification
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-white/5">
              <tr>
                <th className="p-6 font-black">Certification</th>
                <th className="p-6 font-black">Status</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCatalog.map((item) => (
                <tr key={String(item.id)} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-white tracking-tight">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
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
                        className="p-2.5 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white rounded-xl transition-all border border-white/10"
                        title="Edit"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Edit3 size={18} />
                      </button>

                      <button
                        onClick={() => {
                          onSetCertificationListed?.(item.id, !item.listed);
                          showToast({
                            title: item.listed ? "Unlisted" : "Listed",
                            message: item.name,
                          });
                        }}
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
                        onClick={() => {
                          const ok = window.confirm(`Delete "${item.name}"?`);
                          if (!ok) return;
                          onDeleteCertificationFromCatalog?.(item.id);
                          showToast({ title: "Deleted", message: item.name });
                        }}
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
                  <td className="p-10 text-center text-gray-500" colSpan={3}>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Add Certification</h3>
                <p className="text-gray-500 text-sm mt-1">Adds an item to the admin registry.</p>
              </div>
              <button
                onClick={closeCatalogModal}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
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
                onAddCertificationToCatalog?.(name);
                showToast({ title: "Added to registry", message: name });
                closeCatalogModal();
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
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., AWS Solutions Architect Associate"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCatalogModal}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Modal */}
      {editModal.open ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Edit Certification</h3>
                <p className="text-gray-500 text-sm mt-1">Updates the registry item name.</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
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
                onEditCertificationInCatalog?.(editModal.id, nextName);
                showToast({ title: "Updated", message: nextName });
                closeEdit();
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
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., AWS Solutions Architect Associate"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Purple toast (top-right) */}
      {toast ? (
        <div className="fixed top-6 right-6 z-[80]">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-purple-600 px-4 py-3 shadow-2xl text-white">
            <div className="mt-0.5 text-white">
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-[220px]">
              <div className="text-sm font-black">{toast.title}</div>
              {toast.message ? (
                <div className="text-xs text-white/90 mt-1">{toast.message}</div>
              ) : null}
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-2 rounded-xl p-1 text-white/90 hover:bg-white/10 hover:text-white transition"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
