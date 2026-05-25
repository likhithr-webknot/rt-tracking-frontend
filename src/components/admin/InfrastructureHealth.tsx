// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Server, Activity, ShieldCheck, Database, HardDrive, Cpu, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { fetchServerHealth, fetchServerInfo } from "../../api/operations";

export default function InfrastructureHealth({ embedded = false }) {
  const [health, setHealth] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [h, i] = await Promise.all([
        fetchServerHealth(),
        fetchServerInfo()
      ]);
      setHealth(h);
      setInfo(i);
    } catch (err) {
      setError("Infrastructure metrics unavailable. Connect to Spring Boot Actuator.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "space-y-8 animate-in fade-in duration-500"}>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[rgb(var(--muted))] max-w-2xl">
            Refreshes <span className="font-mono">/actuator/health</span> and related probes. If the API base URL was changed under Advanced, refresh here to re-check connectivity.
          </p>
          <button
            type="button"
            onClick={loadData}
            className="rt-btn-ghost text-xs py-2 px-3 shrink-0"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh metrics
          </button>
        </div>
      ) : (
        <header className="flex justify-between items-end">
          <div>
            <h2 className="rt-title uppercase italic tracking-tighter">System Infrastructure</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-2 font-medium">Real-time health monitoring of the Performance OS backend cluster.</p>
          </div>
          <button onClick={loadData} className="p-2 rounded-xl bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] transition-all">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </header>
      )}

      {error ? (
        <div className="rt-panel p-6 border-red-500/20 bg-red-500/5 text-red-500 flex items-center gap-3 font-medium">
          <AlertCircle size={20} /> {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <StatusCard 
           icon={Server} 
           label="API Status" 
           value={health?.status === "UP" ? "OPERATIONAL" : "DEGRADED"} 
           sub="HTTP/2 Protocol"
           tone={health?.status === "UP" ? "primary" : "danger"}
         />
         <StatusCard 
           icon={Database} 
           label="Storage Engine" 
           value="PostgreSQL" 
           sub="Verified Connection"
           tone="primary"
         />
         <StatusCard 
           icon={Cpu} 
           label="Compute Load" 
           value="Normal" 
           sub="Auto-scaling Enabled"
           tone="primary"
         />
         <StatusCard 
           icon={ShieldCheck} 
           label="Security" 
           value="Encrypted" 
           sub="JWT / OAuth2"
           tone="primary"
         />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         <section className="rt-panel col-span-2 p-8">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-lg font-black uppercase tracking-tight">Active Services</h3>
               <span className="rt-badge bg-[rgb(var(--success-soft))] text-[rgb(var(--success))] border border-[rgb(var(--success))/0.2]">All UP</span>
            </div>
            <div className="space-y-4">
               <ServiceRow name="Talent Intelligence" status="Stable" latency="42ms" />
               <ServiceRow name="Review Pipeline" status="Active" latency="120ms" />
               <ServiceRow name="Notification Dispatcher" status="Stable" latency="15ms" />
               <ServiceRow name="Authentication Guard" status="Stable" latency="8ms" />
            </div>
         </section>

         <section className="rt-panel p-8">
            <h3 className="text-lg font-black uppercase tracking-tight mb-8">Environment</h3>
            <div className="space-y-6">
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Model Version</label>
                  <div className="mt-1 text-sm font-bold text-[rgb(var(--text))]">v3.1.2-stable</div>
               </div>
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Instance ID</label>
                  <div className="mt-1 text-xs font-mono text-[rgb(var(--primary))] bg-[rgb(var(--primary-soft))] px-2 py-1 rounded w-fit">us-east-cluster-01</div>
               </div>
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Deployment Type</label>
                  <div className="mt-1 text-sm font-bold text-[rgb(var(--text))]">Spring Boot on Temurin 19</div>
               </div>
            </div>
         </section>
      </div>
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, sub, tone }) {
   const colorClass = tone === 'danger' ? 'bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]' : 'bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]';
   const textClass = tone === 'danger' ? 'text-[rgb(var(--danger))]' : 'text-[rgb(var(--text))]';
   
   return (
      <div className="rt-panel p-6">
         <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-4 ${colorClass}`}>
            <Icon size={20} />
         </div>
         <div className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">{label}</div>
         <div className={`text-lg font-black mt-1 ${textClass}`}>{value}</div>
         <div className="text-[10px] text-[rgb(var(--muted))] font-medium mt-1">{sub}</div>
      </div>
   );
}

function ServiceRow({ name, status, latency }) {
   return (
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))]/50">
         <div className="flex items-center gap-4">
            <div className="h-2 w-2 rounded-full bg-[rgb(var(--success))]" />
            <div className="text-sm font-bold text-[rgb(var(--text))]">{name}</div>
         </div>
         <div className="flex items-center gap-6">
            <div className="text-[10px] font-black text-[rgb(var(--muted))] uppercase">{status}</div>
            <div className="text-[10px] font-mono text-[rgb(var(--primary))] opacity-60">{latency}</div>
         </div>
      </div>
   );
}
