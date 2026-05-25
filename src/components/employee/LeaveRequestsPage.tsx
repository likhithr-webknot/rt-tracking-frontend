import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, FileUp, Pencil, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  createUserRequest,
  deleteUserRequest,
  fetchManagersForUser,
  fetchUserRequests,
  normalizeUserRequestPage,
  updateUserRequest,
} from "../../api/user-requests";
import Toast from "../shared/Toast";

const REQUEST_TYPES = ["LEAVE", "WFH", "COMP_OFF"];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysInput(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toWebtrakDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function fromWebtrakDate(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDisplayDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const normalized = fromWebtrakDate(raw);
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function unwrapManagers(raw) {
  const data = raw?.data ?? raw;
  const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const seen = new Set();
  return rows
    .map((row) => {
      const obj = row && typeof row === "object" ? row : {};
      const email = String(obj.managerEmail ?? obj.email ?? "").trim();
      if (!email || seen.has(email.toLowerCase())) return null;
      seen.add(email.toLowerCase());
      return {
        email,
        name: String(obj.managerName ?? obj.name ?? email).trim() || email,
        projectCode: String(obj.projectCode ?? "").trim(),
      };
    })
    .filter(Boolean);
}

export default function LeaveRequestsPage({ employee, authEmail }) {
  const employeeEmail = String(employee?.email || authEmail || "").trim();
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [file, setFile] = useState(null);
  const [updateFile, setUpdateFile] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [managers, setManagers] = useState([]);
  const [page, setPage] = useState(() => normalizeUserRequestPage(null));
  const [filters, setFilters] = useState({
    requestType: "LEAVE",
    fromDate: addDaysInput(-30),
    toDate: addDaysInput(30),
  });
  const [draft, setDraft] = useState({
    userRequestType: "LEAVE",
    requestFromDate: todayInput(),
    requestToDate: todayInput(),
    isHalfDay: false,
    clientApproval: false,
    comments: "",
    managers: [],
  });

  const requestRows = page.items;
  const selectedType = draft.userRequestType;
  const compOffNeedsManager = selectedType === "COMP_OFF";

  const loadRequests = useCallback(async ({ signal } = {} as ApiOptions) => {
    if (!filters.fromDate || !filters.toDate) return;
    setLoading(true);
    try {
      const raw = await fetchUserRequests({
        fromDate: toWebtrakDate(filters.fromDate),
        toDate: toWebtrakDate(filters.toDate),
        requestType: filters.requestType,
        page: 0,
        size: 25,
        signal,
      });
      setPage(normalizeUserRequestPage(raw));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setToast({ title: "Requests failed", message: err?.message || "Could not load requests." });
      setPage(normalizeUserRequestPage(null));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters.fromDate, filters.requestType, filters.toDate]);

  useEffect(() => {
    const controller = new AbortController();
    loadRequests({ signal: controller.signal });
    return () => controller.abort();
  }, [loadRequests]);

  useEffect(() => {
    if (!employeeEmail) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const raw = await fetchManagersForUser(employeeEmail, { signal: controller.signal });
        if (!controller.signal.aborted) setManagers(unwrapManagers(raw));
      } catch {
        if (!controller.signal.aborted) setManagers([]);
      }
    })();
    return () => controller.abort();
  }, [employeeEmail]);

  const selectedManagerSet = useMemo(
    () => new Set(draft.managers.map((m) => String(m).toLowerCase())),
    [draft.managers]
  );

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleManager(email) {
    const normalized = String(email || "").trim();
    if (!normalized) return;
    setDraft((prev) => {
      const exists = prev.managers.some((m) => m.toLowerCase() === normalized.toLowerCase());
      return {
        ...prev,
        managers: exists
          ? prev.managers.filter((m) => m.toLowerCase() !== normalized.toLowerCase())
          : [...prev.managers, normalized],
      };
    });
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!employeeEmail) {
      setToast({ title: "Missing email", message: "Your employee email is not available in the session." });
      return;
    }
    if (!draft.requestFromDate || !draft.requestToDate) {
      setToast({ title: "Dates required", message: "Choose both from and to dates." });
      return;
    }
    if (compOffNeedsManager && draft.managers.length === 0) {
      setToast({ title: "Manager required", message: "Select at least one manager for comp off." });
      return;
    }

    const payload = {
      employeeEmail,
      userRequestType: draft.userRequestType,
      requestFromDate: toWebtrakDate(draft.requestFromDate),
      requestToDate: toWebtrakDate(draft.requestToDate),
      comments: draft.comments.trim(),
      isHalfDay: Boolean(draft.isHalfDay),
      clientApproval: Boolean(draft.clientApproval),
      managers: draft.managers,
    };

    setSubmitting(true);
    try {
      await createUserRequest(payload, { file });
      setToast({ title: "Request submitted", message: `${draft.userRequestType.replace("_", " ")} request created.` });
      setFile(null);
      setDraft((prev) => ({ ...prev, comments: "", managers: [], clientApproval: false, isHalfDay: false }));
      await loadRequests();
    } catch (err) {
      setToast({ title: "Submit failed", message: err?.message || "Could not submit request." });
    } finally {
      setSubmitting(false);
    }
  }

  async function removeRequest(id) {
    if (!id) return;
    setDeletingId(id);
    try {
      await deleteUserRequest(id);
      setToast({ title: "Request deleted", message: `Request ${id} was removed.` });
      if (editDraft?.userRequestId === id) {
        setEditDraft(null);
        setUpdateFile(null);
      }
      await loadRequests();
    } catch (err) {
      setToast({ title: "Delete failed", message: err?.message || "Could not delete request." });
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(request) {
    const raw = request.raw && typeof request.raw === "object" ? request.raw : {};
    const mgrRaw = raw.managers ?? raw.managerEmails ?? [];
    const managersList = Array.isArray(mgrRaw)
      ? mgrRaw.map((m) => (typeof m === "string" ? m : String(m?.email ?? m?.managerEmail ?? "").trim())).filter(Boolean)
      : [];
    setEditDraft({
      userRequestId: request.id,
      userRequestType: request.requestType || "LEAVE",
      requestFromDate: request.requestFromDate ? fromWebtrakDate(request.requestFromDate) : todayInput(),
      requestToDate: request.requestToDate ? fromWebtrakDate(request.requestToDate) : todayInput(),
      comments: request.comments || "",
      isHalfDay: Boolean(raw.isHalfDay),
      clientApproval: Boolean(raw.clientApproval),
      managers: managersList,
    });
    setUpdateFile(null);
  }

  function updateEditDraft(key, value) {
    setEditDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function submitUpdate(event) {
    event.preventDefault();
    if (!editDraft?.userRequestId || !employeeEmail) {
      setToast({ title: "Cannot update", message: "Missing request id or employee email." });
      return;
    }
    if (!editDraft.requestFromDate || !editDraft.requestToDate) {
      setToast({ title: "Dates required", message: "Choose both from and to dates." });
      return;
    }
    const payload = {
      userRequestId: editDraft.userRequestId,
      employeeEmail,
      userRequestType: editDraft.userRequestType,
      requestFromDate: toWebtrakDate(editDraft.requestFromDate),
      requestToDate: toWebtrakDate(editDraft.requestToDate),
      comments: String(editDraft.comments || "").trim(),
      isHalfDay: Boolean(editDraft.isHalfDay),
      clientApproval: Boolean(editDraft.clientApproval),
      managers: editDraft.managers || [],
    };
    setUpdating(true);
    try {
      await updateUserRequest(payload, { file: updateFile });
      setToast({ title: "Request updated", message: "Your changes were saved." });
      setEditDraft(null);
      setUpdateFile(null);
      await loadRequests();
    } catch (err) {
      setToast({ title: "Update failed", message: err?.message || "Could not update request." });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rt-panel p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="rt-kicker">Leave Requests</div>
            <h2 className="mt-1 text-xl font-bold text-[rgb(var(--text))]">Create Request</h2>
          </div>
          <div className="hidden sm:grid h-10 w-10 place-items-center rounded-md bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">
            <Calendar size={18} />
          </div>
        </div>

        <form onSubmit={submitRequest} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Type</span>
              <select
                value={draft.userRequestType}
                onChange={(e) => updateDraft("userRequestType", e.target.value)}
                className="rt-input w-full px-3 py-2 text-sm"
              >
                {REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">From</span>
              <input
                type="date"
                value={draft.requestFromDate}
                onChange={(e) => updateDraft("requestFromDate", e.target.value)}
                className="rt-input w-full px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">To</span>
              <input
                type="date"
                value={draft.requestToDate}
                onChange={(e) => updateDraft("requestToDate", e.target.value)}
                className="rt-input w-full px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Comments</span>
            <textarea
              value={draft.comments}
              maxLength={200}
              onChange={(e) => updateDraft("comments", e.target.value)}
              className="rt-input min-h-[96px] w-full px-3 py-2 text-sm"
              placeholder="Add context for the approver"
            />
            <span className="mt-1 block text-right text-[11px] text-[rgb(var(--muted))]">{draft.comments.length}/200</span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isHalfDay}
                onChange={(e) => updateDraft("isHalfDay", e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--primary))]"
              />
              Half day
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.clientApproval}
                onChange={(e) => updateDraft("clientApproval", e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--primary))]"
              />
              Client approval received
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
              <FileUp size={16} />
              <span className="truncate">{file?.name || "Attach approval file"}</span>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {compOffNeedsManager ? (
            <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
              <div className="mb-2 text-xs font-semibold text-[rgb(var(--muted))]">Comp off approver</div>
              {managers.length ? (
                <div className="flex flex-wrap gap-2">
                  {managers.map((manager) => {
                    const selected = selectedManagerSet.has(manager.email.toLowerCase());
                    return (
                      <button
                        key={manager.email}
                        type="button"
                        onClick={() => toggleManager(manager.email)}
                        className={[
                          "rounded-md border px-3 py-2 text-left text-xs font-semibold transition-colors",
                          selected
                            ? "border-[rgb(var(--primary))]/40 bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]"
                            : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))]",
                        ].join(" ")}
                      >
                        {manager.name}
                        {manager.projectCode ? <span className="ml-1 font-mono text-[10px] opacity-70">{manager.projectCode}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-[rgb(var(--muted))]">No managers found for your active allocations.</div>
              )}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="rt-btn-primary rt-btn-sm">
              {submitting ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              Submit Request
            </button>
          </div>
        </form>
      </section>

      <section className="rt-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[rgb(var(--text))]">Request History</h2>
            {page.leaves != null ? (
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">Available leave balance: {page.leaves}</p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <select
              value={filters.requestType}
              onChange={(e) => setFilters((prev) => ({ ...prev, requestType: e.target.value }))}
              className="rt-input px-3 py-2 text-sm"
            >
              {REQUEST_TYPES.map((type) => (
                <option key={`filter-${type}`} value={type}>{type.replace("_", " ")}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className="rt-input px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className="rt-input px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => loadRequests()} disabled={loading} className="rt-btn-ghost rt-btn-sm">
              {loading ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-[rgb(var(--border))] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Comments</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {requestRows.map((request) => (
                <tr key={request.id || JSON.stringify(request.raw)} className="align-top">
                  <td className="px-3 py-3 font-mono text-xs">{request.id || "-"}</td>
                  <td className="px-3 py-3">{request.requestType || "-"}</td>
                  <td className="px-3 py-3">
                    {formatDisplayDate(request.requestFromDate)} to {formatDisplayDate(request.requestToDate)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md border border-[rgb(var(--border))] px-2 py-1 text-xs font-semibold">
                      {request.status || "-"}
                    </span>
                  </td>
                  <td className="max-w-sm px-3 py-3 text-[rgb(var(--muted))]">{request.comments || "-"}</td>
                  <td className="px-3 py-3 text-right">
                    {String(request.status || "").toUpperCase() === "PENDING" ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(request)}
                          className="rt-btn-ghost rt-btn-sm"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRequest(request.id)}
                          disabled={deletingId === request.id}
                          className="rt-btn-ghost rt-btn-sm"
                        >
                          {deletingId === request.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!loading && requestRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[rgb(var(--muted))]">
                    No requests found for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {editDraft ? (
          <form onSubmit={submitUpdate} className="mt-5 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[rgb(var(--text))]">Edit request #{editDraft.userRequestId}</h3>
              <button type="button" className="rt-btn-ghost rt-btn-sm" onClick={() => { setEditDraft(null); setUpdateFile(null); }}>
                Cancel
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Type</span>
                <select
                  value={editDraft.userRequestType}
                  onChange={(e) => updateEditDraft("userRequestType", e.target.value)}
                  className="rt-input w-full px-3 py-2 text-sm"
                >
                  {REQUEST_TYPES.map((type) => (
                    <option key={`edit-${type}`} value={type}>{type.replace("_", " ")}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">From</span>
                <input
                  type="date"
                  value={editDraft.requestFromDate}
                  onChange={(e) => updateEditDraft("requestFromDate", e.target.value)}
                  className="rt-input w-full px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">To</span>
                <input
                  type="date"
                  value={editDraft.requestToDate}
                  onChange={(e) => updateEditDraft("requestToDate", e.target.value)}
                  className="rt-input w-full px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Comments</span>
              <textarea
                value={editDraft.comments}
                maxLength={200}
                onChange={(e) => updateEditDraft("comments", e.target.value)}
                className="rt-input min-h-[80px] w-full px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editDraft.isHalfDay}
                  onChange={(e) => updateEditDraft("isHalfDay", e.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--primary))]"
                />
                Half day
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editDraft.clientApproval}
                  onChange={(e) => updateEditDraft("clientApproval", e.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--primary))]"
                />
                Client approval
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <FileUp size={14} />
                <span className="truncate">{updateFile?.name || "Replace attachment (optional)"}</span>
                <input type="file" className="sr-only" onChange={(e) => setUpdateFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={updating} className="rt-btn-primary rt-btn-sm">
                {updating ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                Save update
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} durationMs={2800} />
    </div>
  );
}
