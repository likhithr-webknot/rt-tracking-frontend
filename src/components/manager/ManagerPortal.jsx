import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LogOut, RefreshCw, Users, X } from "lucide-react";

import { fetchMe } from "../../api/auth.js";
import { fetchPortalManager } from "../../api/portal.js";
import { fetchManagerReportees, normalizeEmployees } from "../../api/employees.js";
import {
  fetchMyMonthlySubmission,
  fetchManagerTeamSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission
} from "../../api/monthly-submissions.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { getAppSettings } from "../../utils/appSettings.js";
import Toast from "../shared/Toast.jsx";
import ThemeToggle from "../shared/ThemeToggle.jsx";

const MANAGER_REVIEW_DRAFT_KEY = "rt_tracking_manager_review_draft_v1";

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadManagerReviewDrafts() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MANAGER_REVIEW_DRAFT_KEY);
    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveManagerReviewDrafts(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANAGER_REVIEW_DRAFT_KEY, JSON.stringify(next || {}));
  } catch {
    // ignore
  }
}

function normalizeTeamSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const submission = normalizeMonthlySubmission(obj) || null;
      const emp = obj.employee || obj.reportee || obj.user || obj.emp || null;
      const employeeId = emp?.employeeId ?? emp?.empId ?? emp?.id ?? obj.employeeId ?? null;
      const employeeName = emp?.employeeName ?? emp?.name ?? emp?.fullName ?? obj.employeeName ?? null;
      const email = emp?.email ?? obj.email ?? null;

      return {
        submissionId: submission?.id ?? (obj.submissionId ? String(obj.submissionId) : null),
        month: submission?.month ?? (typeof obj.month === "string" ? obj.month : null),
        status: submission?.status ?? (typeof obj.status === "string" ? obj.status : null),
        updatedAt: submission?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null),
        submittedAt: submission?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null),
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        payload: submission,
        raw: obj,
      };
    })
    .filter(Boolean);
}

function normalizeSelfKpiRatings(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [idRaw, valueRaw] of Object.entries(input)) {
    const id = String(idRaw || "").trim();
    if (!id) continue;
    const parsed =
      typeof valueRaw === "number" ? valueRaw : Number.parseFloat(String(valueRaw ?? ""));
    if (!Number.isFinite(parsed)) continue;
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) continue;
    out[id] = rounded;
  }
  return out;
}

function normalizeFilterKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isWildcardValue(key) {
  return key === "" || key === "*" || key === "all" || key === "any";
}

function kpiAppliesToManager(kpi, managerProfile) {
  const managerBand = normalizeFilterKey(managerProfile?.band);
  const managerStream = normalizeFilterKey(managerProfile?.stream);

  if (!managerBand && !managerStream) return true;

  const kpiBand = normalizeFilterKey(kpi?.band);
  const kpiStream = normalizeFilterKey(kpi?.stream);

  const bandOk = isWildcardValue(kpiBand) || !managerBand || kpiBand === managerBand;
  const streamOk =
    isWildcardValue(kpiStream) ||
    kpiStream === "general" ||
    !managerStream ||
    kpiStream === managerStream;

  return bandOk && streamOk;
}

function formatOneDecimalDisplay(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return (Math.round(value * 10) / 10).toFixed(1);
}

function normalizeSelfValueRatings(input) {
  if (!input) return {};
  const out = {};

  const assign = (idRaw, ratingRaw, fallback = null) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const parsed =
      ratingRaw == null || ratingRaw === ""
        ? fallback
        : typeof ratingRaw === "number"
          ? ratingRaw
          : Number.parseFloat(String(ratingRaw));
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) return;
    out[id] = rounded;
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const id =
          item.valueId ?? item.webknotValueId ?? item.id ?? item.code ?? item.key ?? item.value ?? item.title ?? item.name;
        const rating = item.rating ?? item.valueRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) assign(k, v);
  }

  return out;
}

function buildManagerSelfSubmissionPayload({
  month,
  selfReviewText,
  kpiRatings,
  selectedValues,
  allowedKpiIds,
}) {
  const normalizedKpisRaw = normalizeSelfKpiRatings(kpiRatings);
  const allowedSet = new Set(
    Array.isArray(allowedKpiIds) ? allowedKpiIds.map((id) => String(id || "").trim()).filter(Boolean) : []
  );
  const normalizedKpis =
    allowedSet.size > 0
      ? Object.fromEntries(
          Object.entries(normalizedKpisRaw).filter(([id]) => allowedSet.has(String(id || "").trim()))
        )
      : normalizedKpisRaw;
  const kpiEntries = Object.entries(normalizedKpis).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const kpiRatingsArray = kpiEntries.map(([kpiId, rating]) => ({
    kpiId: String(kpiId || "").trim(),
    rating,
  }));

  const normalizedValues = normalizeSelfValueRatings(selectedValues);
  const valueEntries = Object.entries(normalizedValues).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueEntries);
  const webknotValueResponses = valueEntries.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    rating,
  }));
  const webknotValues = valueEntries.map(([id]) => String(id));
  const monthKey = String(month || "").trim() || null;

  return {
    month: monthKey,
    monthKey,
    profileVerified: true,
    selfReviewText: String(selfReviewText || ""),
    certifications: [],
    kpiRatings: kpiRatingsArray,
    webknotValues,
    webknotValueRatings: stableValueRatings,
    webknotValueResponses,
    recognitionsCount: 0,
  };
}

function isFinalSubmissionStatus(status, meta) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL") return true;
  if (meta?.submittedAt) return true;
  return false;
}

function payloadHash(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return String(Date.now());
  }
}

function getDraftAutosaveDelayMs() {
  const n = Number.parseInt(String(getAppSettings()?.draftAutosaveDelayMs ?? 900), 10);
  if (!Number.isFinite(n)) return 900;
  return Math.min(5000, Math.max(500, n));
}

function preventWheelInputChange(e) {
  e.currentTarget.blur();
}

export default function ManagerPortal({ onLogout, auth }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const [managerId, setManagerId] = useState(() => String(auth?.employeeId || "").trim() || "");
  const [managerBand, setManagerBand] = useState(() => String(auth?.band || "").trim());
  const [managerStream, setManagerStream] = useState(() => String(auth?.stream || "").trim());
  const [filter, setFilter] = useState("NEEDS_REVIEW"); // NEEDS_REVIEW | ALL | SUBMITTED
  const [activeTab, setActiveTab] = useState("team"); // team | reportees | self-review
  const [selectedReporteeId, setSelectedReporteeId] = useState("");
  const [managerSelfReviewText, setManagerSelfReviewText] = useState("");
  const [managerSelfKpiRatings, setManagerSelfKpiRatings] = useState({});
  const [managerSelfValueRatings, setManagerSelfValueRatings] = useState({});
  const [savingSelfReview, setSavingSelfReview] = useState(false);
  const [managerDraftSaving, setManagerDraftSaving] = useState(false);
  const [managerDraftError, setManagerDraftError] = useState("");
  const [selfRatingValidationError, setSelfRatingValidationError] = useState("");
  const [hydratingSelfSubmission, setHydratingSelfSubmission] = useState(false);
  const [selfSubmissionMeta, setSelfSubmissionMeta] = useState(null);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const lastSavedSelfDraftHashRef = useRef("");

  const [kpiIndex, setKpiIndex] = useState({}); // { [id]: { title, weight } }
  const [selfKpis, setSelfKpis] = useState([]);
  const [selfKpisLoading, setSelfKpisLoading] = useState(false);
  const [selfValues, setSelfValues] = useState([]);
  const [selfValuesLoading, setSelfValuesLoading] = useState(false);

  const [reportees, setReportees] = useState([]);
  const [reporteesLoading, setReporteesLoading] = useState(false);
  const [reporteesError, setReporteesError] = useState("");

  const [teamSubs, setTeamSubs] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");

  const [reviewModal, setReviewModal] = useState({ open: false, row: null });
  const [reviewDrafts, setReviewDrafts] = useState(() => loadManagerReviewDrafts());
  const [managerRatings, setManagerRatings] = useState({});
  const [managerNotes, setManagerNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  function showToast(next) {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  function handleSelfRatingChange(kind, id, rawValue) {
    if (selfReviewLocked) return;

    const raw = String(rawValue ?? "").trim();
    if (raw === "") {
      setSelfRatingValidationError("");
      if (kind === "kpi") {
        setManagerSelfKpiRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      } else {
        setManagerSelfValueRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      }
      return;
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setSelfRatingValidationError("Enter a valid rating between 1 and 5.");
      return;
    }

    const rounded = Math.round(parsed * 10) / 10;
    if (rounded > 5) {
      setSelfRatingValidationError("Rating cannot be more than 5.");
      return;
    }
    if (rounded < 1) {
      setSelfRatingValidationError("Rating cannot be less than 1.");
      return;
    }

    setSelfRatingValidationError("");
    if (kind === "kpi") {
      setManagerSelfKpiRatings((prev) => ({
        ...(prev || {}),
        [id]: rounded,
      }));
    } else {
      setManagerSelfValueRatings((prev) => ({
        ...(prev || {}),
        [id]: rounded,
      }));
    }
  }

  function closeReviewModal() {
    setReviewModal({ open: false, row: null });
    setManagerRatings({});
    setManagerNotes("");
    setSavingReview(false);
  }

  const selectedRow = reviewModal.open ? reviewModal.row : null;
  const selectedKey = selectedRow ? `${selectedRow.employee.id}:${String(selectedRow.month || month)}` : "";

  useEffect(() => {
    if (!reviewModal.open || !selectedRow) return;
    const existing = selectedKey ? reviewDrafts?.[selectedKey] : null;
    const baseRatings = selectedRow?.payload?.kpiRatings && typeof selectedRow.payload.kpiRatings === "object"
      ? selectedRow.payload.kpiRatings
      : {};
    const initialRatings =
      existing?.kpiRatings && typeof existing.kpiRatings === "object"
        ? existing.kpiRatings
        : baseRatings;
    setManagerRatings({ ...(initialRatings || {}) });
    setManagerNotes(String(existing?.notes || "").trim());
  }, [reviewDrafts, reviewModal.open, selectedKey, selectedRow]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        await fetchPortalManager({ signal: controller.signal });
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      const hasManagerId = Boolean(String(managerId || "").trim());
      const hasManagerBand = Boolean(String(managerBand || "").trim());
      const hasManagerStream = Boolean(String(managerStream || "").trim());
      if (hasManagerId && hasManagerBand && hasManagerStream) return;
      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!mounted) return;
        const root = me && typeof me === "object" ? me : {};
        const obj =
          root?.data && typeof root.data === "object" && !Array.isArray(root.data)
            ? root.data
            : root;

        const id = String(obj?.employeeId ?? obj?.empId ?? obj?.id ?? "").trim();
        const band = String(obj?.band ?? obj?.level ?? "").trim();
        const stream = String(obj?.stream ?? obj?.context ?? "").trim();
        if (id) setManagerId(id);
        if (band) setManagerBand(band);
        if (stream) setManagerStream(stream);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [managerBand, managerId, managerStream, onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfKpisLoading(true);
      try {
        const data = await fetchKpiDefinitions({ signal: controller.signal });
        if (!mounted) return;
        const list = normalizeKpiDefinitions(data);
        const map = {};
        for (const k of list) map[String(k.id)] = { title: k.title, weight: k.weight };
        setKpiIndex(map);
        setSelfKpis(list);
      } catch {
        // KPI index is best-effort; manager can still review with ids.
      } finally {
        if (mounted) setSelfKpisLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfValuesLoading(true);
      try {
        const data = await fetchValues(true, { signal: controller.signal });
        const list = normalizeWebknotValuesList(data)
          .map((v) => ({
            id: String(v?.id || "").trim(),
            title: String(v?.title || v?.id || "").trim(),
            pillar: String(v?.pillar || "—").trim() || "—",
          }))
          .filter((v) => Boolean(v.id));
        if (!mounted) return;
        setSelfValues(list);
      } catch {
        if (!mounted) return;
        setSelfValues([]);
      } finally {
        if (mounted) setSelfValuesLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const id = String(managerId || "").trim();
    if (!id) return;
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setReporteesError("");
      setReporteesLoading(true);
      try {
        const data = await fetchManagerReportees(id, { signal: controller.signal });
        const normalized = normalizeEmployees(data);
        if (!mounted) return;
        setReportees(normalized);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setReporteesError(err?.message || "Failed to load reportees.");
        setReportees([]);
      } finally {
        if (mounted) setReporteesLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [managerId, onLogout]);

  async function reloadTeam() {
    setTeamError("");
    setTeamLoading(true);
    try {
      const data = await fetchManagerTeamSubmissions({ month });
      setTeamSubs(normalizeTeamSubmissions(data));
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setTeamError(err?.message || "Failed to load team submissions.");
      setTeamSubs([]);
    } finally {
      setTeamLoading(false);
    }
  }

  useEffect(() => {
    if (!String(month || "").trim()) return;
    reloadTeam().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setHydratingSelfSubmission(true);
      setManagerDraftError("");
      try {
        const data = await fetchMyMonthlySubmission({ month, signal: controller.signal });
        if (!mounted) return;

        const normalized = normalizeMonthlySubmission(data);
        if (!normalized) {
          setSelfSubmissionMeta(null);
          setManagerSelfReviewText("");
          setManagerSelfKpiRatings({});
          setManagerSelfValueRatings({});
          const cleared = buildManagerSelfSubmissionPayload({
            month,
            selfReviewText: "",
            kpiRatings: {},
            selectedValues: {},
            allowedKpiIds: filteredSelfKpiIds,
          });
          lastSavedSelfDraftHashRef.current = payloadHash(cleared);
          return;
        }

        const nextKpis = normalizeSelfKpiRatings(normalized.kpiRatings);
        const nextValues = normalizeSelfValueRatings(
          normalized.webknotValueRatings ?? normalized.webknotValues
        );

        setSelfSubmissionMeta({
          id: normalized.id,
          month: normalized.month || month,
          status: normalized.status || null,
          submittedAt: normalized.submittedAt || null,
          updatedAt: normalized.updatedAt || null,
        });
        setManagerSelfReviewText(normalized.selfReviewText || "");
        setManagerSelfKpiRatings(nextKpis);
        setManagerSelfValueRatings(nextValues);

        const loaded = buildManagerSelfSubmissionPayload({
          month: normalized.month || month,
          selfReviewText: normalized.selfReviewText || "",
          kpiRatings: nextKpis,
          selectedValues: nextValues,
          allowedKpiIds: filteredSelfKpiIds,
        });
        lastSavedSelfDraftHashRef.current = payloadHash(loaded);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setManagerDraftError(err?.message || "Failed to load self review.");
      } finally {
        if (mounted) setHydratingSelfSubmission(false);
      }
    }

    run();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [month, onLogout]);

  const selfReviewLocked = useMemo(
    () => isFinalSubmissionStatus(selfSubmissionMeta?.status, selfSubmissionMeta),
    [selfSubmissionMeta]
  );

  useEffect(() => {
    if (!String(month || "").trim()) return;
    if (hydratingSelfSubmission) return;
    if (selfReviewLocked) return;

    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      allowedKpiIds: filteredSelfKpiIds,
    });

    const hash = payloadHash(payload);
    if (hash === lastSavedSelfDraftHashRef.current) return;

    const delayMs = getDraftAutosaveDelayMs();
    const id = window.setTimeout(async () => {
      setManagerDraftError("");
      setManagerDraftSaving(true);
      try {
        await saveMonthlyDraft(payload);
        lastSavedSelfDraftHashRef.current = hash;
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setManagerDraftError(err?.message || "Failed to save draft.");
      } finally {
        setManagerDraftSaving(false);
      }
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [
    hydratingSelfSubmission,
    managerSelfKpiRatings,
    managerSelfReviewText,
    managerSelfValueRatings,
    month,
    onLogout,
    selfReviewLocked,
  ]);

  const reporteeCount = reportees.length;
  const submittedCount = useMemo(
    () => teamSubs.filter((s) => String(s.status || "").toUpperCase() === "SUBMITTED").length,
    [teamSubs]
  );

  const filteredTeamSubs = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    if (mode === "ALL") return teamSubs;
    if (mode === "SUBMITTED") {
      return teamSubs.filter((s) => String(s.status || "").toUpperCase() === "SUBMITTED");
    }
    // NEEDS_REVIEW: anything not SUBMITTED (including null status).
    return teamSubs.filter((s) => String(s.status || "").toUpperCase() !== "SUBMITTED");
  }, [filter, teamSubs]);

  const filteredSelfKpis = useMemo(
    () => selfKpis.filter((k) => kpiAppliesToManager(k, { band: managerBand, stream: managerStream })),
    [managerBand, managerStream, selfKpis]
  );

  const filteredSelfKpiIds = useMemo(
    () => filteredSelfKpis.map((k) => String(k?.id || "").trim()).filter(Boolean),
    [filteredSelfKpis]
  );

  const selectedReportee = useMemo(
    () => reportees.find((r) => String(r.id) === String(selectedReporteeId)) || null,
    [reportees, selectedReporteeId]
  );

  const selectedReporteeSubmission = useMemo(() => {
    if (!selectedReporteeId) return null;
    return (
      teamSubs.find((s) => String(s?.employee?.id || "") === String(selectedReporteeId)) || null
    );
  }, [selectedReporteeId, teamSubs]);

  async function saveManagerSelfReviewDraft() {
    if (selfReviewLocked) {
      showToast({ title: "Locked", message: "You already submitted this month's self review." });
      return;
    }
    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      allowedKpiIds: filteredSelfKpiIds,
    });
    setSavingSelfReview(true);
    setManagerDraftError("");
    try {
      await saveMonthlyDraft(payload);
      lastSavedSelfDraftHashRef.current = payloadHash(payload);
      showToast({ title: "Draft saved", message: "Manager self review saved." });
    } catch (err) {
      setManagerDraftError(err?.message || "Please try again.");
      showToast({ title: "Save failed", message: err?.message || "Please try again." });
    } finally {
      setSavingSelfReview(false);
    }
  }

  async function submitManagerSelfReview() {
    if (selfReviewLocked) {
      showToast({ title: "Already submitted", message: "Manager self review can be submitted once per month." });
      return;
    }
    const text = String(managerSelfReviewText || "").trim();
    if (!text) {
      showToast({ title: "Missing self review", message: "Write your self review before submitting." });
      return;
    }
    const payload = {
      ...buildManagerSelfSubmissionPayload({
        month,
        selfReviewText: text,
        kpiRatings: managerSelfKpiRatings,
        selectedValues: managerSelfValueRatings,
        allowedKpiIds: filteredSelfKpiIds,
      }),
      submittedAt: new Date().toISOString(),
    };
    setSavingSelfReview(true);
    try {
      const res = await submitMonthlySubmission(payload);
      const normalized = normalizeMonthlySubmission(res);
      const now = new Date().toISOString();
      setSelfSubmissionMeta({
        id: normalized?.id ?? selfSubmissionMeta?.id ?? null,
        month: normalized?.month ?? month,
        status: normalized?.status ?? "SUBMITTED",
        submittedAt: normalized?.submittedAt ?? payload.submittedAt ?? now,
        updatedAt: normalized?.updatedAt ?? now,
      });
      lastSavedSelfDraftHashRef.current = payloadHash(
        buildManagerSelfSubmissionPayload({
          month,
          selfReviewText: managerSelfReviewText,
          kpiRatings: managerSelfKpiRatings,
          selectedValues: managerSelfValueRatings,
          allowedKpiIds: filteredSelfKpiIds,
        })
      );
      showToast({ title: "Submitted", message: "Manager self review submitted." });
    } catch (err) {
      showToast({ title: "Submit failed", message: err?.message || "Please try again." });
    } finally {
      setSavingSelfReview(false);
    }
  }

  function validateManagerReview(action) {
    if (!selectedRow) return { ok: false, message: "No submission selected." };
    const reviewAction = String(action || "").trim().toUpperCase();
    const expectedIds = Object.keys(selectedRow?.payload?.kpiRatings || {});
    const normalizedRatings = {};

    for (const id of expectedIds) {
      const raw = managerRatings?.[id];
      if (reviewAction === "SUBMIT" && (raw == null || raw === "")) {
        return { ok: false, message: "Rate all KPIs before submitting review." };
      }
      if (raw == null || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        return { ok: false, message: "Manager KPI ratings must be between 1 and 5." };
      }
      normalizedRatings[id] = Math.round(parsed * 10) / 10;
    }

    const notes = String(managerNotes || "").trim();
    if (reviewAction === "REJECT" && notes.length < 10) {
      return { ok: false, message: "Rejection comments must be at least 10 characters." };
    }

    return { ok: true, notes, normalizedRatings };
  }

  async function submitManagerReviewDecision(action) {
    if (!selectedRow) return;

    const check = validateManagerReview(action);
    if (!check.ok) {
      showToast({ title: "Validation failed", message: check.message || "Please review the input." });
      return;
    }

    const reviewAction = String(action || "").trim().toUpperCase();
    const empId = String(selectedRow.employee.id || "").trim();
    const m = String(selectedRow.month || month || "").trim();
    if (!empId || !m) {
      showToast({ title: "Missing data", message: "Employee id or month is missing." });
      return;
    }

    const employeePayload = selectedRow.payload || {};
    const reviewedAt = new Date().toISOString();
    const payload = {
      month: m,
      monthKey: m,
      profileVerified: true,
      employeeId: empId,
      selfReviewText: String(employeePayload.selfReviewText || ""),
      certifications: [],
      webknotValues: [],
      webknotValueRatings: [],
      webknotValueResponses: [],
      recognitionsCount: Number(employeePayload.recognitionsCount || 0) || 0,
      kpiRatings: Object.entries(check.normalizedRatings || {}).map(([kpiId, rating]) => ({
        kpiId: String(kpiId || "").trim(),
        rating,
      })),
      managerReview: {
        action: reviewAction,
        comments: check.notes,
        reviewedAt,
        reviewedBy: managerId || null,
      },
      managerComments: check.notes,
      managerNotes: check.notes,
      reviewStatus: reviewAction === "REJECT" ? "NEEDS_REVIEW" : "SUBMITTED",
      reopenedForResubmission: reviewAction === "REJECT",
    };

    try {
      setSavingReview(true);
      if (reviewAction === "SUBMIT") {
        await submitMonthlySubmission(payload);
        showToast({ title: "Submitted", message: "Manager review submitted." });
      } else {
        await saveMonthlyDraft(payload);
        setTeamSubs((prev) =>
          prev.map((s) => {
            const sameEmp = String(s?.employee?.id || "") === empId;
            const sameMonth = String(s?.month || "") === m;
            if (!sameEmp || !sameMonth) return s;
            return {
              ...s,
              status: "NEEDS_REVIEW",
              updatedAt: reviewedAt,
              raw: {
                ...(s.raw && typeof s.raw === "object" ? s.raw : {}),
                managerReview: payload.managerReview,
                reviewStatus: "NEEDS_REVIEW",
                reopenedForResubmission: true,
              },
            };
          })
        );
        showToast({ title: "Rejected", message: "Sent back with comments for resubmission." });
      }

      closeReviewModal();
      await reloadTeam();
    } catch (err) {
      showToast({ title: `${reviewAction === "REJECT" ? "Reject" : "Submit"} failed`, message: err?.message || "Please try again." });
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <div className="rt-shell font-sans px-4 sm:px-6 lg:px-10 py-6 sm:py-10">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="rt-kicker">
            Manager Portal
          </div>
          <h1 className="mt-2 rt-title">
            {activeTab === "team"
              ? "Team Submissions"
              : activeTab === "reportees"
              ? "Reportees"
              : "Manager Self Review"}
          </h1>
          <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-[rgb(var(--muted))]">
            <span className="inline-flex items-center gap-2">
              <Users size={16} /> Reportees: <span className="font-mono text-[rgb(var(--text))]">{reporteeCount}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              Submitted: <span className="font-mono text-[rgb(var(--text))]">{submittedCount}</span>
            </span>
            {managerId ? (
              <span className="text-gray-500 font-mono">Manager ID: {managerId}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-end md:items-end gap-3 flex-wrap md:justify-end">
          <div className="self-end">
            <ThemeToggle compact />
          </div>

          <div className="space-y-1">
            <div className="rt-kicker">
              Month
            </div>
            <input
              type="month"
              value={month}
              onWheel={preventWheelInputChange}
              onChange={(e) => {
                const next = String(e.target.value || "").trim();
                if (!next) return;
                setMonth(next);
              }}
              className="rt-input text-sm"
            />
          </div>

          {activeTab === "team" ? (
            <div className="space-y-1">
              <div className="rt-kicker">
                Filter
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rt-input text-sm"
                title="Filter"
              >
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="ALL">All</option>
                <option value="SUBMITTED">Submitted</option>
              </select>
            </div>
          ) : null}

          <button
            onClick={() => reloadTeam()}
            disabled={teamLoading}
            className={[
              "rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest transition-all",
              teamLoading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Refresh"
          >
            <RefreshCw size={18} /> {teamLoading ? "Loading…" : "Refresh"}
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-semibold uppercase tracking-widest bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all"
            title="Logout"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto mt-6 flex flex-wrap gap-2">
        {[
          { id: "team", label: "Team Submissions" },
          { id: "reportees", label: "Reportees" },
          { id: "self-review", label: "Self Review" },
        ].map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "rounded-2xl border px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all",
                selected
                  ? "bg-blue-500 text-white border-blue-500"
                  : "border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "team" ? (
        <main className="max-w-7xl mx-auto mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8">
          {teamLoading && teamSubs.length === 0 ? (
            <div className="xl:col-span-3 rt-panel-subtle rounded-3xl p-6 text-sm text-[rgb(var(--muted))] animate-pulse">
              Loading team submissions and manager insights…
            </div>
          ) : null}
          <section className="xl:col-span-2 rt-panel overflow-hidden">
            <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Team Submissions</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Review employee submissions for {month}.
                </p>
              </div>
            </div>

            {teamError ? (
              <div className="px-8 pb-6 text-sm text-red-200">
                Failed to load: <span className="font-mono">{teamError}</span>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-t border-b border-[rgb(var(--border))]">
                  <tr>
                    <th className="p-6 font-black">Employee</th>
                    <th className="p-6 font-black">Status</th>
                    <th className="p-6 font-black">Updated</th>
                    <th className="p-6 text-right font-black px-8">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {filteredTeamSubs.map((s) => {
                    const status = String(s.status || "—").toUpperCase();
                    const isSubmitted = status === "SUBMITTED";
                    const when = s.updatedAt || s.submittedAt || "—";
                    return (
                      <tr key={`${s.employee.id}:${s.submissionId || when}`} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                        <td className="p-6">
                          <div className="font-bold text-[rgb(var(--text))] tracking-tight">{s.employee.name}</div>
                          <div className="text-xs text-gray-500 font-mono mt-1">
                            {s.employee.id}{s.employee.email ? ` • ${s.employee.email}` : ""}
                          </div>
                        </td>
                        <td className="p-6">
                          <span
                            className={[
                              "text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
                              isSubmitted
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/20",
                            ].join(" ")}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-6 text-xs text-[rgb(var(--muted))] font-mono">
                          {when}
                        </td>
                        <td className="p-6 text-right px-8">
                          <button
                            type="button"
                            onClick={() => setReviewModal({ open: true, row: s })}
                            className={[
                              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all border",
                              "border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]",
                            ].join(" ")}
                            title="Review"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!teamLoading && filteredTeamSubs.length === 0 ? (
                    <tr>
                      <td className="p-10 text-center text-gray-500" colSpan={4}>
                        No submissions to show.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rt-panel p-8">
            <h2 className="text-xl font-bold tracking-tight">Reportees</h2>
            <p className="text-gray-500 text-sm mt-1">
              From <span className="font-mono">/employees/manager/{`{managerId}`}/reportees</span>.
            </p>

            {reporteesError ? (
              <div className="mt-4 text-sm text-red-200">
                Failed to load: <span className="font-mono">{reporteesError}</span>
              </div>
            ) : null}

            {reporteesLoading ? (
              <div className="mt-4 text-sm text-gray-300">Loading reportees…</div>
            ) : null}

            <div className="mt-6 space-y-3">
              {reportees.slice(0, 20).map((e) => (
                <div key={e.id} className="rt-panel-subtle rounded-2xl px-4 py-3">
                  <div className="font-bold text-[rgb(var(--text))] tracking-tight">{e.name}</div>
                  <div className="text-xs text-gray-500 font-mono mt-1">
                    {e.id}{e.email ? ` • ${e.email}` : ""}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-2">
                    {e.role}{e.band ? ` • ${e.band}` : ""}
                  </div>
                </div>
              ))}

              {!reporteesLoading && reportees.length === 0 ? (
                <div className="text-sm text-gray-500">No reportees to show.</div>
              ) : null}
            </div>
          </section>
        </main>
      ) : null}

      {activeTab === "reportees" ? (
        <main className="max-w-7xl mx-auto mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8">
          {reporteesLoading && reportees.length === 0 ? (
            <div className="xl:col-span-3 rt-panel-subtle rounded-3xl p-6 text-sm text-[rgb(var(--muted))] animate-pulse">
              Loading reportee directory…
            </div>
          ) : null}
          <section className="xl:col-span-2 rt-panel p-8">
            <h2 className="text-xl font-bold tracking-tight">Select Reportee</h2>
            <p className="text-slate-500 text-sm mt-1">Pick an employee to open side-by-side comparison and add manager review.</p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {reportees.map((e) => {
                const selected = String(selectedReporteeId) === String(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedReporteeId(String(e.id))}
                    className={[
                      "text-left rounded-2xl border p-4 transition-all",
                      selected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] hover:bg-[rgb(var(--surface-2))]",
                    ].join(" ")}
                  >
                    <div className="font-bold text-[rgb(var(--text))]">{e.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{e.id}{e.email ? ` • ${e.email}` : ""}</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mt-2">{e.role}{e.band ? ` • ${e.band}` : ""}</div>
                  </button>
                );
              })}
              {!reporteesLoading && reportees.length === 0 ? (
                <div className="text-sm text-slate-500">No reportees available.</div>
              ) : null}
            </div>
          </section>

          <section className="rt-panel p-8">
            <h2 className="text-xl font-bold tracking-tight">Comparison</h2>
            {selectedReportee ? (
              <div className="mt-4 space-y-4">
                <div className="rt-panel-subtle p-4">
                  <div className="font-bold text-[rgb(var(--text))]">{selectedReportee.name}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">{selectedReportee.id}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {selectedReporteeSubmission ? "Submission found for selected month." : "No submission found for selected month."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!selectedReporteeSubmission) {
                      showToast({ title: "No submission", message: "Selected employee has no submission for this month." });
                      return;
                    }
                    setReviewModal({ open: true, row: selectedReporteeSubmission });
                  }}
                  className="w-full rt-btn-primary text-xs uppercase tracking-widest"
                >
                  Open Side-by-Side Review
                </button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-500">Select a reportee to continue.</div>
            )}
          </section>
        </main>
      ) : null}

      {activeTab === "self-review" ? (
        <main className="max-w-7xl mx-auto mt-10">
          <section className="rt-panel p-8 max-w-4xl">
            <h2 className="text-xl font-bold tracking-tight">Manager Self Review</h2>
            <p className="text-slate-500 text-sm mt-1">Write your monthly self review, rate KPIs and Webknot values, then submit.</p>

            {selfReviewLocked ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                This month is locked (already submitted). You can submit once per month.
              </div>
            ) : null}

            {(hydratingSelfSubmission || selfKpisLoading || selfValuesLoading) ? (
              <div className="mt-5 rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
                Loading your self review template (KPIs and Webknot values)…
              </div>
            ) : null}

            {managerDraftError ? (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                {managerDraftError}
              </div>
            ) : null}

            <div className="mt-5 text-xs text-[rgb(var(--muted))]">
              Draft: {selfReviewLocked ? "Locked" : (hydratingSelfSubmission ? "Loading…" : managerDraftSaving ? "Saving…" : "Saved")}
            </div>

            <div className="mt-6 space-y-4">
              <textarea
                value={managerSelfReviewText}
                onChange={(e) => setManagerSelfReviewText(e.target.value)}
                readOnly={selfReviewLocked}
                rows={10}
                className={[
                  "rt-input p-4 text-sm resize-none",
                  selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                ].join(" ")}
                placeholder="Write your self review for this month..."
              />

              <div className="rt-panel-subtle rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">KPI Ratings (1-5)</div>
                <div className="mt-3 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {filteredSelfKpis.map((k) => {
                    const id = String(k?.id || "").trim();
                    const value = managerSelfKpiRatings?.[id];
                    const display = formatOneDecimalDisplay(value);
                    return (
                      <div key={id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm text-[rgb(var(--text))] truncate">{String(k?.title || id)}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))] font-mono mt-1">
                            {String(k?.weight || "—")}
                          </div>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={display}
                          readOnly={selfReviewLocked}
                          onWheel={preventWheelInputChange}
                          onChange={(e) => handleSelfRatingChange("kpi", id, e.target.value)}
                          className={[
                            "rt-input w-36 py-2 px-3 text-sm justify-self-end",
                            selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                          ].join(" ")}
                          placeholder="1-5"
                        />
                      </div>
                    );
                  })}
                  {!selfKpisLoading && filteredSelfKpis.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No KPIs available.</div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Webknot Values Ratings (1-5)</div>
                <div className="mt-3 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {selfValues.map((valueItem) => {
                    const id = String(valueItem?.id || "").trim();
                    const value = managerSelfValueRatings?.[id];
                    const display = formatOneDecimalDisplay(value);
                    return (
                      <div key={id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm text-[rgb(var(--text))] truncate">{String(valueItem?.title || id)}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))] mt-1">{String(valueItem?.pillar || "—")}</div>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={display}
                          readOnly={selfReviewLocked}
                          onWheel={preventWheelInputChange}
                          onChange={(e) => handleSelfRatingChange("value", id, e.target.value)}
                          className={[
                            "rt-input w-36 py-2 px-3 text-sm justify-self-end",
                            selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                          ].join(" ")}
                          placeholder="1-5"
                        />
                      </div>
                    );
                  })}
                  {!selfValuesLoading && selfValues.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No values available.</div>
                  ) : null}
                </div>
              </div>

              <div className="text-[10px] text-[rgb(var(--muted))]">
                Showing KPIs for your profile{managerBand ? ` • Band: ${managerBand}` : ""}{managerStream ? ` • Stream: ${managerStream}` : ""}.
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={saveManagerSelfReviewDraft}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-ghost text-xs uppercase tracking-widest disabled:opacity-60"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={submitManagerSelfReview}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-primary text-xs uppercase tracking-widest disabled:opacity-60"
                >
                  {selfReviewLocked ? "Submitted" : "Submit Self Review"}
                </button>
              </div>
            </div>
          </section>
        </main>
      ) : null}

      {reviewModal.open && selectedRow ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[70] overflow-y-auto">
          <div className="w-full max-w-6xl rt-panel rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>

              {selfRatingValidationError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {selfRatingValidationError}
                </div>
              ) : null}
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Review
                </div>
                <div className="mt-2 text-2xl font-black tracking-tight text-[rgb(var(--text))]">
                  {selectedRow.employee.name}
                </div>
                <div className="mt-1 text-xs text-gray-500 font-mono">
                  {selectedRow.employee.id} • {String(selectedRow.month || month)}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-[2.5rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Employee Submitted
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">
                      {String(selectedRow.payload?.selfReviewText || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings</div>
                    <div className="mt-2 space-y-2">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id, v]) => (
                          <div key={id} className="flex items-center justify-between gap-3">
                            <div className="text-sm text-[rgb(var(--text))]">
                              {kpiIndex?.[id]?.title || id}
                            </div>
                            <div className="text-sm font-mono text-purple-200">{String(v)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No KPI ratings.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Certifications</div>
                    <div className="mt-2 space-y-2">
                      {Array.isArray(selectedRow.payload?.certifications) && selectedRow.payload.certifications.length ? (
                        selectedRow.payload.certifications.map((c) => (
                          <div key={String(c?.name || "")} className="flex items-start justify-between gap-4">
                            <div className="text-sm text-[rgb(var(--text))]">{String(c?.name || "")}</div>
                            <div className="text-xs text-gray-500 font-mono break-all">{String(c?.proof || "")}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">None.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Webknot Values</div>
                    <div className="mt-2 space-y-2">
                      {selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object" && Object.keys(selectedRow.payload.webknotValueRatings).length ? (
                        Object.entries(selectedRow.payload.webknotValueRatings)
                          .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map(([id, rating]) => (
                            <div key={String(id || "")} className="flex items-center justify-between gap-4">
                              <div className="text-sm text-[rgb(var(--text))]">{String(id || "")}</div>
                              <div className="text-sm font-mono text-purple-200">{String(rating ?? "—")}</div>
                            </div>
                          ))
                      ) : Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={String(v || "")} className="text-sm text-[rgb(var(--text))]">
                            {String(v || "")}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">None.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rt-panel-subtle rounded-[2.5rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Evaluation
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings (Manager)</div>
                    <div className="mt-2 space-y-3">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id]) => {
                          const current = managerRatings?.[id];
                          const display =
                            typeof current === "number" && Number.isFinite(current) ? current : (current ?? "");
                          return (
                            <div key={id} className="flex items-center justify-between gap-3">
                              <div className="text-sm text-[rgb(var(--text))]">
                                {kpiIndex?.[id]?.title || id}
                              </div>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                step={0.1}
                                value={display}
                                onChange={(e) => {
                                  const raw = String(e.target.value ?? "").trim();
                                  const parsed = raw === "" ? null : Number.parseFloat(raw);
                                  setManagerRatings((prev) => {
                                    const next = { ...(prev || {}) };
                                    if (parsed == null || !Number.isFinite(parsed)) {
                                      delete next[id];
                                      return next;
                                    }
                                    next[id] = Math.round(parsed * 10) / 10;
                                    return next;
                                  });
                                }}
                                className="rt-input w-28 py-2 px-3 text-sm"
                                placeholder="1-5"
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500">No KPIs.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Manager Notes</div>
                    <textarea
                      value={managerNotes}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      rows={6}
                      className="mt-2 rt-input p-4 text-sm resize-none"
                      placeholder="Write your evaluation notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-3 flex-wrap pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedKey) return;
                        const next = {
                          ...reviewDrafts,
                          [selectedKey]: { kpiRatings: managerRatings, notes: managerNotes, updatedAt: Date.now() },
                        };
                        setReviewDrafts(next);
                        saveManagerReviewDrafts(next);
                        showToast({ title: "Saved", message: "Manager draft saved locally." });
                      }}
                      className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("REJECT")}
                      disabled={savingReview}
                      className={[
                        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                        savingReview
                          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                          : "bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500 hover:text-black",
                      ].join(" ")}
                    >
                      {savingReview ? "Working…" : "Reject with comments"}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("SUBMIT")}
                      disabled={savingReview}
                      className={[
                        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                        savingReview
                          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                          : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
                      ].join(" ")}
                    >
                      {savingReview ? "Submitting…" : "Submit review"}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Validation: all KPI manager ratings must be between 1 and 5; reject requires at least 10 characters of comments.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
