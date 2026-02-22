import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import WebknotValueDirectory from "./WebknotValueDirectory";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import {
    fetchValues,
    addValue,
    updateValue,
    deleteValue as deleteValueApi,
    normalizeWebknotValuesList,
} from "../../api/webknotValueApi.js";

export default function WebknotValueDirectoryPage() {
    const [values, setValues] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [valuesLoading, setValuesLoading] = useState(false);
    const [valuesError, setValuesError] = useState("");
    const [showValueModal, setShowValueModal] = useState(false);
    const [valueModalMode, setValueModalMode] = useState("add"); // "add" | "edit"
    const [editingValueId, setEditingValueId] = useState(null);
    const [valueDraft, setValueDraft] = useState({ title: "", pillar: "", description: "" });
    const [valueSaving, setValueSaving] = useState(false);
    const [pendingDeleteValue, setPendingDeleteValue] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);

    const showToast = useCallback((nextToast) => {
        setToast(nextToast);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
    }, []);

    // Load values from API
    const reloadValues = useCallback(async ({ signal } = {}) => {
        setValuesError("");
        setValuesLoading(true);
        try {
            const data = await fetchValues(false, { signal });
            const normalized = normalizeWebknotValuesList(data);
            setValues(normalized.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || ""), undefined, { numeric: true })));
        } catch (err) {
            if (err?.name === "AbortError") return;
            const message = err?.message || "Failed to load values.";
            setValuesError(message);
            throw err;
        } finally {
            setValuesLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        reloadValues({ signal: controller.signal }).catch(() => {});
        return () => controller.abort();
    }, [reloadValues]);

    // Modal controls
    function openValueModal() {
        setValueModalMode("add");
        setEditingValueId(null);
        setValueDraft({ title: "", pillar: "", description: "" });
        setShowValueModal(true);
    }

    function openEditValueModal(v) {
        if (!v) return;
        setValueModalMode("edit");
        setEditingValueId(v.id);
        setValueDraft({
            title: String(v.title ?? ""),
            pillar: String(v.pillar ?? ""),
            description: String(v.description ?? ""),
        });
        setShowValueModal(true);
    }

    function closeValueModal() {
        if (valueSaving) return;
        setShowValueModal(false);
    }

    // Submit value (add or edit)
    async function submitValue(e) {
        e.preventDefault();
        const payload = {
            title: valueDraft.title.trim(),
            pillar: valueDraft.pillar.trim(),
            description: valueDraft.description.trim(),
        };

        if (!payload.title || !payload.pillar || !payload.description) {
            showToast({ title: "Missing fields", message: "Fill value, evaluation criteria, and description." });
            return;
        }

        setValueSaving(true);
        try {
            let res;
            if (valueModalMode === "edit") {
                res = await updateValue(String(editingValueId), payload);
            } else {
                res = await addValue(payload);
            }
            
            const normalized = res && typeof res === "object" ? res : payload;
            const id = String(normalized?.id ?? normalized?.valueId ?? Date.now());
            const next = { 
                id, 
                title: normalized?.title ?? payload.title, 
                pillar: normalized?.pillar ?? payload.pillar,
                description: normalized?.description ?? payload.description 
            };
            
            setValues((prev) => {
                const idx = prev.findIndex((x) => String(x.id) === String(id));
                if (idx === -1) return [next, ...prev];
                return prev.map((x) => (String(x.id) === String(id) ? next : x));
            });
            
            showToast({ title: valueModalMode === "edit" ? "Value updated" : "Value added", message: next.title });
            setShowValueModal(false);
            
            await reloadValues().catch(() => {});
        } catch (err) {
            showToast({
                title: valueModalMode === "edit" ? "Update failed" : "Add failed",
                message: err?.message || "Please try again.",
            });
        } finally {
            setValueSaving(false);
        }
    }

    // Delete value
    function deleteValue(v) {
        if (!v) return;
        setPendingDeleteValue(v);
    }

    async function confirmDeleteValue() {
        const v = pendingDeleteValue;
        if (!v) return;
        setPendingDeleteValue(null);
        try {
            await deleteValueApi(String(v.id));
            setValues((prev) => prev.filter((x) => String(x.id) !== String(v.id)));
            showToast({ title: "Value deleted", message: v.title });
            await reloadValues().catch(() => {});
        } catch (err) {
            showToast({ title: "Delete failed", message: err?.message || "Please try again." });
        }
    }

    return (
        <div className="rt-shell min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
            {/* Header with logout equivalent */}
            <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/90 backdrop-blur">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-black uppercase tracking-tighter">Webknot Values Management</h1>
                </div>
            </div>

            {/* Main content */}
            <div className="py-6 sm:py-8 px-4 sm:px-6">
                {valuesError ? (
                    <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                        {valuesError}
                    </div>
                ) : null}

                {valuesLoading ? (
                    <div className="max-w-7xl mx-auto mb-6 rt-panel-subtle p-4 text-sm text-[rgb(var(--muted))]">
                        Loading values…
                    </div>
                ) : null}

                <WebknotValueDirectory
                    values={values}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onAddValue={openValueModal}
                    onEditValue={openEditValueModal}
                    onDeleteValue={deleteValue}
                />
            </div>

            {/* Value Modal */}
            {showValueModal ? (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
                    <div className="w-full max-w-lg rt-panel rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-black uppercase tracking-tight">
                                    {valueModalMode === "edit" ? "Edit Value" : "Add Value"}
                                </h3>
                                <p className="text-gray-500 text-sm mt-1">
                                    {valueModalMode === "edit" ? (
                                        <span>
                                            Updating <span className="font-mono">{String(editingValueId ?? "")}</span>
                                        </span>
                                    ) : (
                                        "Creates a new Webknot value."
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={closeValueModal}
                                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                                aria-label="Close"
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={submitValue} className="mt-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                    Value *
                                </label>
                                <input
                                    value={valueDraft.title}
                                    onChange={(e) => setValueDraft((d) => ({ ...d, title: e.target.value }))}
                                    className="mt-2 rt-input py-3 px-4 text-sm"
                                    placeholder="e.g., Own The Outcome"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                    Evaluation Criteria *
                                </label>
                                <input
                                    value={valueDraft.pillar}
                                    onChange={(e) => setValueDraft((d) => ({ ...d, pillar: e.target.value }))}
                                    className="mt-2 rt-input py-3 px-4 text-sm"
                                    placeholder="e.g., Ownership"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                    Description *
                                </label>
                                <textarea
                                    value={valueDraft.description}
                                    onChange={(e) => setValueDraft((d) => ({ ...d, description: e.target.value }))}
                                    rows={4}
                                    className="mt-2 rt-input py-3 px-4 text-sm resize-none"
                                    placeholder="Write a short definition of the value..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeValueModal}
                                    disabled={valueSaving}
                                    className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={valueSaving}
                                    className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {valueSaving ? "Saving…" : (valueModalMode === "edit" ? "Save Changes" : "Add Value")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            <ConfirmDialog
                open={Boolean(pendingDeleteValue)}
                title="Delete Value"
                message={`Delete "${String(pendingDeleteValue?.title ?? "")}"?`}
                confirmText="Delete"
                cancelText="Cancel"
                confirmVariant="danger"
                onCancel={() => setPendingDeleteValue(null)}
                onConfirm={confirmDeleteValue}
            />

            <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
    );
}
