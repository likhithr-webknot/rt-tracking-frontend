// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, User } from "lucide-react";
import ModalOverlay from "./ModalOverlay";
import { fetchEmployeeProfile } from "../../api/user";

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function unwrapProfilePayload(raw) {
  if (!raw || typeof raw !== "object") return {};
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  if (data.profile && typeof data.profile === "object") return data.profile;
  if (data.employee && typeof data.employee === "object") return data.employee;
  if (data.user && typeof data.user === "object") return data.user;
  return data;
}

function ProfileField({ label, value, mono = false }) {
  const text = String(value ?? "").trim() || "—";
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 py-3 border-b border-[rgb(var(--border))]/80 last:border-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] shrink-0">
        {label}
      </dt>
      <dd
        className={[
          "text-sm text-[rgb(var(--text))] text-left sm:text-right break-words",
          mono ? "font-mono text-xs" : "font-medium",
        ].join(" ")}
      >
        {text}
      </dd>
    </div>
  );
}

export default function UserProfileModal({ open, onClose, auth }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remote, setRemote] = useState(null);

  const claims = auth?.claims && typeof auth.claims === "object" ? auth.claims : {};

  const displayName = firstNonEmpty(
    auth?.employeeName,
    auth?.name,
    claims?.name,
    claims?.given_name && claims?.family_name ? `${claims.given_name} ${claims.family_name}` : "",
    claims?.given_name,
    remote?.name,
    remote?.employeeName,
  );

  const email = firstNonEmpty(auth?.email, claims?.email, claims?.preferred_username, remote?.email);
  const avatarUrl = firstNonEmpty(
    auth?.picture,
    auth?.avatarUrl,
    auth?.avatar,
    claims?.picture,
    remote?.picture,
  );
  const role = firstNonEmpty(auth?.role, auth?.portal, remote?.role, remote?.empRole);
  const empId = firstNonEmpty(auth?.employeeId, remote?.empId, remote?.employeeId);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRemote(null);

    (async () => {
      try {
        const raw = await fetchEmployeeProfile({
          empId: empId || null,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setRemote(unwrapProfilePayload(raw));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err?.message || "Could not load full profile.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, empId]);

  const profile = useMemo(() => {
    const r = remote && typeof remote === "object" ? remote : {};
    return {
      name: displayName,
      email,
      role: firstNonEmpty(role, r.role, r.empRole, r.userRole),
      empId: firstNonEmpty(empId, r.empId, r.employeeId),
      band: firstNonEmpty(auth?.band, r.band, r.bandName, r.level),
      stream: firstNonEmpty(auth?.stream, r.department, r.stream, r.context),
      designation: firstNonEmpty(auth?.designation, r.designation, r.title, r.jobTitle),
      phone: firstNonEmpty(r.phoneNumber, r.phone, r.mobile),
      status: firstNonEmpty(r.userStatus, r.status),
      workMode: firstNonEmpty(r.workMode, r.work_mode),
      userType: firstNonEmpty(r.userType, r.user_type, r.type),
      manager: firstNonEmpty(r.primaryManager, r.managerName, r.manager),
    };
  }, [auth?.band, auth?.designation, auth?.stream, displayName, email, empId, remote, role]);

  const initials = useMemo(() => {
    const n = profile.name;
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
    if (profile.email) return profile.email.replace(/@.*/, "").slice(0, 2).toUpperCase();
    return "?";
  }, [profile.email, profile.name]);

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      maxWidth="max-w-lg"
      zIndex={90}
      header={
        <div>
          <h3 className="rt-section-title">My profile</h3>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">Your account details from Webknot Pulse.</p>
        </div>
      }
    >
      <div className="space-y-5 -mt-1">
        <div className="flex items-center gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/60 p-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-xl object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary-soft))] text-lg font-bold text-[rgb(var(--primary))]"
              aria-hidden
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold tracking-tight text-[rgb(var(--text))] truncate">
              {profile.name || profile.email || "User"}
            </div>
            {profile.email ? (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-[rgb(var(--muted))] truncate">
                <Mail size={14} className="shrink-0" />
                <span className="truncate">{profile.email}</span>
              </div>
            ) : null}
            {profile.role ? (
              <span className="mt-2 inline-flex items-center rounded-md bg-[rgb(var(--primary-soft))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary))]">
                {profile.role}
              </span>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={18} className="animate-spin" />
            Loading profile…
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-100">
            {error} Showing details from your sign-in session.
          </p>
        ) : null}

        <dl className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4">
          <ProfileField label="Employee ID" value={profile.empId} mono />
          <ProfileField label="Email" value={profile.email} />
          <ProfileField label="Role" value={profile.role} />
          <ProfileField label="Band" value={profile.band} />
          <ProfileField label="Department" value={profile.stream} />
          <ProfileField label="Designation" value={profile.designation} />
          <ProfileField label="Work mode" value={profile.workMode} />
          <ProfileField label="User type" value={profile.userType} />
          <ProfileField label="Status" value={profile.status} />
          <ProfileField label="Phone" value={profile.phone} />
          <ProfileField label="Primary manager" value={profile.manager} />
        </dl>

        <p className="text-[11px] text-[rgb(var(--muted))] leading-relaxed flex items-start gap-2">
          <User size={14} className="shrink-0 mt-0.5" />
          To update HR records (band, department, etc.), contact your administrator or HR at{" "}
          <span className="font-mono text-[rgb(var(--text))]">hr@webknot.in</span>.
        </p>

        <div className="flex justify-end pt-1">
          <button type="button" onClick={onClose} className="rt-btn-primary">
            Done
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
