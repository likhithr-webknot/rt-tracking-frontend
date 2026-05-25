// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import CompanyLogo from "../shared/CompanyLogo";
import { getAuth, setAuth, fetchMe, decodeJwtPayload, getAuthHeader } from "../../api/auth";
import { addEmployee } from "../../api/employees";
import { fetchBands, fetchStreams, normalizeDirectoryPage } from "../../api/band-stream-directory";
import { fetchDesignations } from "../../api/designations";
import { isWebknotWorkEmail, webknotEmailHint } from "../../utils/webknotEmail";
import { toWebtrakDate } from "../../utils/webtrakDate";
import Toast from "../shared/Toast";

function todayInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function EmployeeOnboardingPage({ onComplete }) {
  const auth = getAuth() || {};
  const tokenHeader = getAuthHeader();
  const claims = tokenHeader ? decodeJwtPayload(String(tokenHeader).replace(/^Bearer\s+/i, "")) : null;
  const email = String(
    auth.email ?? auth.employeeEmail ?? claims?.email ?? claims?.preferred_username ?? ""
  ).trim();

  const [draft, setDraft] = useState({
    name: String(auth.employeeName ?? auth.name ?? claims?.name ?? "").trim(),
    band: "B4",
    department: "",
    workMode: "HYBRID",
    userType: "FULLTIME",
    startDate: todayInput(),
  });
  const [bands, setBands] = useState([]);
  const [streams, setStreams] = useState([]);
  const [designation, setDesignation] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [designationLoading, setDesignationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((next) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setCatalogLoading(true);
      try {
        const [bandsRaw, streamsRaw] = await Promise.all([
          fetchBands({ limit: 200, page: 0 }),
          fetchStreams({ limit: 200, page: 0, activeOnly: true }),
        ]);
        if (!alive) return;
        const bandItems = normalizeDirectoryPage(bandsRaw)?.items ?? [];
        const streamItems = normalizeDirectoryPage(streamsRaw)?.items ?? [];
        setBands(bandItems.filter((r) => r?.active !== false));
        setStreams(streamItems.filter((r) => r?.active !== false));
        const firstStream = String(streamItems[0]?.label ?? streamItems[0]?.code ?? "").trim();
        if (firstStream) {
          setDraft((d) => ({ ...d, department: d.department || firstStream }));
        }
      } catch (err) {
        showToast({
          title: "Could not load options",
          message: err?.message || "Band and department lists failed to load.",
          tone: "error",
        });
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [showToast]);

  useEffect(() => {
    const band = String(draft.band ?? "").trim();
    const department = String(draft.department ?? "").trim();
    if (!band || !department) {
      setDesignation("");
      return;
    }
    let alive = true;
    setDesignationLoading(true);
    (async () => {
      try {
        const rows = await fetchDesignations({ bandId: band, department });
        if (!alive) return;
        const first = Array.isArray(rows) ? rows[0] : rows?.items?.[0] ?? rows?.data?.[0];
        const label = String(first?.designation ?? first?.name ?? first?.label ?? "").trim();
        setDesignation(label || "Employee");
      } catch {
        if (alive) setDesignation("Employee");
      } finally {
        if (alive) setDesignationLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [draft.band, draft.department]);

  const bandOptions = useMemo(() => {
    const fromCatalog = bands
      .map((r) => String(r?.code ?? r?.label ?? "").trim())
      .filter(Boolean);
    const fromEmps = ["B4", "B5", "B6"];
    return Array.from(new Set([...fromCatalog, ...fromEmps])).sort();
  }, [bands]);

  const streamOptions = useMemo(() => {
    return streams
      .map((r) => String(r?.label ?? r?.code ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [streams]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isWebknotWorkEmail(email)) {
      showToast({ title: "Wrong email domain", message: webknotEmailHint(), tone: "error" });
      return;
    }
    const name = draft.name.trim();
    const bandCode = draft.band.trim();
    const department = draft.department.trim();
    if (!name) {
      showToast({ title: "Name required", message: "Enter your full name.", tone: "error" });
      return;
    }
    if (!bandCode) {
      showToast({ title: "Band required", message: "Select your band.", tone: "error" });
      return;
    }
    if (!department) {
      showToast({ title: "Department required", message: "Select your department.", tone: "error" });
      return;
    }

    const dirRow =
      bands.find((r) => String(r?.code ?? "").trim() === bandCode) ||
      bands.find((r) => String(r?.band ?? "").trim() === bandCode) ||
      null;
    const bandIdRaw = dirRow?.id;
    const bandId =
      bandIdRaw != null && /^\d+$/.test(String(bandIdRaw)) ? Number.parseInt(String(bandIdRaw), 10) : null;

    const payload = {
      name,
      email: email.toLowerCase(),
      role: "Employee",
      userType: draft.userType,
      workMode: draft.workMode,
      startDate: toWebtrakDate(draft.startDate),
      ...(bandId != null ? { bandId } : {}),
      band: bandCode,
      bandCode,
      level: bandCode,
      department,
      salaryDetails: {
        description: designation || "Employee",
        base: 1,
        variable: 1,
        payoutCycle: "monthly",
      },
    };

    setSubmitting(true);
    try {
      await addEmployee(payload);
      const me = await fetchMe();
      if (me) {
        setAuth({ ...me, email: me.email || email, needsOnboarding: false });
      } else {
        setAuth({ ...auth, email, role: "Employee", needsOnboarding: false });
      }
      showToast({ title: "Welcome aboard", message: "Your profile is ready." });
      if (onComplete) onComplete(getAuth());
      else window.location.assign("/");
    } catch (err) {
      showToast({
        title: "Setup failed",
        message: err?.message || "Could not create your employee profile.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!isWebknotWorkEmail(email)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 text-white">
        <div className="max-w-md text-center">
          <p className="text-lg font-bold">Webknot account required</p>
          <p className="mt-3 text-sm text-slate-400">{webknotEmailHint()}</p>
          <a href="/" className="mt-6 inline-block text-sm font-semibold text-blue-400 hover:underline">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black text-white">
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-12">
        <div className="rounded-3xl border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <CompanyLogo size={44} className="h-11 w-11 shrink-0" aria-hidden />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">First-time setup</p>
              <h1 className="text-xl font-bold tracking-tight">Complete your Pulse profile</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Signed in as <span className="font-mono text-slate-200">{email}</span>. Tell us your band and
            department — we&apos;ll register you as an employee.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Full name" required>
              <input
                className="rt-input w-full"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Your name"
                disabled={submitting}
              />
            </Field>

            <Field label="Band" required>
              <select
                className="rt-input w-full"
                value={draft.band}
                onChange={(e) => setDraft((d) => ({ ...d, band: e.target.value }))}
                disabled={submitting || catalogLoading}
              >
                {bandOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Department" required>
              <select
                className="rt-input w-full"
                value={draft.department}
                onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
                disabled={submitting || catalogLoading}
              >
                <option value="">Select department</option>
                {streamOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work mode">
              <select
                className="rt-input w-full"
                value={draft.workMode}
                onChange={(e) => setDraft((d) => ({ ...d, workMode: e.target.value }))}
                disabled={submitting}
              >
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
                <option value="OFFICE">Office</option>
              </select>
            </Field>

            <Field label="Employment type">
              <select
                className="rt-input w-full"
                value={draft.userType}
                onChange={(e) => setDraft((d) => ({ ...d, userType: e.target.value }))}
                disabled={submitting}
              >
                <option value="FULLTIME">Full-time</option>
                <option value="INTERN">Intern</option>
                <option value="FREELANCER">Freelancer</option>
              </select>
            </Field>

            <Field label="Start date">
              <input
                type="date"
                className="rt-input w-full"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                disabled={submitting}
              />
            </Field>

            {designationLoading ? (
              <p className="text-xs text-slate-500">Resolving designation…</p>
            ) : designation ? (
              <p className="text-xs text-slate-500">
                Suggested designation: <span className="text-slate-300">{designation}</span>
              </p>
            ) : null}

            <button type="submit" disabled={submitting || catalogLoading} className="rt-btn-primary w-full">
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating profile…
                </>
              ) : (
                "Enter Webknot Pulse"
              )}
            </button>
          </form>
        </div>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
