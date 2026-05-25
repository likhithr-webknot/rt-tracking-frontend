// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Share2, ShieldOff, Users, X } from "lucide-react";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import { revokeDriveShare, searchDriveUsers, shareDriveFile } from "../../api/webknot-drive";

function normalizeShared(row) {
  if (!row || typeof row !== "object") return null;
  const email = String(row.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    name: String(row.name ?? "").trim(),
    empId: String(row.empId ?? "").trim(),
    permission: String(row.permission ?? "view").trim() || "view",
  };
}

export default function DriveShareModal({ file, open, onClose, onShared, showToast }) {
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState("");

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
  }, [open, file, file?.sharedWith]);

  const existingEmails = useMemo(
    () => new Set(accessList.map((u) => u.email)),
    [accessList],
  );

  useEffect(() => {
    if (!open) return;
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
  }, [userQuery, open, existingEmails, pendingUsers]);

  async function confirmShare() {
    if (!fileId || !pendingUsers.length) return;
    setShareBusy(true);
    try {
      const res = await shareDriveFile({ fileId, shareWith: pendingUsers });
      const updated = res?.file?.sharedWith ?? res?.data?.file?.sharedWith;
      if (Array.isArray(updated)) {
        setAccessList(updated.map(normalizeShared).filter(Boolean));
      } else {
        setAccessList((prev) => {
          const map = new Map(prev.map((u) => [u.email, u]));
          for (const u of pendingUsers) {
            const email = String(u.email ?? "").trim().toLowerCase();
            if (email) map.set(email, { ...u, email, permission: u.permission || "view" });
          }
          return [...map.values()];
        });
      }
      setPendingUsers([]);
      showToast?.({
        title: "Access granted",
        message: `Shared with ${pendingUsers.length} ${pendingUsers.length === 1 ? "person" : "people"}.`,
      });
      onShared?.();
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

  return (
    <ModalOverlay
      open={open && Boolean(file)}
      onClose={onClose}
      maxWidth="max-w-xl"
      zIndex={120}
      title="Manage access"
      subtitle={
        file?.name
          ? `${file.name} — only people listed below can open this file.`
          : "Only people listed below can open this file."
      }
      footer={
        <>
          <button type="button" className="rt-btn-ghost" onClick={onClose} disabled={shareBusy}>
            Done
          </button>
          <button
            type="button"
            className="rt-btn-primary inline-flex items-center gap-2"
            disabled={!pendingUsers.length || shareBusy}
            onClick={confirmShare}
          >
            {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            {shareBusy ? "Sharing…" : `Grant access${pendingUsers.length ? ` (${pendingUsers.length})` : ""}`}
          </button>
        </>
      }
    >
      <div className="space-y-6 -mt-1">
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              People with access
            </h3>
            <span className="rt-badge rt-badge--neutral text-[10px]">{accessList.length}</span>
          </div>
          {accessList.length ? (
            <ul className="border border-[rgb(var(--border))] rounded-lg divide-y divide-[rgb(var(--border))] overflow-hidden">
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
                      {u.permission ? ` · ${u.permission}` : ""}
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
              Not shared with anyone yet. Add people below.
            </p>
          )}
        </section>

        <section className="pt-2 border-t border-[rgb(var(--border))]">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))] mb-3">
            Add people
          </h3>
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
            <div className="text-xs text-[rgb(var(--muted))] flex items-center gap-2 mt-3">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          ) : null}

          {userHits.length ? (
            <ul className="max-h-40 overflow-auto custom-scrollbar border border-[rgb(var(--border))] rounded-lg divide-y divide-[rgb(var(--border))] mt-3">
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
            <p className="text-xs text-[rgb(var(--muted))] text-center py-4">No people found.</p>
          ) : null}

          {pendingUsers.length ? (
            <div className="mt-3">
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
        </section>
      </div>
    </ModalOverlay>
  );
}
