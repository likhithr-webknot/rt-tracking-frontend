import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, Users, Settings, LogOut, ChevronLeft, ChevronRight,
  ClipboardCheck, Search, Plus, Trash2, Edit3, Sparkles, Target, Award, Bot, X
} from "lucide-react";

import AdminDashboard from "./AdminDashboard.jsx";
import AdminSubmissions from "./AdminSubmissions.jsx";
import AIAgentsConfig from "./AIAgentsConfig.jsx";
import Certifications from "./Certifications.jsx";
import EmployeeDirectory from "./EmployeeDirectory.jsx";
import KPIRegistry from "./KPIRegistry.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import WebknotValueDirectory from "./WebknotValueDirectory.jsx";
import Toast from "../shared/Toast.jsx";
import { fetchEmployees, normalizeEmployees } from "../../api/employees.js";
import {
  addKpiDefinition,
  fetchKpiDefinitions,
  normalizeKpiDefinition,
  normalizeKpiDefinitions,
  updateKpiDefinition
} from "../../api/kpi-definitions.js";
import { fetchSubmissionWindowCurrent } from "../../api/submission-window.js";
import {
  addCertification,
  deleteCertification,
  fetchCertifications,
  normalizeCertifications,
  updateCertification
} from "../../api/certifications.js";
import { fetchPortalAdmin } from "../../api/portal.js";
import { fetchValues, addValue, updateValue, deleteValue as deleteValueApi, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";

// --- SUB-COMPONENT: SIDEBAR ---
const Sidebar = ({ isOpen, setIsOpen, activeTab, setActiveTab, onLogout, account }) => {
  const isAdmin = String(account?.role || "").trim().toLowerCase() === "admin";
  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: "Dashboard" },
    { id: 'submissions', icon: <ClipboardCheck size={20} />, label: "Monthly Submissions" },
    { id: 'directory', icon: <Users size={20} />, label: "Employee Directory" },
    { id: 'kpi', icon: <Target size={20} />, label: "KPI Directory" },
    { id: 'certifications', icon: <Award size={20} />, label: "Certifications" },
    { id: 'values', icon: <Sparkles size={20} />, label: "Webknot Value Directory" },
    ...(isAdmin ? [{ id: 'agents', icon: <Bot size={20} />, label: "Configure AI Agents" }] : []),
    { id: 'settings', icon: <Settings size={20} />, label: "Settings" },
  ];

  return (
    <aside className={`fixed left-0 top-0 h-full bg-[#111] border-r border-white/5 transition-all duration-300 z-50 ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-6 flex items-center justify-between">
        {isOpen && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-purple-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">W</div>
            <span className="font-black tracking-tighter uppercase italic text-white">Webknot</span>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-white/5 rounded-lg text-gray-500 transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="mt-10 px-3 space-y-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                'w-full rounded-2xl transition-all duration-200',
                'px-4 py-4',
                isOpen ? 'flex items-center justify-start gap-4' : 'flex items-center justify-center',
                isActive
                  ? 'bg-purple-600 text-white shadow-xl shadow-purple-900/20'
                  : 'text-gray-500 hover:bg-white/5 hover:text-white',
              ].join(' ')}
              title={!isOpen ? item.label : undefined}
            >
              <span className="w-6 grid place-items-center shrink-0">
                {item.icon}
              </span>
              {isOpen && (
                <span className="text-sm font-bold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="absolute bottom-24 w-full px-3">
        <div
          className={[
            "rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-gray-200",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Signed In
          </div>
          <div className="mt-2 font-bold tracking-tight text-white truncate">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-purple-300 truncate">
            {account?.role || "Employee"}
          </div>
          <div className="mt-1 text-xs text-gray-400 truncate">
            {account?.subtitle || "—"}
          </div>
        </div>

        {!isOpen ? (
          <div className="grid place-items-center text-gray-500">
            <div
              className="h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.03] grid place-items-center"
              title={[
                account?.name || account?.email || "Unknown",
                account?.role || "Employee",
                account?.subtitle || "",
                account?.role || "Employee",
              ].filter(Boolean).join(" • ")}
            >
              <Users size={18} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="absolute bottom-8 w-full px-3 text-red-500">
        <button
          onClick={onLogout}
          className={[
            'w-full rounded-xl transition-all font-bold group',
            isOpen ? 'flex items-center justify-start gap-4 p-3' : 'flex items-center justify-center p-3',
            'hover:bg-red-500/10',
          ].join(' ')}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-6 grid place-items-center shrink-0">
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          </span>
          {isOpen && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

// --- HELPERS (report + window defaults live here) ---
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function downloadTextFile({ filename, text, mime = "text/plain" }) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const EMPLOYEE_EXTRAS_STORAGE_KEY = "rt_tracking_employee_extras_v1";
const CERTIFICATION_CATALOG_STORAGE_KEY = "rt_tracking_certification_catalog_v1";

function defaultPortalWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(18, 0, 0, 0);
  return {
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    meta: { lastAction: "default", updatedAt: Date.now() },
  };
}

function portalWindowFromServer(data) {
  const obj = data && typeof data === "object" ? data : {};
  const startAt = obj.startAt ? new Date(obj.startAt) : null;
  const endAt = obj.endAt ? new Date(obj.endAt) : null;
  return {
    start: startAt && !Number.isNaN(startAt.getTime()) ? toLocalInputValue(startAt) : "",
    end: endAt && !Number.isNaN(endAt.getTime()) ? toLocalInputValue(endAt) : "",
    manualClosed: Boolean(obj.manualClosed),
    cycleKey: typeof obj.cycleKey === "string" ? obj.cycleKey : null,
    meta: { lastAction: "server", updatedAt: Date.now() },
  };
}

function loadEmployeeExtras() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_EXTRAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveEmployeeExtras(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMPLOYEE_EXTRAS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function loadCertificationCatalogFromStorage() {
  if (typeof window === "undefined") return { items: [], hasStored: false };
  try {
    const raw = window.localStorage.getItem(CERTIFICATION_CATALOG_STORAGE_KEY);
    if (raw == null) return { items: [], hasStored: false };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [];
    return { items: normalizeCertificationCatalog(items), hasStored: true };
  } catch {
    return { items: [], hasStored: false };
  }
}

function saveCertificationCatalogToStorage(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CERTIFICATION_CATALOG_STORAGE_KEY,
      JSON.stringify(normalizeCertificationCatalog(items))
    );
  } catch {
    // ignore
  }
}

function hashFNV1a32(text) {
  // Deterministic, tiny, good enough for local IDs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeCertificationId(name) {
  const key = String(name ?? "").trim().toLowerCase();
  const h = hashFNV1a32(key).toString(36);
  return `CERT_${h}`;
}

function normalizeCertificationCatalog(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seenByName = new Set();
  const seenById = new Set();

  for (const raw of list) {
    const name = String(raw?.name ?? raw ?? "").trim();
    if (!name) continue;
    const nameKey = name.toLowerCase();
    if (seenByName.has(nameKey)) continue;
    seenByName.add(nameKey);

    const idRaw = String(raw?.id ?? "").trim();
    const id = idRaw || makeCertificationId(name);
    if (seenById.has(id)) continue;
    seenById.add(id);

    const listed = raw && typeof raw === "object" ? Boolean(raw.listed ?? true) : true;
    const createdAt =
      raw && typeof raw === "object" && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now();

    out.push({ id, name, listed, createdAt });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function applyEmployeeExtras(employees, extras) {
  return employees.map((e) => {
    const x = extras?.[e.id];
    if (!x || typeof x !== "object") return e;

    const recognitions =
      typeof x.recognitions === "number" && Number.isFinite(x.recognitions)
        ? x.recognitions
        : e.recognitions ?? 0;
    const certifications = Array.isArray(x.certifications) ? x.certifications : e.certifications ?? [];

    return { ...e, recognitions, certifications };
  });
}

// --- MAIN PORTAL ---
export default function AdminControlCenter({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const isAdmin = String(auth?.role || auth?.claims?.role || "").trim().toLowerCase() === "admin";

  // KPI state
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [kpiModalMode, setKpiModalMode] = useState("add"); // "add" | "edit"
  const [searchQuery, setSearchQuery] = useState("");
  const [kpis, setKpis] = useState([]);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState("");
  const [kpiDraft, setKpiDraft] = useState({ title: "", stream: "", band: "", weight: "" });
  const [editingKpiId, setEditingKpiId] = useState(null);
  const [kpiSaving, setKpiSaving] = useState(false);

  // Webknot Values (from API)
  const [valuesSearchQuery, setValuesSearchQuery] = useState("");
  const [values, setValues] = useState([]);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState("");
  const [showValueModal, setShowValueModal] = useState(false);
  const [valueModalMode, setValueModalMode] = useState("add"); // "add" | "edit"
  const [editingValueId, setEditingValueId] = useState(null);
  const [valueDraft, setValueDraft] = useState({ title: "", pillar: "", description: "" });
  const [valueSaving, setValueSaving] = useState(false);

  // Certifications (admin registry)
  const [certificationCatalog, setCertificationCatalog] = useState(() => {
    const { items } = loadCertificationCatalogFromStorage();
    return Array.isArray(items) ? items : [];
  });
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState("");

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((nextToast) => {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        await fetchPortalAdmin({ signal: controller.signal });
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

  const reloadCertifications = useCallback(async ({ signal } = {}) => {
    setCertificationsError("");
    setCertificationsLoading(true);
    try {
      const data = await fetchCertifications({ activeOnly: false, signal });
      setCertificationCatalog(normalizeCertifications(data));
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      setCertificationsError(err?.message || "Failed to load certifications.");
      throw err;
    } finally {
      setCertificationsLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadCertifications({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadCertifications]);

  function openKpiModal() {
    setKpiModalMode("add");
    setEditingKpiId(null);
    setKpiDraft({ title: "", stream: "", band: "", weight: "" });
    setShowKPIModal(true);
  }

  function openEditKpiModal(kpi) {
    if (!kpi) return;
    setKpiModalMode("edit");
    setEditingKpiId(kpi.id);
    setKpiDraft({
      title: String(kpi.title ?? ""),
      stream: String(kpi.stream ?? ""),
      band: String(kpi.band ?? ""),
      weight: String(kpi.weight ?? ""),
    });
    setShowKPIModal(true);
  }

  function closeKpiModal() {
    if (kpiSaving) return;
    setShowKPIModal(false);
  }

  function openValueModal() {
    setValueModalMode("add");
    setEditingValueId(null);
    setValueDraft({ title: "", pillar: "", description: "" });
    setShowValueModal(true);
  }

  function openEditValueModal(v) {
    if (!v) return;
    setValueModalMode("edit");
    setEditingValueId(v.id);
    setValueDraft({
      title: String(v.title ?? ""),
      pillar: String(v.pillar ?? ""),
      description: String(v.description ?? ""),
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
      description: valueDraft.description.trim(),
    };

    if (!payload.title || !payload.pillar || !payload.description) {
      showToast({ title: "Missing fields", message: "Fill value, evaluation criteria, and description." });
      return;
    }

    setValueSaving(true);
    try {
      let res;
      if (valueModalMode === "edit") {
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
        description: normalized?.description ?? payload.description 
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
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
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
    const ok = window.confirm(`Delete "${v.title}"?`);
    if (!ok) return;
    
    (async () => {
      try {
        await deleteValueApi(String(v.id));
        setValues((prev) => prev.filter((x) => String(x.id) !== String(v.id)));
        showToast({ title: "Value deleted", message: v.title });
        await reloadValues().catch(() => {});
      } catch (err) {
        if (err?.status === 401) {
          showToast({ title: "Session expired", message: "Please login again." });
          onLogout?.();
          return;
        }
        showToast({ title: "Delete failed", message: err?.message || "Please try again." });
      }
    })();
  }

  async function submitKpi(e) {
    e.preventDefault();
    const payload = {
      id: editingKpiId,
      title: kpiDraft.title.trim(),
      stream: kpiDraft.stream.trim(),
      band: kpiDraft.band.trim(),
      weight: kpiDraft.weight.trim(),
    };

    if (!payload.title || !payload.stream || !payload.band || !payload.weight) {
      showToast({ title: "Missing fields", message: "Fill title, stream, band, and weight." });
      return;
    }

    const toPercent = (value) => {
      const text = String(value ?? "").trim();
      if (!text) return 0;
      const numericText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
      const parsed = Number.parseFloat(numericText);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    // Enforce: per band, total weightage must not exceed 100%.
    const nextBand = payload.band;
    const nextWeight = toPercent(payload.weight);
    const existingSum = kpis
      .filter((k) => String(k?.band ?? "").trim() === nextBand)
      .filter((k) => String(k?.id) !== String(payload.id))
      .reduce((sum, k) => sum + toPercent(k?.weight), 0);
    const nextTotal = Math.round((existingSum + nextWeight) * 10) / 10;
    if (nextTotal > 100) {
      showToast({
        title: "Invalid weightage",
        message: `Total for ${nextBand} would be ${nextTotal}%. Keep it within 100%.`,
      });
      return;
    }

    setKpiSaving(true);
    try {
      const res =
        kpiModalMode === "edit"
          ? await updateKpiDefinition(payload)
          : await addKpiDefinition(payload);
      const normalized = normalizeKpiDefinition(res, payload);

      setKpis((prev) => {
        const idx = prev.findIndex((k) => String(k.id) === String(normalized.id));
        if (idx === -1) return [normalized, ...prev];
        return prev.map((k) => (String(k.id) === String(normalized.id) ? normalized : k));
      });

      showToast({
        title: kpiModalMode === "edit" ? "KPI updated" : "KPI added",
        message: normalized.title,
      });
      setShowKPIModal(false);

      // Prefer server truth if the backend returns a minimal payload.
      await reloadKpis().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({
        title: kpiModalMode === "edit" ? "Update KPI failed" : "Add KPI failed",
        message: err?.message || "Please try again.",
      });
    } finally {
      setKpiSaving(false);
    }
  }

  const reloadKpis = useCallback(async ({ signal } = {}) => {
    setKpisError("");
    setKpisLoading(true);
    try {
      const data = await fetchKpiDefinitions({ signal });
      setKpis(normalizeKpiDefinitions(data));
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load KPIs.";
      setKpisError(message);
      throw err;
    } finally {
      setKpisLoading(false);
    }
  }, [onLogout, showToast]);

  const reloadValues = useCallback(async ({ signal } = {}) => {
    setValuesError("");
    setValuesLoading(true);
    try {
      const data = await fetchValues(false, { signal });
      const normalized = normalizeWebknotValuesList(data);
      setValues(normalized.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || ""), undefined, { numeric: true })));
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load values.";
      setValuesError(message);
      throw err;
    } finally {
      setValuesLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadKpis({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadKpis]);

  useEffect(() => {
    const controller = new AbortController();
    reloadValues({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadValues]);

  // Portal Window state (server)
  const [portalWindow, setPortalWindow] = useState(() => defaultPortalWindow());
  const [portalWindowLoading, setPortalWindowLoading] = useState(false);
  const [portalWindowError, setPortalWindowError] = useState("");

  const reloadPortalWindow = useCallback(async ({ signal } = {}) => {
    setPortalWindowError("");
    setPortalWindowLoading(true);
    try {
      const data = await fetchSubmissionWindowCurrent({ signal });
      setPortalWindow((prev) => {
        const next = portalWindowFromServer(data);
        // Keep any in-progress edits only if server returned empty/invalid.
        if (!next.start) return prev;
        return next;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      setPortalWindowError(err?.message || "Failed to load submission window.");
      throw err;
    } finally {
      setPortalWindowLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadPortalWindow({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadPortalWindow]);

  // Employee state (demo)
  const [employees, setEmployees] = useState([
    { id: "EMP001", name: "Alice Johnson", role: "Admin", band: "B5L", submitted: true },
    { id: "EMP002", name: "Bob Smith", role: "Manager", band: "B6H", submitted: true },
    { id: "EMP003", name: "Charlie Davis", role: "Employee", band: "B8", submitted: false },
    { id: "EMP004", name: "Dana Lee", role: "Manager", band: "B5H", submitted: false },
  ])
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

  const reloadEmployees = useCallback(async ({ signal } = {}) => {
    setEmployeesError("");
    setEmployeesLoading(true);
    try {
      const data = await fetchEmployees({ signal });
      const base = normalizeEmployees(data);
      const extras = loadEmployeeExtras();
      setEmployees(applyEmployeeExtras(base, extras));
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load employees.";
      setEmployeesError(message);
      throw err;
    } finally {
      setEmployeesLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadEmployees({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadEmployees]);

  useEffect(() => {
    saveCertificationCatalogToStorage(certificationCatalog);
  }, [certificationCatalog]);

  const addCertificationToCatalog = useCallback(async (name) => {
    const cert = String(name ?? "").trim();
    if (!cert) return;
    try {
      await addCertification({ name: cert, listed: true });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [onLogout, reloadCertifications, showToast]);

  const editCertificationInCatalog = useCallback(async (id, nextName) => {
    const targetId = String(id ?? "").trim();
    const name = String(nextName ?? "").trim();
    if (!targetId || !name) return;
    const current = certificationCatalog.find((c) => String(c?.id) === targetId) || null;
    const listed = current ? Boolean(current.listed) : true;
    try {
      await updateCertification(targetId, { name, listed });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [certificationCatalog, onLogout, reloadCertifications, showToast]);

  const setCertificationListed = useCallback(async (id, listed) => {
    const targetId = String(id ?? "").trim();
    if (!targetId) return;
    const current = certificationCatalog.find((c) => String(c?.id) === targetId) || null;
    const name = String(current?.name ?? "").trim();
    if (!name) {
      await reloadCertifications().catch(() => {});
      throw new Error("Missing certification name.");
    }
    try {
      await updateCertification(targetId, { name, listed: Boolean(listed) });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [certificationCatalog, onLogout, reloadCertifications, showToast]);

  const deleteCertificationFromCatalog = useCallback(async (id) => {
    const targetId = String(id ?? "").trim();
    if (!targetId) return;
    try {
      await deleteCertification(targetId);
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [onLogout, reloadCertifications, showToast]);

  const _incrementEmployeeRecognitions = useCallback((employeeId) => {
    const id = String(employeeId);
    setEmployees((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, recognitions: Number(e.recognitions || 0) + 1 } : e
      );

      const extras = loadEmployeeExtras();
      const current = extras[id] && typeof extras[id] === "object" ? extras[id] : {};
      saveEmployeeExtras({
        ...extras,
        [id]: {
          ...current,
          recognitions: (Number(current.recognitions) || 0) + 1,
          certifications: Array.isArray(current.certifications) ? current.certifications : [],
        },
      });

      return next;
    });
  }, []);

  const _addEmployeeCertification = useCallback((employeeId, certification) => {
    const id = String(employeeId);
    const cert = String(certification || "").trim();
    if (!cert) return;

    // Enforce: only certifications in the admin registry can be added/completed.
    const allowed = certificationCatalog.some(
      (c) =>
        Boolean(c?.listed) &&
        String(c?.name ?? "").trim().toLowerCase() === cert.toLowerCase()
    );
    if (!allowed) return;

    setEmployees((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        const existing = Array.isArray(e.certifications) ? e.certifications : [];
        if (existing.some((c) => String(c).toLowerCase() === cert.toLowerCase())) return e;
        return { ...e, certifications: [cert, ...existing] };
      });

      const extras = loadEmployeeExtras();
      const current = extras[id] && typeof extras[id] === "object" ? extras[id] : {};
      const existing = Array.isArray(current.certifications) ? current.certifications : [];
      const merged =
        existing.some((c) => String(c).toLowerCase() === cert.toLowerCase())
          ? existing
          : [cert, ...existing];
      saveEmployeeExtras({
        ...extras,
        [id]: {
          ...current,
          recognitions: Number(current.recognitions) || 0,
          certifications: merged,
        },
      });

      return next;
    });
  }, [certificationCatalog]);

  const account = useMemo(() => {
    const role = String(auth?.role || auth?.claims?.role || "").trim() || "Employee";
    const rawEmail = String(auth?.email || auth?.claims?.sub || "").trim();

    // Cookie-based auth may not expose email in JS unless we persist it ourselves.
    // Best-effort fallback: if there's exactly one employee with this role, use that record.
    let email = rawEmail || null;
    if (!email) {
      const roleKey = role.toLowerCase();
      const candidates = employees
        .filter((e) => String(e?.role || "").trim().toLowerCase() === roleKey)
        .filter((e) => String(e?.email || "").trim());
      if (candidates.length === 1) {
        email = String(candidates[0].email).trim();
      }
    }

    let name = String(auth?.employeeName || "").trim() || null;
    let designation = null;
    let stream = String(auth?.stream || "").trim() || null;
    let band = String(auth?.band || "").trim() || null;
    if (email) {
      const match = employees.find(
        (e) => String(e?.email || "").trim().toLowerCase() === email.toLowerCase()
      );
      if (match?.name) name = match.name;
      if (match?.designation) designation = match.designation;
      if (match?.stream) stream = match.stream;
      if (match?.band) band = match.band;
    }

    const subtitle =
      designation ||
      [stream, band].filter(Boolean).join(" • ") ||
      null;

    return { email, role, name: name || email, subtitle };
  }, [auth?.email, auth?.claims?.sub, auth?.role, auth?.claims?.role, auth?.employeeName, auth?.stream, auth?.band, employees]);

  const currentEmployeeId = useMemo(() => {
    if (auth?.employeeId) return String(auth.employeeId);
    const email = String(auth?.email || auth?.claims?.sub || "").trim();
    if (!email) return null;
    const match = employees.find(
      (e) => String(e?.email || "").trim().toLowerCase() === email.toLowerCase()
    );
    return match?.id ?? null;
  }, [auth?.employeeId, auth?.email, auth?.claims?.sub, employees]);

  // Ability trend (demo)
  const ability6m = useMemo(() => ([
    { month: "Sep", avg: 3.6 },
    { month: "Oct", avg: 3.7 },
    { month: "Nov", avg: 3.8 },
    { month: "Dec", avg: 3.9 },
    { month: "Jan", avg: 4.0 },
    { month: "Feb", avg: 4.1 },
  ]), [])

  function generateReport() {
    const lines = [
      "Report Type,Admin Control Center Summary",
      `Generated At,${new Date().toISOString()}`,
      `Portal Window Start,${portalWindow.start}`,
      `Portal Window End,${portalWindow.end}`,
      "",
      "Employees",
      "Employee ID,Name,Role,Band,Submitted",
      ...employees.map(e => `${e.id},${e.name},${e.role},${e.band},${e.submitted ? "Yes" : "No"}`)
    ].join("\n")

    downloadTextFile({
      filename: "admin-report.csv",
      text: lines,
      mime: "text/csv"
    })
  }

  return (
    <div className="flex min-h-screen bg-[#080808] text-slate-100 font-sans overflow-x-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        account={account}
      />

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} p-6 lg:p-12`}>
        {activeTab === "dashboard" && (
          <AdminDashboard
            portalWindow={portalWindow}
            setPortalWindow={setPortalWindow}
            portalWindowLoading={portalWindowLoading}
            portalWindowError={portalWindowError}
            reloadPortalWindow={reloadPortalWindow}
            employees={employees}
            setEmployees={setEmployees}
            reloadEmployees={reloadEmployees}
            employeesLoading={employeesLoading}
            employeesError={employeesError}
            ability6m={ability6m}
            onGenerateReport={generateReport}
          />
        )}

        {activeTab === "submissions" && (
          <AdminSubmissions onLogout={onLogout} />
        )}

        {activeTab === "certifications" && (
          <>
            {certificationsError ? (
              <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                Failed to load certifications: <span className="font-mono">{certificationsError}</span>
              </div>
            ) : null}
            {certificationsLoading ? (
              <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
                Loading certifications…
              </div>
            ) : null}
            <Certifications
              certificationCatalog={certificationCatalog}
              onAddCertificationToCatalog={addCertificationToCatalog}
              onEditCertificationInCatalog={editCertificationInCatalog}
              onSetCertificationListed={setCertificationListed}
              onDeleteCertificationFromCatalog={deleteCertificationFromCatalog}
            />
          </>
        )}

        {activeTab === "directory" && (
          <EmployeeDirectory
            employees={employees}
            setEmployees={setEmployees}
            reloadEmployees={reloadEmployees}
            employeesLoading={employeesLoading}
            employeesError={employeesError}
            currentEmployeeId={currentEmployeeId}
          />
        )}

        {activeTab === "kpi" && (
          <KPIRegistry
            kpis={kpis}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddKpi={openKpiModal}
            onEditKpi={openEditKpiModal}
            loading={kpisLoading}
            error={kpisError}
            onReload={() => reloadKpis().catch(() => {})}
          />
        )}

        {activeTab === "values" && (
          <>
            {valuesError ? (
              <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                Failed to load values: <span className="font-mono">{valuesError}</span>
              </div>
            ) : null}
            {valuesLoading ? (
              <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
                Loading values…
              </div>
            ) : null}
            <WebknotValueDirectory
              values={values}
              searchQuery={valuesSearchQuery}
              setSearchQuery={setValuesSearchQuery}
              onAddValue={openValueModal}
              onEditValue={openEditValueModal}
              onDeleteValue={deleteValue}
            />
          </>
        )}

        {activeTab === "agents" && isAdmin ? <AIAgentsConfig /> : null}

        {activeTab === "settings" && <SettingsPanel />}
      </main>

      {/* KPI Modal */}
      {showKPIModal ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">
                  {kpiModalMode === "edit" ? "Edit KPI" : "Add KPI"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {kpiModalMode === "edit" ? (
                    <span>
                      Updating <span className="font-mono">{String(editingKpiId ?? "")}</span>
                    </span>
                  ) : (
                    "Creates a new KPI definition."
                  )}
                </p>
              </div>
              <button
                onClick={closeKpiModal}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitKpi} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Objective *
                </label>
                <input
                  value={kpiDraft.title}
                  onChange={(e) => setKpiDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., Technical Velocity"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Stream *
                  </label>
                  <input
                    value={kpiDraft.stream}
                    onChange={(e) => setKpiDraft((d) => ({ ...d, stream: e.target.value }))}
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                    placeholder="e.g., Engineering"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Band *
                  </label>
                  <input
                    value={kpiDraft.band}
                    onChange={(e) => setKpiDraft((d) => ({ ...d, band: e.target.value }))}
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                    placeholder="e.g., B5L"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Weight *
                </label>
                <input
                  value={kpiDraft.weight}
                  onChange={(e) => setKpiDraft((d) => ({ ...d, weight: e.target.value }))}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., 30%"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeKpiModal}
                  disabled={kpiSaving}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={kpiSaving}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {kpiSaving ? "Saving…" : (kpiModalMode === "edit" ? "Save Changes" : "Add KPI")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Values Modal */}
      {showValueModal ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">
                  {valueModalMode === "edit" ? "Edit Value" : "Add Value"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {valueModalMode === "edit" ? (
                    <span>
                      Updating <span className="font-mono">{String(editingValueId ?? "")}</span>
                    </span>
                  ) : (
                    "Creates a new Webknot value."
                  )}
                </p>
              </div>
              <button
                onClick={closeValueModal}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitValue} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Value *
                </label>
                <input
                  value={valueDraft.title}
                  onChange={(e) => setValueDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., Own The Outcome"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Evaluation Criteria *
                </label>
                <input
                  value={valueDraft.pillar}
                  onChange={(e) => setValueDraft((d) => ({ ...d, pillar: e.target.value }))}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                  placeholder="e.g., Ownership"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Description *
                </label>
                <textarea
                  value={valueDraft.description}
                  onChange={(e) => setValueDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={4}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all resize-none"
                  placeholder="Write a short definition of the value..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeValueModal}
                  disabled={valueSaving}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={valueSaving}
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {valueSaving ? "Saving…" : (valueModalMode === "edit" ? "Save Changes" : "Add Value")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
