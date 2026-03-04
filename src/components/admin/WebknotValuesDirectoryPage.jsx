import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import WebknotValueDirectory from "./WebknotValueDirectory";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import ModalOverlay from "../shared/ModalOverlay.jsx";
import {
    fetchValues,
    addValue,
    updateValue,
    deleteValue as deleteValueApi,
    normalizeWebknotValuesList,
} from "../../api/webknotValueApi.js";

function getCanonicalValueId(v) {
    const id = String(
        v?.id ??
        v?.valueId ??
        v?.webknotValueId ??
        v?.raw?.id ??
        v?.raw?.valueId ??
        v?.raw?.webknotValueId ??
        ""
    ).trim();
    return id || null;
}

export default function WebknotValueDirectoryPage() {
    const [values, setValues] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [valuesLoading, setValuesLoading] = useState(false);
    const [valuesError, setValuesError] = useState("");
    const [showValueModal, setShowValueModal] = useState(false);
    const [valueModalMode, setValueModalMode] = useState("add"); // "add" | "edit"
    const [editingValueId, setEditingValueId] = useState(null);
    const [valueDraft, setValueDraft] = useState({ title: "", pillar: "" });
    const [valueSaving, setValueSaving] = useState(false);
    const [pendingDeleteValue, setPendingDeleteValue] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimerRef = useRef(null);

    const showToast = useCallback((nextToast) => {
        setToast(nextToast);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
    }, []);
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
    function openValueModal() {
        setValueModalMode("add");
        setEditingValueId(null);
        setValueDraft({ title: "", pillar: "" });
        setShowValueModal(true);
    }

    function openEditValueModal(v) {
        if (!v) return;
        const canonicalId = getCanonicalValueId(v);
        if (!canonicalId) {
            showToast({ title: "Edit unavailable", message: "This value has no editable id." });
            return;
        }
        setValueModalMode("edit");
        setEditingValueId(canonicalId);
        setValueDraft({
            title: String(v.title ?? ""),
            pillar: String(v.pillar ?? ""),
        });
        setShowValueModal(true);
    }

    function closeValueModal() {
        if (valueSaving) return;
        setShowValueModal(false);
    }
    async function submitValue(e) {
        e.preventDefault();
        const payload = {
            title: valueDraft.title.trim(),
            pillar: valueDraft.pillar.trim(),
        };

        if (!payload.title || !payload.pillar) {
            showToast({ title: "Missing fields", message: "Fill value and evaluation criteria." });
            return;
        }

        setValueSaving(true);
        try {
            let res;
            if (valueModalMode === "edit") {
                if (!String(editingValueId ?? "").trim()) {
                    throw new Error("Missing value id for edit.");
                }
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
            
            <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]/90 backdrop-blur">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-semibold uppercase tracking-tighter">Webknot Values Management</h1>
                </div>
            </div>

            
            <div className="py-6 sm:py-8 px-4 sm:px-6">
                {valuesError ? (
                    <div className="max-w-7xl mx-auto mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
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

            
            {showValueModal ? (
                <ModalOverlay
                  open={showValueModal}
                  onClose={closeValueModal}
                  maxWidth="max-w-lg"
                  zIndex={60}
                  header={
                    <div>
                      <h3 className="font-semibold uppercase tracking-tight">
                        {valueModalMode === "edit" ? "Edit Value" : "Add Value"}
                      </h3>
                      <p className="text-gray-500 text-sm mt-1">
                        {valueModalMode === "edit" ? (
                          <span>Updating <span className="font-mono">{String(editingValueId ?? "")}</span></span>
                        ) : "Creates a new Webknot value."}
                      </p>
                    </div>
                  }
                >

                        <form onSubmit={submitValue} className="mt-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                    Evaluation Criteria *
                                </label>
                                <input
                                    value={valueDraft.pillar}
                                    onChange={(e) => setValueDraft((d) => ({ ...d, pillar: e.target.value }))}
                                    className="mt-2 rt-input py-3 px-4 text-sm"
                                    placeholder="e.g., Ownership"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeValueModal}
                                    disabled={valueSaving}
                                    className="rt-btn-ghost transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={valueSaving}
                                    className="rt-btn-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {valueSaving ? "Saving…" : (valueModalMode === "edit" ? "Save Changes" : "Add Value")}
                                </button>
                            </div>
                        </form>
                </ModalOverlay>
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
