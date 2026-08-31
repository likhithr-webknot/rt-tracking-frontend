// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, Loader2, Lock } from "lucide-react";
import { fetchNormalizedProfile } from "../../api/user";
import { fetchUserAllocationDetail } from "../../api/allocations";
import {
  displayOrDash,
  formatProfileDate,
  formatUserTypeHistory,
} from "../../api/webtrakEmployeeProfile";
import { formatEmployeeBandCode } from "../../api/band-stream-directory";
import { resolveWebtrakProfilePhotoUrl } from "../../api/webtrak";
import { resolveDisplayAvatar } from "../../utils/avatarPrefs";
import { toUserFacingMessage } from "../../utils/userFacingError";

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function ReadOnlyField({ label, value, mono = false }) {
  const text = displayOrDash(value);
  return (
    <div className="py-3 border-b border-[rgb(var(--border))] last:border-0 sm:grid sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-medium text-[rgb(var(--muted))] uppercase tracking-wide">{label}</dt>
      <dd
        className={[
          "mt-0.5 sm:mt-0 text-sm font-medium text-[rgb(var(--text))] break-words",
          mono ? "font-mono text-xs" : "",
        ].join(" ")}
      >
        {text}
      </dd>
    </div>
  );
}

function formatPortalRoles(roles) {
  if (!Array.isArray(roles) || !roles.length) return "—";
  return roles
    .map((r) =>
      String(r ?? "")
        .trim()
        .replace(/^ROLE_/i, "")
        .replace(/_/g, " "),
    )
    .filter(Boolean)
    .join(", ");
}

function AllocationTable({ rows, emptyLabel }) {
  if (!rows?.length) {
    return (
      <p className="text-sm text-[rgb(var(--muted))] py-2">{emptyLabel}</p>
    );
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
            <th className="py-2 pr-3 font-semibold">Project</th>
            <th className="py-2 pr-3 font-semibold">Role</th>
            <th className="py-2 pr-3 font-semibold">Allocation</th>
            <th className="py-2 pr-3 font-semibold">Period</th>
            <th className="py-2 pr-3 font-semibold">Type</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--border))]">
          {rows.map((row) => (
            <tr key={row.id} className="text-[rgb(var(--text))]">
              <td className="py-3 pr-3 align-top">
                <div className="font-medium">{row.projectName}</div>
                {row.projectCode ? (
                  <div className="text-[11px] text-[rgb(var(--muted))] font-mono mt-0.5">{row.projectCode}</div>
                ) : null}
              </td>
              <td className="py-3 pr-3 align-top">{displayOrDash(row.role)}</td>
              <td className="py-3 pr-3 align-top whitespace-nowrap">
                {row.allocatedPercent > 0 ? `${row.allocatedPercent}%` : "—"}
                {row.allocatedHours > 0 ? (
                  <span className="text-[11px] text-[rgb(var(--muted))] block">{row.allocatedHours}h/day</span>
                ) : null}
              </td>
              <td className="py-3 pr-3 align-top whitespace-nowrap text-xs">
                {formatProfileDate(row.startDate)}
                {row.endDate ? ` → ${formatProfileDate(row.endDate)}` : ""}
              </td>
              <td className="py-3 pr-3 align-top text-xs">{displayOrDash(row.allocationType)}</td>
              <td className="py-3 align-top">
                <span
                  className={[
                    "inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                    row.isActive
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]",
                  ].join(" ")}
                >
                  {row.isActive ? "Active" : "Past"}
                </span>
                {row.billingStatus ? (
                  <span className="block text-[10px] text-[rgb(var(--muted))] mt-1">{row.billingStatus}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UserProfilePage({ auth, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [allocations, setAllocations] = useState(null);
  const [allocationsLoading, setAllocationsLoading] = useState(true);

  const email = firstNonEmpty(auth?.email, auth?.claims?.email, profile?.email);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [normalized, allocationDetail] = await Promise.all([
          fetchNormalizedProfile({ signal: controller.signal }),
          fetchUserAllocationDetail({ signal: controller.signal }).catch(() => null),
        ]);
        if (!mounted) return;
        setProfile(normalized);
        setAllocations(allocationDetail);
      } catch (err) {
        if (!mounted || err?.name === "AbortError") return;
        setError(toUserFacingMessage(err?.message, "Could not load profile. Please try again."));
      } finally {
        if (mounted) {
          setLoading(false);
          setAllocationsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [email]);

  const displayName = firstNonEmpty(profile?.name, auth?.employeeName, auth?.name, email);
  const bandLabel = formatEmployeeBandCode(profile?.band) || profile?.band || "";
  const subtitleParts = [bandLabel, profile?.designation, profile?.department].filter(Boolean);

  const avatarDisplay = useMemo(() => {
    const photoUrl = resolveWebtrakProfilePhotoUrl(profile?.profilePhoto);
    return resolveDisplayAvatar(email, {
      profilePic: photoUrl,
      picture: auth?.picture,
      avatarUrl: auth?.avatarUrl,
    });
  }, [auth?.avatarUrl, auth?.picture, email, profile?.profilePhoto]);

  return (
    <div className="linear-page max-w-3xl mx-auto w-full min-w-0 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="linear-btn-ghost mb-6 -ml-1 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <header className="linear-card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="linear-avatar-ring h-20 w-20 shrink-0 overflow-hidden">
            {avatarDisplay.type === "image" && avatarDisplay.value ? (
              <img src={avatarDisplay.value} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-[rgb(var(--muted))]">
                {(displayName || email || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="linear-kicker">Employee profile</p>
            <h1 className="linear-title mt-0.5 truncate">{displayName || "Your profile"}</h1>
            <p className="linear-subtitle mt-1 truncate">{profile?.email || email}</p>
            {subtitleParts.length ? (
              <span className="linear-badge mt-2">{subtitleParts.join(" · ")}</span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="linear-callout linear-callout--warn mb-6 text-sm">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))] mb-6">
          <Loader2 size={16} className="animate-spin" />
          Loading profile…
        </div>
      ) : null}

      {!loading && profile ? (
        <>
          <section className="linear-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={14} className="text-[rgb(var(--muted))]" />
              <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Contact</h2>
            </div>
            <p className="text-xs text-[rgb(var(--muted))] mb-4">
              Sourced from WebTrak — contact HR to update these details.
            </p>
            <dl>
              <ReadOnlyField label="Employee ID" value={profile.empId} mono />
              <ReadOnlyField label="Work email" value={profile.email} />
              <ReadOnlyField label="Personal email" value={profile.personalEmail} />
              <ReadOnlyField label="Phone" value={profile.phone} />
            </dl>
          </section>

          <section className="linear-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={14} className="text-[rgb(var(--muted))]" />
              <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Employment</h2>
            </div>
            <p className="text-xs text-[rgb(var(--muted))] mb-4">Read-only — maintained in WebTrak.</p>
            <dl>
              <ReadOnlyField label="Designation" value={profile.designation} />
              <ReadOnlyField label="Band" value={bandLabel || profile.band} />
              <ReadOnlyField label="Department" value={profile.department} />
              <ReadOnlyField label="Status" value={profile.status} />
              <ReadOnlyField label="User type" value={profile.userType} />
              <ReadOnlyField label="Category" value={profile.category} />
              <ReadOnlyField label="Work mode" value={profile.workMode} />
              <ReadOnlyField label="Work location" value={profile.workLocation} />
              <ReadOnlyField label="Date of joining" value={formatProfileDate(profile.doj)} />
              {profile.doi ? (
                <ReadOnlyField label="Internship start" value={formatProfileDate(profile.doi)} />
              ) : null}
              <ReadOnlyField label="Webknot experience" value={profile.webknotExperience} />
              <ReadOnlyField label="Total experience" value={profile.totalExperience} />
              <ReadOnlyField label="Reporting manager" value={profile.reportingManager} />
              <ReadOnlyField label="Portal roles" value={formatPortalRoles(profile.portalRoles)} />
              {profile.userTypeTransitions?.length ? (
                <ReadOnlyField
                  label="User type history"
                  value={formatUserTypeHistory(profile.userTypeTransitions)}
                />
              ) : null}
            </dl>
          </section>

          <section className="linear-card p-6 mb-6">
            <h2 className="text-sm font-semibold text-[rgb(var(--text))] mb-4">Skills</h2>
            <dl>
              <ReadOnlyField label="Primary skills" value={profile.primarySkills} />
              <ReadOnlyField label="Secondary skills" value={profile.secondarySkills} />
            </dl>
          </section>

          <section className="linear-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={14} className="text-[rgb(var(--muted))]" />
              <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Project allocations</h2>
            </div>
            <p className="text-xs text-[rgb(var(--muted))] mb-4">
              Current and past project assignments from WebTrak.
            </p>
            {allocationsLoading ? (
              <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))] py-2">
                <Loader2 size={14} className="animate-spin" />
                Loading allocations…
              </div>
            ) : (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))] mb-2">
                  Current projects
                </h3>
                <AllocationTable
                  rows={allocations?.currentProjects}
                  emptyLabel="No active project allocations."
                />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))] mt-6 mb-2">
                  History
                </h3>
                <AllocationTable
                  rows={allocations?.history}
                  emptyLabel="No allocation history on file."
                />
              </>
            )}
          </section>

          {(profile.gender ||
            profile.maritalStatus ||
            profile.localAddress ||
            profile.permanentAddress ||
            profile.panOnFile) ? (
            <section className="linear-card p-6">
              <h2 className="text-sm font-semibold text-[rgb(var(--text))] mb-4">Additional details</h2>
              <dl>
                {profile.gender ? <ReadOnlyField label="Gender" value={profile.gender} /> : null}
                {profile.maritalStatus ? (
                  <ReadOnlyField label="Marital status" value={profile.maritalStatus} />
                ) : null}
                {profile.localAddress ? (
                  <ReadOnlyField label="Local address" value={profile.localAddress} />
                ) : null}
                {profile.permanentAddress ? (
                  <ReadOnlyField label="Permanent address" value={profile.permanentAddress} />
                ) : null}
                {profile.panOnFile ? (
                  <ReadOnlyField label="PAN on file" value="Yes" />
                ) : null}
              </dl>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
