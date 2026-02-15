import React, { useMemo } from "react";
import { ArrowUpCircle, Calendar, Clock, Download, Power, Trash2, Users } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

function parseLocalInputValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextBand(band) {
  const ladder = ["B1", "B2", "B3", "B4", "B5L", "B5H", "B6L", "B6H", "B7", "B8", "B9"];
  const idx = ladder.indexOf(band);
  if (idx < 0) return band;
  return ladder[Math.min(idx + 1, ladder.length - 1)];
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-[#111] p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group shadow-2xl">
      <div className="absolute -right-2 -top-2 opacity-10 transform rotate-12">{icon}</div>
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">{label}</p>
      <p className="text-4xl font-black mb-1">{value}</p>
    </div>
  );
}

export default function AdminDashboard({
  portalWindow,
  setPortalWindow,
  employees,
  setEmployees,
  ability6m,
  onGenerateReport,
}) {
  const portalIsOpenNow = useMemo(() => {
    const start = parseLocalInputValue(portalWindow.start);
    const end = parseLocalInputValue(portalWindow.end);
    if (!start || !end) return false;
    const now = new Date();
    return now >= start && now <= end;
  }, [portalWindow.start, portalWindow.end]);

  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const employeesSubmitted = employees.filter(e => e.submitted).length;
    const totalManagers = employees.filter(e => e.role === "Manager").length;
    const managersSubmitted = employees.filter(e => e.role === "Manager" && e.submitted).length;
    const avg6m = ability6m.length
      ? Math.round((ability6m.reduce((s, p) => s + p.avg, 0) / ability6m.length) * 10) / 10
      : 0;

    return {
      totalEmployees,
      employeesSubmitted,
      totalManagers,
      managersSubmitted,
      avg6m,
    };
  }, [employees, ability6m]);

  function promoteEmployee(employeeId) {
    setEmployees(prev =>
      prev.map(e => (e.id === employeeId ? { ...e, band: nextBand(e.band) } : e))
    );
  }

  function removeEmployee(employeeId) {
    setEmployees(prev => prev.filter(e => e.id !== employeeId));
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">
            Operational Command
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${portalIsOpenNow ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Portal is {portalIsOpenNow ? "OPEN" : "CLOSED"} for employees
            </span>
          </div>
        </div>

        <button
          onClick={onGenerateReport}
          className="inline-flex items-center gap-2 rounded-2xl bg-white text-black px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
        >
          <Download size={18} /> Generate report
        </button>
      </header>

      {/* Submission window */}
      <section className="bg-[#111] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className="text-purple-400" size={22} />
            <div>
              <h3 className="font-black uppercase tracking-tight">Submission Window</h3>
              <p className="text-gray-500 text-sm mt-1">
                Set when employees can access the portal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Power className={`${portalIsOpenNow ? "text-emerald-400" : "text-red-400"}`} size={18} />
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">
              Active now: {portalIsOpenNow ? "Yes" : "No"}
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
              Open at
            </label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="datetime-local"
                value={portalWindow.start}
                onChange={(e) => setPortalWindow(prev => ({ ...prev, start: e.target.value }))}
                className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-purple-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
              Close at
            </label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="datetime-local"
                value={portalWindow.end}
                onChange={(e) => setPortalWindow(prev => ({ ...prev, end: e.target.value }))}
                className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-purple-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => alert("Saved window (demo). Connect this to your backend next.")}
              className="w-full bg-purple-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all"
            >
              Save window
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Employees" value={stats.totalEmployees} icon={<Users className="text-purple-400" />} />
        <StatCard label="Employees Submitted" value={`${stats.employeesSubmitted}/${stats.totalEmployees}`} icon={<Users className="text-emerald-400" />} />
        <StatCard label="Managers Submitted" value={`${stats.managersSubmitted}/${stats.totalManagers}`} icon={<Users className="text-blue-400" />} />
        <StatCard label="Avg Ability (6 months)" value={stats.avg6m} icon={<ArrowUpCircle className="text-fuchsia-400" />} />
      </div>

      {/* 6-month chart */}
      <section className="bg-[#111] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div className="mb-6">
          <h3 className="text-xl font-black uppercase tracking-tight">
            Average Ability Trend (6 months)
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            Demo numbers for now — we’ll compute from real submissions later.
          </p>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ability6m} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              <XAxis dataKey="month" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} domain={[0, 5]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0c0c0c', border: '1px solid #333', borderRadius: '12px' }}
                cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#a855f7"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: "#0c0c0c" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Employee management (dashboard view) */}
      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8">
          <h3 className="text-xl font-black uppercase tracking-tight">Employee Management</h3>
          <p className="text-gray-500 text-sm mt-1">
            Promote bands or remove employees (demo actions).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-white/5">
              <tr>
                <th className="p-6 font-black">Employee</th>
                <th className="p-6 font-black">Role</th>
                <th className="p-6 font-black">Band</th>
                <th className="p-6 font-black">Submitted</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-white tracking-tight">{emp.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-1">{emp.id}</div>
                  </td>
                  <td className="p-6">
                    <span className="text-[10px] font-black uppercase px-3 py-1 bg-white/5 text-gray-300 rounded-lg border border-white/10">
                      {emp.role}
                    </span>
                  </td>
                  <td className="p-6 font-mono text-purple-300">{emp.band}</td>
                  <td className="p-6">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${
                      emp.submitted
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        : "bg-red-500/10 text-red-300 border-red-500/20"
                    }`}>
                      {emp.submitted ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="p-6 text-right px-8">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => promoteEmployee(emp.id)}
                        className="p-2.5 bg-purple-500/10 text-purple-300 hover:bg-purple-500 hover:text-white rounded-xl transition-all border border-purple-500/20"
                        title="Promote"
                      >
                        <ArrowUpCircle size={18} />
                      </button>
                      <button
                        onClick={() => removeEmployee(emp.id)}
                        className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                        title="Remove"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}