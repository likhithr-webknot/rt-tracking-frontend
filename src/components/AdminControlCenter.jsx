import React, { useMemo, useState } from "react";
import {
  LayoutDashboard, Users, Settings, LogOut, ChevronLeft, ChevronRight,
  Search, Plus, Trash2, Edit3, Target
} from "lucide-react";

import AdminDashboard from "./AdminDashboard.jsx";
import EmployeeDirectory from "./EmployeeDirectory.jsx";
import KPIRegistry from "./KPIRegistry.jsx";
import SettingsPanel from "./SettingsPanel.jsx";

// --- SUB-COMPONENT: SIDEBAR ---
const Sidebar = ({ isOpen, setIsOpen, activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: "Dashboard" },
    { id: 'directory', icon: <Users size={20} />, label: "Employee Directory" },
    { id: 'kpi', icon: <Target size={20} />, label: "KPI Directory" },
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

      <div className="absolute bottom-8 w-full px-3 text-red-500">
        <button
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

// --- MAIN PORTAL ---
export default function AdminControlCenter() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  // KPI state
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [kpis, setKpis] = useState([
    { id: 1, title: "Technical Velocity", stream: "Engineering", band: "B5L", weight: "30%" },
    { id: 2, title: "Strategic Mentorship", stream: "Engineering", band: "B6H", weight: "20%" },
    { id: 3, title: "SLA Compliance", stream: "Support", band: "B4", weight: "50%" },
  ]);

  // Portal Window state
  const [portalWindow, setPortalWindow] = useState(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(9, 0, 0, 0)
    const end = new Date(now)
    end.setHours(18, 0, 0, 0)
    return { start: toLocalInputValue(start), end: toLocalInputValue(end) }
  })

  // Employee state (demo)
  const [employees, setEmployees] = useState([
    { id: "EMP001", name: "Alice Johnson", role: "Admin", band: "B5L", submitted: true },
    { id: "EMP002", name: "Bob Smith", role: "Manager", band: "B6H", submitted: true },
    { id: "EMP003", name: "Charlie Davis", role: "Employee", band: "B8", submitted: false },
    { id: "EMP004", name: "Dana Lee", role: "Manager", band: "B5H", submitted: false },
  ])

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
      />

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} p-6 lg:p-12`}>
        {activeTab === "dashboard" && (
          <AdminDashboard
            portalWindow={portalWindow}
            setPortalWindow={setPortalWindow}
            employees={employees}
            setEmployees={setEmployees}
            ability6m={ability6m}
            onGenerateReport={generateReport}
          />
        )}

        {activeTab === "directory" && (
          <EmployeeDirectory
            employees={employees}
            setEmployees={setEmployees}
          />
        )}

        {activeTab === "kpi" && (
          <KPIRegistry
            kpis={kpis}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddKpi={() => setShowKPIModal(true)}
          />
        )}

        {activeTab === "settings" && <SettingsPanel />}
      </main>

      {/* KPI Modal hook (placeholder) */}
      {showKPIModal ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black uppercase tracking-tight">Add KPI (placeholder)</h3>
              <button
                onClick={() => setShowKPIModal(false)}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-500 text-sm mt-3">
              Next: build a real form + connect it to your backend.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}