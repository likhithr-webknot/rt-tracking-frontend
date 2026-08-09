// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Search, Share2, ShieldOff, Users, UsersRound, X } from "lucide-react";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import { fetchDriveShareProjects, revokeDriveShare, searchDriveUsers, shareDriveFile } from "../../api/webknot-drive";

const SHARE_MODES = [
  { id: "INDIVIDUALS", label: "Specific people", hint: "Search and pick employees one by one." },
  { id: "ALL_EMPLOYEES", label: "All employees", hint: "Every active employee in the directory." },
  { id: "PROJECT", label: "Project team", hint: "Everyone with an active allocation on the project." },
];

function normalizeShared(row) {
  if (!row || typeof row !== "object") return null;
  const email = String(row.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    name: String(row.name ?? "").trim(),
    empId: String(row.empId ?? "").trim(),
    permission: String(row.permission ?? "view").trim() || "view",
    shareScope: String(row.shareScope ?? "").trim(),
    projectCode: String(row.projectCode ?? "").trim(),
  };
}

export default function DriveShareModal({ file, open, onClose, onShared, showToast }) {
  const [shareMode, setShareMode] = useState("INDIVIDUALS");
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectCode, setProjectCode] = useState("");

  const fileId = file?.id;

  useEffect(() => {
    if (!open || !file) return;
    const rows = (Array.isArray(file.sharedWith) ? file.sharedWith : [])
      .map(normalizeShared)
      .filter(Boolean);
    setAccessList(rows);
    setPendingUsers([]);
    setUserQuery("");
    setUserHits([]);
    setShareMode("INDIVIDUALS");
    setProjectCode("");
  }, [open, file, file?.sharedWith]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setProjectsLoading(true);
    fetchDriveShareProjects()
      .then((list) => {
        if (!alive) return;
        setProjects(Array.isArray(list) ? list.filter((p) => p.active !== false) : []);
      })
      .catch(() => {
        if (alive) setProjects([]);
      })
      .finally(() => {
        if (alive) setProjectsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const existingEmails = useMemo(
    () => new Set(accessList.map((u) => u.email)),
    [accessList],
  );

  const canConfirmGroup =
    shareMode === "ALL_EMPLOYEES" ||
    (shareMode === "PROJECT" && String(projectCode).trim()) ||
    (shareMode === "INDIVIDUALS" && pendingUsers.length > 0);

  useEffect(() => {
    if (!open || shareMode !== "INDIVIDUALS") return;
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserHits([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      setUserSearchBusy(true);
      try {
        const hits = await searchDriveUsers(q);
        if (alive) {
          setUserHits(
            hits.filter((u) => {
              const email = String(u?.email ?? "").trim().toLowerCase();
              return email && !existingEmails.has(email) && !pendingUsers.some((p) => p.email === email);
            }),
          );
        }
      } catch {
        if (alive) setUserHits([]);
      } finally {
        if (alive) setUserSearchBusy(false);
      }
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [userQuery, open, existingEmails, pendingUsers, shareMode]);

  function applyShareResult(res, fallbackCount) {
    const updated = res?.file?.sharedWith ?? res?.data?.file?.sharedWith;
    if (Array.isArray(updated)) {
      setAccessList(updated.map(normalizeShared).filter(Boolean));
    }
    setPendingUsers([]);
    showToast?.({
      title: "Access granted",
      message:
        fallbackCount != null
          ? `Shared with ${fallbackCount} ${fallbackCount === 1 ? "person" : "people"}.`
          : "Share list updated.",
    });
    onShared?.();
  }

  async function confirmShare() {
    if (!fileId || !canConfirmGroup) return;
    setShareBusy(true);
    try {
      if (shareMode === "INDIVIDUALS") {
        const res = await shareDriveFile({ fileId, shareScope: "INDIVIDUALS", shareWith: pendingUsers });
        applyShareResult(res, pendingUsers.length);
        return;
      }
      if (shareMode === "ALL_EMPLOYEES") {
        const res = await shareDriveFile({ fileId, shareScope: "ALL_EMPLOYEES", shareWith: [] });
        const count = Array.isArray(res?.file?.sharedWith) ? res.file.sharedWith.length : accessList.length;
        applyShareResult(res, count);
        return;
      }
      const code = String(projectCode).trim();
      const res = await shareDriveFile({
        fileId,
        shareScope: "PROJECT",
        projectCode: code,
        shareWith: [],
      });
      const count = Array.isArray(res?.file?.sharedWith) ? res.file.sharedWith.length : undefined;
      applyShareResult(res, count);
    } catch (err) {
      showToast?.({ title: "Share failed", message: err?.message, tone: "error" });
    } finally {
      setShareBusy(false);
    }
  }

  async function handleRevoke(user) {
    if (!fileId || !user?.email) return;
    setRevokingEmail(user.email);
    try {
      await revokeDriveShare({ fileId, email: user.email });
      setAccessList((prev) => prev.filter((u) => u.email !== user.email));
      showToast?.({
        title: "Access revoked",
        message: `${user.name || user.email} can no longer open this file.`,
      });
      onShared?.();
    } catch (err) {
      showToast?.({ title: "Revoke failed", message: err?.message, tone: "error" });
    } finally {
      setRevokingEmail("");
    }
  }

  const confirmLabel =
    shareMode === "ALL_EMPLOYEES"
      ? "Share with all employees"
      : shareMode === "PROJECT"
        ? "Share with project team"
        : shareBusy
          ? "Sharing…"
          : `Grant access${pendingUsers.length ? ` (${pendingUsers.length})` : ""}`;

  return (
    <ModalOverlay
      open={open && Boolean(file)}
      onClose={onClose}
      maxWidth="max-w-xl"
      zIndex={120}
      title="Manage access"
      subtitle={
        file?.name
          ? `${file.name} — share with individuals, all employees, or a project team.`
          : "Share with individuals, all employees, or a project team."
      }
      footer={
        <>
          <button type="button" className="rt-btn-ghost" onClick={onClose} disabled={shareBusy}>
            Done
          </button>
          <button
            type="button"
            className="rt-btn-primary inline-flex items-center gap-2"
            disabled={!canConfirmGroup || shareBusy}
            onClick={confirmShare}
          >
            {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            {shareBusy ? "Sharing…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-6 -mt-1 max-h-[min(70vh,560px)] overflow-y-auto custom-scrollbar pr-1">
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              People with access
            </h3>
            <span className="rt-badge rt-badge--neutral text-[10px]">{accessList.length}</span>
          </div>
          {accessList.length ? (
            <ul className="max-h-44 overflow-auto custom-scrollbar border border-[rgb(var(--border))] rounded-lg divide-y divide-[rgb(var(--border))]">
              {accessList.map((u) => (
                <li
                  key={u.email}
                  className="flex items-center gap-3 px-3 py-2.5 bg-[rgb(var(--surface))] hover:bg-[rgb(var(--surface-2))]/50"
                >
                  <div className="h-8 w-8 rounded-full bg-[rgb(var(--surface-2))] flex items-center justify-center shrink-0">
                    <Users size={14} className="text-[rgb(var(--muted))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                    <div className="text-xs text-[rgb(var(--muted))] truncate">
                      {u.email}
                      {u.empId ? ` · ${u.empId}` : ""}
                      {u.shareScope === "ALL_EMPLOYEES" ? " · all employees" : ""}
                      {u.shareScope === "PROJECT" && u.projectCode ? ` · project ${u.projectCode}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rt-btn-soft text-xs inline-flex items-center gap-1 text-[rgb(var(--danger))] shrink-0"
                    disabled={revokingEmail === u.email || shareBusy}
                    onClick={() => handleRevoke(u)}
                  >
                    {revokingEmail === u.email ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ShieldOff size={12} />
                    )}
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[rgb(var(--muted))] rounded-lg border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center">
              Not shared yet. Choose a group or add people below.
            </p>
          )}
        </section>

        <section className="pt-2 border-t border-[rgb(var(--border))] space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
            Share with
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SHARE_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={[
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  shareMode === mode.id
                    ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/10"
                    : "border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]",
                ].join(" ")}
                onClick={() => setShareMode(mode.id)}
              >
                <span className="font-medium block">{mode.label}</span>
                <span className="text-[10px] text-[rgb(var(--muted))] mt-0.5 block">{mode.hint}</span>
              </button>
            ))}
          </div>

          {shareMode === "ALL_EMPLOYEES" ? (
            <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/40 px-4 py-4 flex gap-3">
              <UsersRound size={20} className="text-[rgb(var(--primary))] shrink-0 mt-0.5" />
              <p className="text-sm text-[rgb(var(--muted))]">
                Grants view access to every <strong className="text-[rgb(var(--text))]">active</strong> employee.
                Existing shares are kept; new people are merged into the list.
              </p>
            </div>
          ) : null}

          {shareMode === "PROJECT" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[rgb(var(--muted))] flex items-center gap-1.5">
                <Building2 size={14} /> Project
              </label>
              <select
                className="rt-input w-full"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                disabled={projectsLoading || shareBusy}
              >
                <option value="">
                  {projectsLoading ? "Loading projects…" : "Select a project"}
                </option>
                {projects.map((p) => (
                  <option key={p.id || p.code} value={String(p.code || "").trim()}>
                    {p.code ? `${p.code} — ` : ""}
                    {p.name || p.code}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[rgb(var(--muted))]">
                Includes employees with an active allocation on this project.
              </p>
            </div>
          ) : null}

          {shareMode === "INDIVIDUALS" ? (
            <>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]"
                  size={16}
                />
                <input
                  className="rt-input w-full pl-10"
                  placeholder="Search by name, email, or employee ID…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </div>

              {userSearchBusy ? (
                <div className="text-xs text-[rgb(var(--muted))] flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </div>
              ) : null}

              {userHits.length ? (
                <ul className="max-h-36 overflow-auto custom-scrollbar border border-[rgb(var(--border))] rounded-lg divide-y divide-[rgb(var(--border))]">
                  {userHits.map((u) => (
                    <li key={`${u.email}-${u.empId}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-[rgb(var(--surface-2))] transition-colors"
                        onClick={() => {
                          const email = String(u.email ?? "").trim().toLowerCase();
                          if (!email || existingEmails.has(email)) return;
                          if (pendingUsers.some((p) => p.email === email)) return;
                          setPendingUsers((prev) => [...prev, { ...u, email, permission: "view" }]);
                          setUserQuery("");
                          setUserHits([]);
                        }}
                      >
                        <div className="font-medium">{u.name || u.email}</div>
                        <div className="text-xs text-[rgb(var(--muted))]">
                          {u.email}
                          {u.empId ? ` · ${u.empId}` : ""}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : userQuery.trim().length >= 2 && !userSearchBusy ? (
                <p className="text-xs text-[rgb(var(--muted))] text-center py-3">No people found.</p>
              ) : null}

              {pendingUsers.length ? (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))] mb-2">
                    Ready to grant
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingUsers.map((u) => (
                      <span
                        key={u.email}
                        className="rt-badge rt-badge--primary inline-flex items-center gap-1.5 py-1"
                      >
                        {u.name || u.email}
                        <button
                          type="button"
                          className="opacity-80 hover:opacity-100"
                          aria-label={`Remove ${u.email}`}
                          onClick={() =>
                            setPendingUsers((prev) => prev.filter((x) => x.email !== u.email))
                          }
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </ModalOverlay>
  );
}
