// @ts-nocheck
import React, { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  Hash,
  Filter,
} from "lucide-react";
import ModalOverlay from "../shared/ModalOverlay";
import ConfirmDialog from "../shared/ConfirmDialog";
import Toast from "../shared/Toast";
import AdminPageHeader from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import { exportCompanyValuesCsv } from "../../utils/entityCsvExport";
import {
  useWebknotValues,
  useAddWebknotValueMutation,
  useUpdateWebknotValueMutation,
  useDeleteWebknotValueMutation,
} from "../../hooks/queries";
import {
  extractEvaluationCriteria,
  evaluationCriteriaDisplayLabel,
  evaluationCriteriaGroupKey,
} from "../../utils/evaluationCriteria";

/** UI/domain shape — evaluation criteria from API pillar / criteria fields */
function mapApiValueToWebknotValue(row) {
  const criteria = extractEvaluationCriteria(row);
  return {
    id: String(row?.id ?? "").trim(),
    name: String(row?.title ?? "").trim(),
    evaluationCriteria: criteria,
    description: String(row?.description ?? "").trim(),
  };
}

function resolveCompanyValueId(value) {
  const id = String(
    value?.id ??
      value?.raw?.id ??
      value?.raw?.valueId ??
      value?.raw?.webknotValueId ??
      ""
  ).trim();
  return id || null;
}

function toApiPayload(draft) {
  return {
    title: String(draft.name ?? "").trim(),
    pillar: String(draft.evaluationCriteria ?? "").trim(),
    description: String(draft.description ?? "").trim(),
  };
}

function normalizeSearchText(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function titleCase(text) {
  return String(text || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const CRITERIA_PALETTE = [
  { ring: "ring-indigo-500/25", dot: "bg-indigo-500", badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20" },
  { ring: "ring-emerald-500/25", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20" },
  { ring: "ring-amber-500/25", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  { ring: "ring-violet-500/25", dot: "bg-violet-500", badge: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20" },
  { ring: "ring-rose-500/25", dot: "bg-rose-500", badge: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20" },
  { ring: "ring-cyan-500/25", dot: "bg-cyan-500", badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20" },
];

function paletteForCriteria(key) {
  const k = normalizeSearchText(key) || "uncategorized";
  let hash = 0;
  for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) | 0;
  return CRITERIA_PALETTE[Math.abs(hash) % CRITERIA_PALETTE.length];
}

const EMPTY_DRAFT = { name: "", evaluationCriteria: "", description: "" };

export default function CompanyValuesWorkspace() {
  const listQuery = useWebknotValues({ activeOnly: false });
  const createMutation = useAddWebknotValueMutation();
  const updateMutation = useUpdateWebknotValueMutation();
  const deleteMutation = useDeleteWebknotValueMutation();

  const webknotValues = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    return items
      .map(mapApiValueToWebknotValue)
      .filter((v) => v.name)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [listQuery.data?.items]);

  const isLoading = listQuery.isLoading || listQuery.isFetching;
  const loadError = listQuery.error
    ? (listQuery.error).message || "Could not load Webknot values."
    : "";

  const [searchTerm, setSearchTerm] = useState("");
  const [criteriaFilter, setCriteriaFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [formDraft, setFormDraft] = useState(EMPTY_DRAFT);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const criteriaOptions = useMemo(() => {
    const keys = new Set();
    for (const v of webknotValues) {
      keys.add(evaluationCriteriaDisplayLabel(v.evaluationCriteria));
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [webknotValues]);

  const filteredValues = useMemo(() => {
    const q = normalizeSearchText(searchTerm);
    return webknotValues.filter((v) => {
      const label = evaluationCriteriaDisplayLabel(v.evaluationCriteria);
      const matchesCriteria = criteriaFilter === "all" || label === criteriaFilter;
      if (!matchesCriteria) return false;
      if (!q) return true;
      const name = normalizeSearchText(v.name);
      const criteria = normalizeSearchText(label);
      return name.includes(q) || criteria.includes(q);
    });
  }, [webknotValues, searchTerm, criteriaFilter]);

  const groupedByCriteria = useMemo(() => {
    const map = new Map();
    for (const v of filteredValues) {
      const key = evaluationCriteriaGroupKey(v.evaluationCriteria);
      const label = evaluationCriteriaDisplayLabel(v.evaluationCriteria);
      if (!map.has(key)) map.set(key, { key, label, values: [] });
      map.get(key).values.push(v);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [filteredValues]);

  const stats = useMemo(
    () => ({
      total: webknotValues.length,
      criteriaCount: criteriaOptions.length,
      visible: filteredValues.length,
    }),
    [webknotValues.length, criteriaOptions.length, filteredValues.length]
  );

  function openCreateEditor() {
    setEditorMode("create");
    setEditingId(null);
    setFormDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  }

  function openEditEditor(value) {
    const id = resolveCompanyValueId(value);
    if (!id) {
      showToast({ title: "Cannot edit", message: "This value has no stable id.", tone: "error" });
      return;
    }
    setEditorMode("edit");
    setEditingId(id);
    setFormDraft({
      name: value.name,
      evaluationCriteria: value.evaluationCriteria,
      description: value.description,
    });
    setEditorOpen(true);
  }

  function closeEditor() {
    if (isSaving) return;
    setEditorOpen(false);
  }

  async function submitEditor(event) {
    event.preventDefault();
    const draft = {
      name: formDraft.name.trim(),
      evaluationCriteria: formDraft.evaluationCriteria.trim(),
      description: formDraft.description.trim(),
    };
    if (!draft.name || !draft.evaluationCriteria) {
      showToast({
        title: "Required fields",
        message: "Enter a value name and evaluation criteria.",
        tone: "error",
      });
      return;
    }

    const payload = toApiPayload(draft);
    try {
      if (editorMode === "edit") {
        if (!editingId) throw new Error("Missing value id.");
        await updateMutation.mutateAsync({ id: editingId, payload });
        showToast({ title: "Value updated", message: draft.name });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Value created", message: draft.name });
      }
      setEditorOpen(false);
    } catch (err) {
      showToast({
        title: editorMode === "edit" ? "Update failed" : "Create failed",
        message: err?.message || "Please try again.",
        tone: "error",
      });
    }
  }

  async function confirmDelete() {
    const value = pendingDelete;
    if (!value) return;
    const id = resolveCompanyValueId(value);
    setPendingDelete(null);
    if (!id) {
      showToast({ title: "Delete failed", message: "Missing value id.", tone: "error" });
      return;
    }
    try {
      await deleteMutation.mutateAsync(id);
      showToast({ title: "Value removed", message: value.name });
    } catch (err) {
      showToast({
        title: "Delete failed",
        message: err?.message || "Please try again.",
        tone: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <AdminPageHeader
        title="Webknot Values"
        subtitle="Define values and evaluation criteria used in employee and manager reviews."
      >
        <EntityCsvToolbar
          entityKey="webknot-values"
          onImportComplete={() => listQuery.refetch()}
          onExport={() => exportCompanyValuesCsv(webknotValues)}
          showToast={showToast}
        />
        <button type="button" onClick={openCreateEditor} className="rt-btn-primary shrink-0">
          <Plus size={18} />
          Add value
        </button>
      </AdminPageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Hash} label="Total values" value={stats.total} />
        <StatCard icon={Layers} label="Criteria groups" value={stats.criteriaCount} />
        <StatCard icon={Filter} label="Showing" value={stats.visible} />
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {loadError}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]"
            size={18}
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by value name or criteria…"
            className="rt-input w-full py-3.5 pl-11 pr-4"
            aria-label="Search webknot values"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <CriteriaChip
            active={criteriaFilter === "all"}
            onClick={() => setCriteriaFilter("all")}
            label="All criteria"
          />
          {criteriaOptions.map((label) => (
            <CriteriaChip
              key={label}
              active={criteriaFilter === label}
              onClick={() => setCriteriaFilter(label)}
              label={titleCase(label)}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rt-panel flex items-center justify-center gap-3 p-12 text-sm text-[rgb(var(--muted))]">
          <Loader2 size={20} className="animate-spin text-[rgb(var(--primary))]" />
          Loading webknot values…
        </div>
      ) : webknotValues.length === 0 ? (
        <EmptyState onAdd={openCreateEditor} />
      ) : filteredValues.length === 0 ? (
        <div className="rt-panel p-10 text-center text-sm text-[rgb(var(--muted))]">
          No values match your search or filter.
        </div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="popLayout">
            {groupedByCriteria.map((group) => {
              const palette = paletteForCriteria(group.key);
              return (
                <motion.section
                  key={group.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`rt-panel ring-2 ${palette.ring}`}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette.dot}`} />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold tracking-tight text-[rgb(var(--text))]">
                          {group.label}
                        </h3>
                        <p className="text-[11px] font-medium text-[rgb(var(--muted))]">
                          {group.values.length} value{group.values.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rt-badge shrink-0 border ${palette.badge}`}
                    >
                      Evaluation criteria
                    </span>
                  </div>
                  <ul className="divide-y divide-[rgb(var(--border))]">
                    {group.values.map((value) => (
                      <li
                        key={value.id || `${group.key}-${value.name}`}
                        className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[rgb(var(--surface-2))]/60 sm:px-6"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[rgb(var(--text))]">
                            {value.name}
                          </p>
                          {value.description ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-[rgb(var(--muted))]">
                              {value.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditEditor(value)}
                            className="rounded-lg p-2 text-[rgb(var(--muted))] transition-colors hover:bg-[rgb(var(--primary-soft))] hover:text-[rgb(var(--primary))]"
                            title="Edit value"
                            aria-label={`Edit ${value.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(value)}
                            className="rounded-lg p-2 text-[rgb(var(--muted))] transition-colors hover:bg-red-500/10 hover:text-red-500"
                            title="Delete value"
                            aria-label={`Delete ${value.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {editorOpen ? (
        <ModalOverlay
          open={editorOpen}
          onClose={closeEditor}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="text-lg font-bold tracking-tight text-[rgb(var(--text))]">
                {editorMode === "edit" ? "Edit company value" : "New company value"}
              </h3>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                {editorMode === "edit"
                  ? "Update how this value appears in employee and manager reviews."
                  : "Add a value employees can rate and managers can evaluate."}
              </p>
            </div>
          }
        >
          <form onSubmit={submitEditor} className="mt-6 space-y-5">
            <Field
              label="Value name"
              required
              value={formDraft.name}
              onChange={(name) => setFormDraft((d) => ({ ...d, name }))}
              placeholder="e.g. Own the outcome"
            />
            <Field
              label="Evaluation criteria"
              required
              value={formDraft.evaluationCriteria}
              onChange={(evaluationCriteria) =>
                setFormDraft((d) => ({ ...d, evaluationCriteria }))
              }
              placeholder="e.g. Ownership"
              hint="Groups values in review scorecards."
            />
            <Field
              label="Description"
              value={formDraft.description}
              onChange={(description) => setFormDraft((d) => ({ ...d, description }))}
              placeholder="Optional context for admins"
              multiline
            />
            <div className="flex justify-end gap-3 border-t border-[rgb(var(--border))] pt-4">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="rt-btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rt-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Saving…" : editorMode === "edit" ? "Save changes" : "Create value"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove company value"
        message={`Remove "${pendingDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rt-panel-subtle flex items-center gap-4 px-5 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--surface))] text-[rgb(var(--primary))] ring-1 ring-[rgb(var(--border))]">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted))]">
          {label}
        </div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{value}</div>
      </div>
    </div>
  );
}

function CriteriaChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={["rt-chip", active ? "rt-chip--active" : ""].join(" ")}>
      {label}
    </button>
  );
}

function Field({ label, required, value, onChange, placeholder, hint, multiline }) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  const Input = multiline ? "textarea" : "input";
  return (
    <div>
      <label htmlFor={id} className="rt-label">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className={[
          "mt-2 w-full rt-input text-sm",
          multiline ? "resize-y min-h-[88px]" : "",
        ].join(" ")}
      />
      {hint ? <p className="mt-1.5 text-xs text-[rgb(var(--muted))]">{hint}</p> : null}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="rt-panel flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]">
        <Sparkles size={28} />
      </div>
      <h3 className="text-lg font-bold text-[rgb(var(--text))]">No Webknot values yet</h3>
      <p className="mt-2 max-w-md text-sm text-[rgb(var(--muted))]">
        Create your first value to power self-assessments and manager evaluations.
      </p>
      <button type="button" onClick={onAdd} className="rt-btn-primary mt-6">
        <Plus size={18} />
        Add first value
      </button>
    </div>
  );
}
