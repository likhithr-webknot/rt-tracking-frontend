// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import {
  fetchEmployeeAllocations,
  parseEmployeeAllocationsPayload,
} from "../../api/allocations";
import { setPortalRole } from "../../api/employees";
import {
  displayOrDash,
  fetchEmployeeTrainingScores,
  fetchWebtrakEmployeeBalances,
  fetchWebtrakEmployeeProfile,
  fetchWebtrakPreferences,
  formatProfileDate,
  formatUserTypeHistory,
  profileFromDirectoryEmployee,
} from "../../api/webtrakEmployeeProfile";
import {
  coercePortalRoleSelectValue,
  getPortalRoleSelectOptions,
  resolvePortalRoleLabel,
} from "../../utils/portalRole";

function FieldRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-[rgb(var(--border))]/60 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] shrink-0">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[rgb(var(--text))] sm:text-right break-words">
        {displayOrDash(value)}
      </dd>
    </div>
  );
}

function SectionCard({ title, children, action = null }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
        <h4 className="text-sm font-semibold text-[rgb(var(--text))]">{title}</h4>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function BalanceStat({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-3 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-none text-[rgb(var(--text))]">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = String(status ?? "").trim().toUpperCase();
  const active = s === "ACTIVE";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        active
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]",
      ].join(" ")}
    >
      {s || "—"}
    </span>
  );
}

function avatarInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/**
 * WebTrak-style employee profile page (opened from directory).
 * Loads profile, balances, trainings, preferences, and allocations via /__webtrak.
 */
export default function EmployeeAllocationProfileModal({
  empId: empIdProp = "",
  employee = null,
  onBack,
  canEditPortalRoles = false,
  portalRoleOptions: portalRoleOptionsProp,
}) {
  const empId = String(empIdProp || employee?.empId || employee?.id || "").trim();
  const fallbackEmail = String(employee?.email ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [balances, setBalances] = useState(null);
  const [balancesError, setBalancesError] = useState("");
  const [trainings, setTrainings] = useState([]);
  const [trainingsLoading, setTrainingsLoading] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [totalAllocated, setTotalAllocated] = useState(null);

  const [portalRole, setPortalRoleLocal] = useState("Employee");
  const [portalRoleError, setPortalRoleError] = useState("");
  const [portalSaving, setPortalSaving] = useState(false);

  const portalRoleOptions = useMemo(
    () =>
      Array.isArray(portalRoleOptionsProp) && portalRoleOptionsProp.length
        ? portalRoleOptionsProp
        : getPortalRoleSelectOptions(),
    [portalRoleOptionsProp],
  );

  const dateFormat = preferences?.dateFormat || "DD/MM/YYYY";

  useEffect(() => {
    if (!empId) {
      setProfile(null);
      setBalances(null);
      setTrainings([]);
      setPreferences(null);
      setAllocations([]);
      setError("Missing employee id.");
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    setBalancesError("");
    const seed = employee ? profileFromDirectoryEmployee(employee) : null;
    if (seed?.empId || seed?.email) {
      setProfile(seed);
      setPortalRoleLocal(
        resolvePortalRoleLabel(
          employee?.empRole,
          employee?.portalRole,
          employee?.role,
          Array.isArray(seed.portalRoles) ? seed.portalRoles[0] : null,
        ) || "Employee",
      );
    }

    (async () => {
      try {
        const [profileResult, prefsResult] = await Promise.allSettled([
          fetchWebtrakEmployeeProfile(empId, { signal: controller.signal }),
          fetchWebtrakPreferences({ signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;

        let nextProfile = seed;
        if (profileResult.status === "fulfilled" && profileResult.value) {
          nextProfile = profileResult.value;
          setProfile(nextProfile);
          setError("");
        } else if (!seed) {
          const reason = profileResult.status === "rejected" ? profileResult.reason : null;
          setError(reason?.message || "Could not load employee profile from WebTrak.");
          setProfile(null);
          setLoading(false);
          return;
        }

        setPortalRoleLocal(
          resolvePortalRoleLabel(
            employee?.empRole,
            employee?.portalRole,
            employee?.role,
            Array.isArray(nextProfile?.portalRoles) ? nextProfile.portalRoles[0] : null,
          ) || "Employee",
        );
        if (prefsResult.status === "fulfilled") setPreferences(prefsResult.value);

        const email = nextProfile?.email || fallbackEmail;

        fetchWebtrakEmployeeBalances(empId, { signal: controller.signal })
          .then((b) => {
            if (!controller.signal.aborted) setBalances(b);
          })
          .catch((err) => {
            if (!controller.signal.aborted) {
              setBalances(null);
              setBalancesError(err?.message || "Could not load balances.");
            }
          });

        if (email) {
          setAllocLoading(true);
          fetchEmployeeAllocations(
            { userEmail: email, scope: "current_and_future" },
            { signal: controller.signal },
          )
            .then((raw) => {
              if (controller.signal.aborted) return;
              const parsed = parseEmployeeAllocationsPayload(raw);
              setAllocations(parsed.allocations || []);
              setTotalAllocated(
                Number.isFinite(parsed.totalAllocatedPercent)
                  ? parsed.totalAllocatedPercent
                  : null,
              );
            })
            .catch(() => {
              if (!controller.signal.aborted) {
                setAllocations([]);
                setTotalAllocated(null);
              }
            })
            .finally(() => {
              if (!controller.signal.aborted) setAllocLoading(false);
            });
        }

        setTrainingsLoading(true);
        fetchEmployeeTrainingScores(
          {
            userId: nextProfile?.userId,
            email: nextProfile?.email || fallbackEmail,
          },
          { signal: controller.signal },
        )
          .then((rows) => {
            if (!controller.signal.aborted) setTrainings(rows);
          })
          .catch(() => {
            if (!controller.signal.aborted) setTrainings([]);
          })
          .finally(() => {
            if (!controller.signal.aborted) setTrainingsLoading(false);
          });
      } catch (err) {
        if (!controller.signal.aborted && !seed) {
          setError(err?.message || "Could not load employee profile.");
          setProfile(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [empId, fallbackEmail, employee]);

  async function handlePortalRoleChange(nextRole) {
    const email = profile?.email || fallbackEmail;
    if (!canEditPortalRoles || !email) return;
    const resolved = coercePortalRoleSelectValue(nextRole, portalRoleOptions);
    setPortalSaving(true);
    setPortalRoleError("");
    try {
      await setPortalRole({ email, role: resolved });
      setPortalRoleLocal(resolved);
    } catch (err) {
      setPortalRoleError(err?.message || "Could not update portal role.");
    } finally {
      setPortalSaving(false);
    }
  }

  if (!empId) {
    return (
      <AdminPageShell>
        <AdminPageHeader
          title="Employee profile"
          subtitle="Missing employee id."
          onBack={onBack}
          backLabel="Back to directory"
          breadcrumbs={[
            { label: "Admin", onClick: onBack },
            { label: "Team list", onClick: onBack },
            { label: "Profile" },
          ]}
        />
      </AdminPageShell>
    );
  }

  const displayName = profile?.name || employee?.name || "Employee";
  const displayEmail = profile?.email || fallbackEmail;
  const displayEmpId = profile?.empId || empId;
  const designation = profile?.designation || employee?.designation || "";
  const currentAllocationSummary =
    totalAllocated != null
      ? `${Math.round(totalAllocated)}% allocated`
      : allocations.length
        ? `${allocations.length} active allocation${allocations.length === 1 ? "" : "s"}`
        : "—";

  return (
    <>
      <AdminPageShell>
        <AdminPageHeader
          title={displayName}
          subtitle={`Employee profile · ${displayEmpId}${displayEmail ? ` · ${displayEmail}` : ""}`}
          sectionLabel="ADMIN"
          onBack={onBack}
          backLabel="Back to directory"
          breadcrumbs={[
            { label: "Admin", onClick: onBack },
            { label: "Team list", onClick: onBack },
            { label: displayName },
          ]}
        />

        <div className="space-y-5">
        {loading && !profile ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={18} className="animate-spin" />
            Loading employee profile…
          </div>
        ) : profile ? (
          <div className="space-y-5">
            {/* Header card */}
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/40 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary))]/20 text-lg font-semibold text-[rgb(var(--primary))] sm:h-20 sm:w-20 sm:text-2xl">
                    {avatarInitials(displayName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-semibold text-[rgb(var(--text))] truncate">
                        {displayName}
                      </h4>
                      <StatusBadge status={profile.status} />
                    </div>
                    <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                      {[designation, profile.department].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    Employee ID
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-medium">{displayEmpId || "—"}</div>
                </div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    <Mail size={12} /> Work email
                  </div>
                  <div className="mt-0.5 text-sm font-medium break-all">{displayEmail || "—"}</div>
                </div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    <Phone size={12} /> Phone
                  </div>
                  <div className="mt-0.5 text-sm font-medium">{profile.phone || "—"}</div>
                </div>
                <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    Resume
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {profile.resumeShareLink ? (
                      <a
                        href={String(profile.resumeShareLink)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[rgb(var(--primary))] hover:underline"
                      >
                        Open resume
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <SectionCard title="Work information">
                    <dl>
                      <FieldRow label="Band" value={profile.band} />
                      <FieldRow
                        label="Employment type"
                        value={profile.userType?.replace(/_/g, " ") || "—"}
                      />
                      <FieldRow
                        label="User type history"
                        value={formatUserTypeHistory(profile.userTypeTransitions)}
                      />
                      <FieldRow label="Category" value={profile.category} />
                      <FieldRow label="Work mode" value={profile.workMode} />
                      <FieldRow label="Work location" value={profile.workLocation} />
                      <FieldRow
                        label="Date of joining"
                        value={formatProfileDate(profile.doj, dateFormat)}
                      />
                      <FieldRow label="Reporting manager" value={profile.reportingManager} />
                      <FieldRow
                        label="Primary skills"
                        value={displayOrDash(profile.primarySkills)}
                      />
                    </dl>
                  </SectionCard>

                  <SectionCard title="Personal information">
                    <dl>
                      <FieldRow label="Personal email" value={profile.personalEmail} />
                      <FieldRow label="Gender" value={profile.gender} />
                      <FieldRow label="Marital status" value={profile.maritalStatus} />
                      <FieldRow label="Current address" value={profile.localAddress} />
                      <FieldRow label="Permanent address" value={profile.permanentAddress} />
                      <FieldRow
                        label="PAN card"
                        value={profile.panOnFile ? "Uploaded" : "Not uploaded"}
                      />
                    </dl>
                  </SectionCard>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <SectionCard title="Experience & allocation">
                    <dl>
                      <FieldRow label="Reporting manager" value={profile.reportingManager} />
                      <FieldRow
                        label="Primary skills"
                        value={displayOrDash(profile.primarySkills)}
                      />
                      <FieldRow
                        label="Secondary skills"
                        value={displayOrDash(profile.secondarySkills)}
                      />
                      <FieldRow
                        label="Years of experience (excluding internship)"
                        value={profile.totalExperience}
                      />
                      <FieldRow
                        label="Experience summary (excluding internship)"
                        value={profile.experienceSummary}
                      />
                      <FieldRow label="Current allocation" value={currentAllocationSummary} />
                    </dl>
                  </SectionCard>

                  <SectionCard title="Documents">
                    <dl>
                      <FieldRow
                        label="PAN card"
                        value={profile.panOnFile ? "Uploaded" : "Not uploaded"}
                      />
                      <FieldRow
                        label="Resume"
                        value={profile.resumeShareLink ? "Available" : "—"}
                      />
                    </dl>
                  </SectionCard>
                </div>

                <SectionCard
                  title="Project details"
                  action={
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                      <Briefcase size={12} className="mr-1 inline" />
                      Allocations
                    </span>
                  }
                >
                  {allocLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--muted))]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading allocations…
                    </div>
                  ) : allocations.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                          <tr>
                            <th className="py-2 pr-3 font-semibold">Project</th>
                            <th className="py-2 pr-3 font-semibold">Role</th>
                            <th className="py-2 pr-3 font-semibold">%</th>
                            <th className="py-2 pr-3 font-semibold">Start</th>
                            <th className="py-2 pr-3 font-semibold">End</th>
                            <th className="py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--border))]">
                          {allocations.map((row) => (
                            <tr key={row.id}>
                              <td className="py-2 pr-3 font-medium">{row.projectName}</td>
                              <td className="py-2 pr-3 text-[rgb(var(--muted))]">{row.role || "—"}</td>
                              <td className="py-2 pr-3 tabular-nums">
                                {Number.isFinite(row.percent) ? `${Math.round(row.percent)}%` : "—"}
                              </td>
                              <td className="py-2 pr-3 text-[rgb(var(--muted))]">
                                {formatProfileDate(row.startDate, dateFormat)}
                              </td>
                              <td className="py-2 pr-3 text-[rgb(var(--muted))]">
                                {formatProfileDate(row.endDate, dateFormat)}
                              </td>
                              <td className="py-2 text-[rgb(var(--muted))]">{row.status || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <UserRound size={28} className="mx-auto mb-3 text-[rgb(var(--muted))]/40" />
                      <p className="text-sm font-semibold text-[rgb(var(--text))]">No projects assigned</p>
                      <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                        Active project allocations will appear here once staffed on a client engagement.
                      </p>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Training scores"
                  action={
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--muted))]">
                      <GraduationCap size={14} />
                      Manage trainings
                    </span>
                  }
                >
                  {trainingsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-[rgb(var(--muted))]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading training scores…
                    </div>
                  ) : trainings.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <thead className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                          <tr>
                            <th className="py-2 pr-3 font-semibold">Training</th>
                            <th className="py-2 pr-3 font-semibold">Scores</th>
                            <th className="py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgb(var(--border))]">
                          {trainings.map((row) => (
                            <tr key={row.trainingId}>
                              <td className="py-2 pr-3 font-medium">{row.trainingName}</td>
                              <td className="py-2 pr-3 tabular-nums">{row.scoresLabel}</td>
                              <td className="py-2 text-[rgb(var(--muted))]">{row.status || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-[rgb(var(--muted))]">
                      No training scores for this employee. Assign them as a trainee and save scores in
                      Learning &amp; Development.
                    </p>
                  )}
                </SectionCard>

                <SectionCard title="Leave &amp; Comp-Off balances">
                  {balancesError ? (
                    <p className="text-sm text-red-600 dark:text-red-300">{balancesError}</p>
                  ) : balances ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      <BalanceStat label="Primary Leave" value={balances.primary} />
                      <BalanceStat label="Secondary Leave" value={balances.secondary} />
                      <BalanceStat label="Carry Forward" value={balances.carryForward} />
                      <BalanceStat label="Total Available" value={balances.total} />
                      <BalanceStat label="Comp Off" value={balances.compOff} />
                    </div>
                  ) : (
                    <p className="text-sm text-[rgb(var(--muted))]">Loading balances…</p>
                  )}
                </SectionCard>

                <SectionCard title="Portal role">
                  <p className="mb-3 text-sm text-[rgb(var(--muted))]">
                    Set this employee&apos;s portal access role.
                  </p>
                  {portalRoleError ? (
                    <p className="mb-3 text-sm text-red-600 dark:text-red-300">{portalRoleError}</p>
                  ) : null}
                  {canEditPortalRoles ? (
                    <label className="block max-w-xs text-xs font-semibold text-[rgb(var(--muted))]">
                      Role
                      <select
                        className="rt-input mt-1 w-full text-sm font-normal"
                        disabled={portalSaving}
                        value={coercePortalRoleSelectValue(portalRole, portalRoleOptions)}
                        onChange={(e) => handlePortalRoleChange(e.target.value)}
                      >
                        {portalRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="text-sm font-medium text-[rgb(var(--text))]">{portalRole}</p>
                  )}
                </SectionCard>
            </>
          </div>
        ) : (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error || "Could not load this employee profile."}
          </div>
        )}
        </div>
      </AdminPageShell>
    </>
  );
}
