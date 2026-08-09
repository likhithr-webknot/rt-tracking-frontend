// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, RotateCw, Search, Trash2 } from "lucide-react";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import ConfirmDialog from "../shared/ConfirmDialog";
import Toast from "../shared/Toast";
import ListPaginationBar from "../shared/ListPaginationBar";
import TableDensityToggle from "../shared/TableDensityToggle";
import { useTableDensity } from "../../hooks/useTableDensity";
import {
  ASSIGNABLE_APP_ROLES,
  createAppKey,
  formatAppRoleLabel,
  listAppKeys,
  resolveExpiresAt,
  revokeAppKey,
  rotateAppKey,
} from "../../api/apps";

const EXPIRY_PRESETS = [
  { value: "", label: "No expiry" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "custom", label: "Custom date…" },
];

function formatDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Super Admin Apps workspace — create / rotate / revoke WebTrak API keys (wtrt_… only).
 */
export default function AppsWorkspace() {
  const { density, setDensity } = useTableDensity();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [toast, setToast] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    expiryPreset: "",
    expiresAtDate: "",
    roles: ["ROLE_HR"],
  });

  const [revealKey, setRevealKey] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await listAppKeys({
        q: debouncedSearch,
        page,
        perPage: pageSize,
        signal,
      });
      if (signal?.aborted) return;
      setRows(result.data);
      setTotal(result.total);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err?.message || "Could not load Apps.");
      setRows([]);
      setTotal(0);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedSearch, page, pageSize]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
  const rangeLabel = useMemo(() => {
    if (!total) return "No apps";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}–${end} of ${total}`;
  }, [page, pageSize, total]);

  function openCreate() {
    setForm({
      name: "",
      description: "",
      expiryPreset: "",
      expiresAtDate: "",
      roles: ["ROLE_HR"],
    });
    setCreateError("");
    setCreateOpen(true);
  }

  function toggleRole(role) {
    setForm((prev) => {
      const has = prev.roles.includes(role);
      return {
        ...prev,
        roles: has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
      };
    });
  }

  async function handleCreate() {
    const name = form.name.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const expires_at = resolveExpiresAt({
        expiresAtDate: form.expiryPreset === "custom" ? form.expiresAtDate : "",
        expiresInDays: form.expiryPreset !== "custom" ? form.expiryPreset : "",
      });
      const created = await createAppKey({
        name,
        description: form.description.trim() || null,
        expires_at,
        roles: form.roles,
      });
      setCreateOpen(false);
      if (created.fullKey) setRevealKey(created.fullKey);
      setToast({ title: "App created", message: "Copy the key now — it won’t be shown again." });
      await load();
    } catch (err) {
      setCreateError(err?.message || "Could not create app key.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(app) {
    setBusyId(app.id);
    try {
      const rotated = await rotateAppKey(app.id);
      if (rotated.fullKey) setRevealKey(rotated.fullKey);
      setToast({ title: "Key rotated", message: `${app.name} — copy the new key now.` });
      await load();
    } catch (err) {
      setToast({ title: "Rotate failed", message: err?.message || "Could not rotate key." });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.id);
    try {
      await revokeAppKey(revokeTarget.id);
      setToast({ title: "App revoked", message: revokeTarget.name });
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setToast({ title: "Revoke failed", message: err?.message || "Could not revoke app." });
    } finally {
      setBusyId(null);
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(revealKey);
      setToast({ title: "Copied", message: "API key copied to clipboard." });
    } catch {
      setToast({ title: "Copy failed", message: "Select the key and copy manually." });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  if (loading && !rows.length && !error) {
    return (
      <AdminPageShell>
        <AdminPageHeader
          title="Apps"
          subtitle="Create and rotate WebTrak application API keys (wtrt_…). Keys are shown once."
          sectionLabel="More tools"
        />
        <div className="rt-panel flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
          Loading apps…
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Apps"
        subtitle="Create and rotate WebTrak application API keys (wtrt_…). Keys are shown once."
        sectionLabel="More tools"
      >
        <button type="button" className="rt-btn-primary gap-1.5" onClick={openCreate}>
          <Plus size={15} />
          Create app
        </button>
      </AdminPageHeader>

      <div className="rt-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <label className="relative block min-w-[12rem] max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps…"
            className="rt-input w-full pl-9"
          />
        </label>
        <TableDensityToggle value={density} onChange={setDensity} />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rt-panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={18} className="animate-spin" />
            Loading apps…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table
                className={[
                  "rt-data-table min-w-[720px]",
                  density === "comfortable" ? "rt-data-table--comfortable" : "rt-data-table--default",
                ].join(" ")}
              >
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Roles</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((app) => (
                      <tr key={app.id}>
                        <td>
                          <div className="font-semibold text-[rgb(var(--text))]">{app.name}</div>
                          {app.description ? (
                            <div className="text-xs text-[rgb(var(--muted))] line-clamp-1">{app.description}</div>
                          ) : null}
                        </td>
                        <td className="font-mono text-xs text-[rgb(var(--muted))]">
                          {app.keyPrefix || "—"}…
                        </td>
                        <td className="text-xs text-[rgb(var(--muted))]">
                          {app.roles.length
                            ? app.roles.map(formatAppRoleLabel).join(", ")
                            : "—"}
                        </td>
                        <td className="text-xs text-[rgb(var(--muted))]">
                          {formatDate(app.expiresAt)}
                        </td>
                        <td>
                          <span
                            className={[
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              app.isActive
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "border-[rgb(var(--border))] text-[rgb(var(--muted))]",
                            ].join(" ")}
                          >
                            {app.isActive ? "Active" : "Revoked"}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              className="rt-btn-ghost h-8 px-2 text-xs"
                              disabled={!app.isActive || busyId === app.id}
                              title="Rotate key"
                              onClick={() => handleRotate(app)}
                            >
                              {busyId === app.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RotateCw size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="rt-btn-ghost h-8 px-2 text-xs text-red-600 dark:text-red-300"
                              disabled={!app.isActive || busyId === app.id}
                              title="Revoke"
                              onClick={() => setRevokeTarget(app)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-sm text-[rgb(var(--muted))]">
                        <KeyRound size={28} className="mx-auto mb-3 opacity-40" />
                        No apps yet. Create one to issue a WebTrak API key.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {total > 0 ? (
              <ListPaginationBar
                rangeLabel={rangeLabel}
                page={page}
                maxPage={maxPage}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50]}
                loading={loading}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            ) : null}
          </>
        )}
      </div>

      <ModalOverlay
        open={createOpen}
        onClose={creating ? undefined : () => setCreateOpen(false)}
        maxWidth="max-w-lg"
        title="Create app"
        subtitle="Issue a new WebTrak bearer key (wtrt_…). The full value is shown once."
      >
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-[rgb(var(--muted))]">
            Name
            <input
              className="rt-input mt-1 w-full text-sm font-normal"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Pulse sync"
            />
          </label>
          <label className="block text-xs font-semibold text-[rgb(var(--muted))]">
            Description
            <textarea
              className="rt-input mt-1 w-full text-sm font-normal min-h-[4.5rem]"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="What is this key used for?"
            />
          </label>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[rgb(var(--muted))]">
              Expiration
              <select
                className="rt-input mt-1 w-full text-sm font-normal"
                value={form.expiryPreset}
                onChange={(e) => setForm((p) => ({ ...p, expiryPreset: e.target.value }))}
              >
                {EXPIRY_PRESETS.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {form.expiryPreset === "custom" ? (
              <label className="block text-xs font-semibold text-[rgb(var(--muted))]">
                Expires on
                <input
                  type="date"
                  min={today}
                  className="rt-input mt-1 w-full text-sm font-normal"
                  value={form.expiresAtDate}
                  onChange={(e) => setForm((p) => ({ ...p, expiresAtDate: e.target.value }))}
                />
              </label>
            ) : null}
          </div>
          <div>
            <div className="text-xs font-semibold text-[rgb(var(--muted))] mb-2">Roles</div>
            <p className="mb-2 text-[11px] text-[rgb(var(--muted))]">
              Grant only what this key needs. ROLE_ADMIN cannot be assigned to app keys.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ASSIGNABLE_APP_ROLES.map((role) => {
                const checked = form.roles.includes(role);
                return (
                  <label
                    key={role}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role)}
                      className="rounded border-[rgb(var(--border))]"
                    />
                    {formatAppRoleLabel(role)}
                  </label>
                );
              })}
            </div>
          </div>
          {createError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {createError}
            </div>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              className="rt-btn-ghost"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button type="button" className="rt-btn-primary" disabled={creating} onClick={handleCreate}>
              {creating ? "Creating…" : "Create"}
            </button>
          </DialogFooter>
        </div>
      </ModalOverlay>

      <ModalOverlay
        open={Boolean(revealKey)}
        onClose={() => setRevealKey("")}
        maxWidth="max-w-lg"
        title="Copy your API key"
        subtitle="This is the only time the full key is shown. Store it securely."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 font-mono text-xs break-all text-[rgb(var(--text))]">
            {revealKey}
          </div>
          <DialogFooter>
            <button type="button" className="rt-btn-ghost" onClick={() => setRevealKey("")}>
              Done
            </button>
            <button type="button" className="rt-btn-primary gap-1.5" onClick={copyKey}>
              <Copy size={14} />
              Copy key
            </button>
          </DialogFooter>
        </div>
      </ModalOverlay>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke app?"
        message={
          revokeTarget
            ? `Revoke “${revokeTarget.name}”? The current key will stop working immediately.`
            : "Revoke this app?"
        }
        confirmText="Revoke"
        cancelText="Cancel"
        confirmVariant="danger"
        busy={busyId === revokeTarget?.id}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={confirmRevoke}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
