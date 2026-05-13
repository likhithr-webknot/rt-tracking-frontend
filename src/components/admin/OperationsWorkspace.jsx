import React, { useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  ClipboardList,
  Database,
  Download,
  FileUp,
  FolderKanban,
  KeyRound,
  Play,
  RefreshCw,
  Search,
  Send,
  ServerCog,
  UserCog,
  Users,
} from "lucide-react";
import { operations } from "../../api/operations.js";

const today = new Date().toISOString().slice(0, 10);

function safeJson(text, fallback = {}) {
  const raw = String(text || "").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Payload must be valid JSON.");
  }
}

function fileNameFromPath(path, fallback = "export.bin") {
  const bits = String(path || "").split("/").filter(Boolean);
  return bits[bits.length - 1] || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ResultPanel({ state }) {
  if (!state?.status) return null;
  const ok = state.status === "success";
  return (
    <div className={[
      "mt-4 rounded-md border p-3 text-sm",
      ok
        ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
        : "border-red-500/25 bg-red-500/5 text-red-700 dark:text-red-300",
    ].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{ok ? "Completed" : "Failed"}</span>
        {state.label ? <span className="text-xs opacity-80">{state.label}</span> : null}
      </div>
      {typeof state.data === "string" ? (
        <div className="mt-2 whitespace-pre-wrap break-words">{state.data}</div>
      ) : (
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/5 p-3 text-xs text-[rgb(var(--text))] dark:bg-white/5">
          {JSON.stringify(state.data ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rt-input w-full px-3 py-2 text-sm"
      />
    </label>
  );
}

function JsonField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rt-input min-h-[140px] w-full px-3 py-2 font-mono text-xs"
        spellCheck={false}
      />
    </label>
  );
}

function ActionButton({ children, icon = Play, busy, onClick, variant = "primary" }) {
  const cls = variant === "ghost" ? "rt-btn-ghost" : "rt-btn-primary";
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${cls} rt-btn-sm inline-flex items-center gap-2`}>
      {busy ? <RefreshCw size={15} className="animate-spin" /> : React.createElement(icon, { size: 15 })}
      <span>{children}</span>
    </button>
  );
}

function ActionCard({ title, description, icon, children }) {
  return (
    <section className="rt-panel p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">
          {React.createElement(icon, { size: 18 })}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[rgb(var(--text))]">{title}</h3>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function useRunner() {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  async function run(label, fn, { downloadName } = {}) {
    setBusy(label);
    setResult(null);
    try {
      const data = await fn();
      if (data instanceof Blob) {
        downloadBlob(data, downloadName || "export.bin");
        setResult({ status: "success", label, data: { downloaded: downloadName || "export.bin", size: data.size } });
      } else {
        setResult({ status: "success", label, data });
      }
    } catch (err) {
      setResult({ status: "error", label, data: err?.message || "Request failed." });
    } finally {
      setBusy("");
    }
  }

  return { busy, result, run };
}

function DomainTabs({ active, setActive, items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={[
              "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "border-[rgb(var(--primary))]/40 bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]"
                : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]",
            ].join(" ")}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OperationsWorkspace() {
  const domains = useMemo(() => ([
    { id: "users", label: "Users", icon: Users },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "allocations", label: "Allocations", icon: Database },
    { id: "timelogs", label: "Timelogs", icon: CalendarClock },
    { id: "requests", label: "Requests", icon: ClipboardList },
    { id: "reports", label: "Reports", icon: Download },
    { id: "imports", label: "Imports", icon: FileUp },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "cron", label: "Cron", icon: ServerCog },
    { id: "reference", label: "Reference", icon: Search },
    { id: "auth", label: "Auth", icon: KeyRound },
  ]), []);
  const [active, setActive] = useState("users");
  const { busy, result, run } = useRunner();

  const [email, setEmail] = useState("");
  const [empId, setEmpId] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [userId, setUserId] = useState("");
  const [rowId, setRowId] = useState("");
  const [date, setDate] = useState(today);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [requestType, setRequestType] = useState("LEAVE");
  const [department, setDepartment] = useState("");
  const [bandId, setBandId] = useState("");
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState("{\n  \n}");

  const parsedPayload = () => safeJson(payload, {});
  const isBusy = (label) => busy === label;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="rt-kicker">API Operations</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Endpoint Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-[rgb(var(--muted))]">
            Run the operational screens backed by the `/api/v1` controllers: users, projects, allocations, timelogs,
            requests, reports, uploads, notifications, cron triggers, and reference lists.
          </p>
        </div>
      </div>

      <DomainTabs active={active} setActive={setActive} items={domains} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
          {active === "users" ? (
            <>
              <ActionCard title="Lookup & Directory" description="Fetch user lists, user profiles, role metadata, manager lists, and client/project status." icon={Users}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Email" value={email} onChange={setEmail} placeholder="name@webknot.in" />
                  <TextField label="Employee ID" value={empId} onChange={setEmpId} placeholder="EMP001" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton busy={isBusy("GET /users")} icon={Search} onClick={() => run("GET /users", () => operations.users.list())}>List Users</ActionButton>
                  <ActionButton busy={isBusy("GET /user by email")} icon={Search} onClick={() => run("GET /user by email", () => operations.users.getByEmail(email))}>By Email</ActionButton>
                  <ActionButton busy={isBusy("GET /user by empId")} icon={Search} onClick={() => run("GET /user by empId", () => operations.users.getByEmpId(empId))}>By Emp ID</ActionButton>
                  <ActionButton busy={isBusy("GET /user/role")} icon={UserCog} onClick={() => run("GET /user/role", () => operations.users.role())}>Role</ActionButton>
                  <ActionButton busy={isBusy("GET /email-name")} icon={Users} onClick={() => run("GET /email-name", () => operations.users.emailName())}>Email Names</ActionButton>
                  <ActionButton busy={isBusy("GET managers")} icon={Users} onClick={() => run("GET managers", () => operations.users.managersForUser(email))}>Managers</ActionButton>
                  <ActionButton busy={isBusy("GET client status")} icon={FolderKanban} onClick={() => run("GET client status", () => operations.users.clientProjectStatus())}>Client Status</ActionButton>
                </div>
              </ActionCard>
              <ActionCard title="User Mutations" description="Create users, assign roles, update leave details, or update employee profile data." icon={UserCog}>
                <JsonField label="JSON payload" value={payload} onChange={setPayload} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton busy={isBusy("POST /users")} icon={Send} onClick={() => run("POST /users", () => operations.users.onboard(parsedPayload()))}>Create User</ActionButton>
                  <ActionButton busy={isBusy("POST /assign-role")} icon={UserCog} onClick={() => run("POST /assign-role", () => operations.users.assignRole(parsedPayload()))}>Assign Role</ActionButton>
                  <ActionButton busy={isBusy("PUT /update-leave")} icon={Send} onClick={() => run("PUT /update-leave", () => operations.users.updateLeave(empId, parsedPayload()))}>Update Leave</ActionButton>
                  <ActionButton busy={isBusy("PUT employee profile")} icon={Send} onClick={() => run("PUT employee profile", () => operations.users.updateEmployeeProfile(empId, parsedPayload()))}>Update Employee</ActionButton>
                </div>
              </ActionCard>
            </>
          ) : null}

          {active === "projects" ? (
            <ActionCard title="Project Directory" description="Create projects, inspect project directories, and view manager project assignments." icon={FolderKanban}>
              <TextField label="Project Code" value={projectCode} onChange={setProjectCode} placeholder="PRJ001" />
              <div className="mt-3">
                <JsonField label="Project JSON payload" value={payload} onChange={setPayload} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET /projects")} icon={Search} onClick={() => run("GET /projects", () => operations.projects.list())}>Projects</ActionButton>
                <ActionButton busy={isBusy("GET /projects/all")} icon={Search} onClick={() => run("GET /projects/all", () => operations.projects.listAll())}>All Projects</ActionButton>
                <ActionButton busy={isBusy("GET /project")} icon={Search} onClick={() => run("GET /project", () => operations.projects.get(projectCode))}>By Code</ActionButton>
                <ActionButton busy={isBusy("POST /project")} icon={Send} onClick={() => run("POST /project", () => operations.projects.create(parsedPayload()))}>Create</ActionButton>
                <ActionButton busy={isBusy("POST /projects")} icon={Send} onClick={() => run("POST /projects", () => operations.projects.bulkCreate(parsedPayload()))}>Bulk Create</ActionButton>
                <ActionButton busy={isBusy("GET manager projects")} icon={Users} onClick={() => run("GET manager projects", () => operations.projects.managerProjects())}>Manager Projects</ActionButton>
                <ActionButton busy={isBusy("GET assigned projects")} icon={Users} onClick={() => run("GET assigned projects", () => operations.projects.assignedToUser())}>Assigned To Me</ActionButton>
                <ActionButton busy={isBusy("GET ending soon")} icon={CalendarClock} onClick={() => run("GET ending soon", () => operations.projects.endingSoon())}>Ending Soon</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "allocations" ? (
            <ActionCard title="Allocation Management" description="Create, update, forecast, batch upload, and inspect allocation roles/employees." icon={Database}>
              <JsonField label="Allocation JSON payload" value={payload} onChange={setPayload} />
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Batch file</span>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rt-input w-full px-3 py-2 text-sm" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET allocations")} icon={Search} onClick={() => run("GET allocations", () => operations.allocations.list())}>List</ActionButton>
                <ActionButton busy={isBusy("GET user allocations")} icon={Search} onClick={() => run("GET user allocations", () => operations.allocations.user())}>User</ActionButton>
                <ActionButton busy={isBusy("GET forecasting")} icon={Search} onClick={() => run("GET forecasting", () => operations.allocations.forecasting())}>Forecasting</ActionButton>
                <ActionButton busy={isBusy("POST allocation")} icon={Send} onClick={() => run("POST allocation", () => operations.allocations.create(parsedPayload()))}>Create</ActionButton>
                <ActionButton busy={isBusy("POST allocation update")} icon={Send} onClick={() => run("POST allocation update", () => operations.allocations.update(rowId, parsedPayload()))}>Update</ActionButton>
                <ActionButton busy={isBusy("POST allocation batch")} icon={FileUp} onClick={() => run("POST allocation batch", () => operations.allocations.batch(file, parsedPayload()))}>Batch</ActionButton>
                <ActionButton busy={isBusy("GET allocation employees")} icon={Users} onClick={() => run("GET allocation employees", () => operations.allocations.employees())}>Employees</ActionButton>
                <ActionButton busy={isBusy("GET allocation roles")} icon={UserCog} onClick={() => run("GET allocation roles", () => operations.allocations.roles())}>Roles</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "timelogs" ? (
            <ActionCard title="Timelog Operations" description="Create entries, retrieve day/range data, approve statuses, edit entries, or delete records." icon={CalendarClock}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Employee Email" value={email} onChange={setEmail} />
                <TextField label="Project Code" value={projectCode} onChange={setProjectCode} />
                <TextField label="Start Date" value={fromDate} onChange={setFromDate} type="date" />
                <TextField label="End Date" value={toDate} onChange={setToDate} type="date" />
              </div>
              <TextField label="Timelog ID" value={rowId} onChange={setRowId} />
              <div className="mt-3"><JsonField label="Timelog JSON payload" value={payload} onChange={setPayload} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("POST timelog")} icon={Send} onClick={() => run("POST timelog", () => operations.timelogs.create(parsedPayload()))}>Create</ActionButton>
                <ActionButton busy={isBusy("GET timelog by date")} icon={Search} onClick={() => run("GET timelog by date", () => operations.timelogs.getByEmployeeDate(email, date))}>By Employee Date</ActionButton>
                <ActionButton busy={isBusy("GET project range")} icon={Search} onClick={() => run("GET project range", () => operations.timelogs.projectRange(fromDate, toDate))}>Project Range</ActionButton>
                <ActionButton busy={isBusy("GET project code range")} icon={Search} onClick={() => run("GET project code range", () => operations.timelogs.projectCodeRange(projectCode, fromDate, toDate))}>Project Code Range</ActionButton>
                <ActionButton busy={isBusy("PUT timelog status")} icon={Send} onClick={() => run("PUT timelog status", () => operations.timelogs.updateStatus(parsedPayload()))}>Status</ActionButton>
                <ActionButton busy={isBusy("PUT timelog status batch")} icon={Send} onClick={() => run("PUT timelog status batch", () => operations.timelogs.updateStatusBatch(parsedPayload()))}>Status Batch</ActionButton>
                <ActionButton busy={isBusy("PUT timelog entry")} icon={Send} onClick={() => run("PUT timelog entry", () => operations.timelogs.updateEntry(parsedPayload()))}>Edit Entry</ActionButton>
                <ActionButton busy={isBusy("DELETE timelog")} icon={Send} onClick={() => run("DELETE timelog", () => operations.timelogs.delete(rowId))}>Delete</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "requests" ? (
            <ActionCard title="User Requests" description="Create leave/allocation requests, review queues, status changes, reminders, and manager lookups." icon={ClipboardList}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Employee Emails" value={email} onChange={setEmail} placeholder="a@x.com,b@x.com" />
                <TextField label="Request Type" value={requestType} onChange={setRequestType} />
                <TextField label="From Date" value={fromDate} onChange={setFromDate} type="date" />
                <TextField label="To Date" value={toDate} onChange={setToDate} type="date" />
              </div>
              <div className="mt-3"><JsonField label="Request JSON payload" value={payload} onChange={setPayload} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("POST request")} icon={Send} onClick={() => run("POST request", () => operations.requests.create(parsedPayload(), file))}>Create</ActionButton>
                <ActionButton busy={isBusy("GET requests range")} icon={Search} onClick={() => run("GET requests range", () => operations.requests.range(fromDate, toDate, requestType))}>Range</ActionButton>
                <ActionButton busy={isBusy("GET employee requests range")} icon={Search} onClick={() => run("GET employee requests range", () => operations.requests.employeeRange(email, fromDate, toDate, requestType))}>Employee Range</ActionButton>
                <ActionButton busy={isBusy("GET requests for date")} icon={Search} onClick={() => run("GET requests for date", () => operations.requests.forDate(date, requestType))}>For Date</ActionButton>
                <ActionButton busy={isBusy("GET by create date")} icon={Search} onClick={() => run("GET by create date", () => operations.requests.byCreateDate(date, requestType))}>Create Date</ActionButton>
                <ActionButton busy={isBusy("PUT request status")} icon={Send} onClick={() => run("PUT request status", () => operations.requests.status(parsedPayload()))}>Status</ActionButton>
                <ActionButton busy={isBusy("DELETE request")} icon={Send} onClick={() => run("DELETE request", () => operations.requests.delete(parsedPayload()))}>Delete</ActionButton>
                <ActionButton busy={isBusy("POST remind approval")} icon={Bell} onClick={() => run("POST remind approval", () => operations.requests.remindApproval(parsedPayload()))}>Remind</ActionButton>
                <ActionButton busy={isBusy("GET request managers")} icon={Users} onClick={() => run("GET request managers", () => operations.requests.managers())}>Managers</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "reports" ? (
            <ActionCard title="Reports & Exports" description="Fetch manager reports and download timelog exports for all, project, or employee scopes." icon={Download}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Manager/Employee Email" value={email} onChange={setEmail} />
                <TextField label="Project Code" value={projectCode} onChange={setProjectCode} />
                <TextField label="Start Date" value={fromDate} onChange={setFromDate} type="date" />
                <TextField label="End Date" value={toDate} onChange={setToDate} type="date" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET manager timelogs")} icon={Search} onClick={() => run("GET manager timelogs", () => operations.reports.managerTimelogs(projectCode, date))}>Manager Timelogs</ActionButton>
                <ActionButton busy={isBusy("GET manager projects report")} icon={Search} onClick={() => run("GET manager projects report", () => operations.reports.managerProjects(email))}>Manager Projects</ActionButton>
                <ActionButton busy={isBusy("EXPORT all timelogs")} icon={Download} onClick={() => run("EXPORT all timelogs", () => operations.reports.exportAllTimelogs(fromDate, toDate), { downloadName: `timelogs-${fromDate}-${toDate}.xlsx` })}>Export All</ActionButton>
                <ActionButton busy={isBusy("EXPORT project timelogs")} icon={Download} onClick={() => run("EXPORT project timelogs", () => operations.reports.exportProjectTimelogs(projectCode, fromDate, toDate), { downloadName: `timelogs-${projectCode || "project"}-${fromDate}-${toDate}.xlsx` })}>Export Project</ActionButton>
                <ActionButton busy={isBusy("EXPORT employee timelogs")} icon={Download} onClick={() => run("EXPORT employee timelogs", () => operations.reports.exportEmployeeTimelogs(projectCode, email, fromDate, toDate), { downloadName: `timelogs-${fileNameFromPath(email, "employee")}-${fromDate}-${toDate}.xlsx` })}>Export Employee</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "imports" ? (
            <ActionCard title="Excel Imports" description="Upload leave, allocation, and user data spreadsheets through the backend import endpoints." icon={FileUp}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[rgb(var(--muted))]">Spreadsheet file</span>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rt-input w-full px-3 py-2 text-sm" />
              </label>
              <div className="mt-3"><JsonField label="Optional form fields as JSON" value={payload} onChange={setPayload} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("POST leave upload")} icon={FileUp} onClick={() => run("POST leave upload", () => operations.imports.leaveExcel(file, parsedPayload()))}>Leave Upload</ActionButton>
                <ActionButton busy={isBusy("POST allocation upload")} icon={FileUp} onClick={() => run("POST allocation upload", () => operations.imports.allocationExcel(file, parsedPayload()))}>Allocation Upload</ActionButton>
                <ActionButton busy={isBusy("POST user data upload")} icon={FileUp} onClick={() => run("POST user data upload", () => operations.imports.userData(file, parsedPayload()))}>User Data Upload</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "notifications" ? (
            <ActionCard title="Notifications" description="Subscribe to user streams, list notifications, mark read, clear read items, or send announcements." icon={Bell}>
              <TextField label="User ID / Notification ID" value={userId} onChange={setUserId} />
              <div className="mt-3"><JsonField label="Announcement JSON payload" value={payload} onChange={setPayload} /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET subscribe")} icon={Bell} onClick={() => run("GET subscribe", () => operations.notifications.subscribe(userId))}>Subscribe</ActionButton>
                <ActionButton busy={isBusy("GET notifications")} icon={Search} onClick={() => run("GET notifications", () => operations.notifications.list(userId))}>List</ActionButton>
                <ActionButton busy={isBusy("PUT notification read")} icon={Send} onClick={() => run("PUT notification read", () => operations.notifications.read(userId))}>Mark Read</ActionButton>
                <ActionButton busy={isBusy("POST announcement")} icon={Send} onClick={() => run("POST announcement", () => operations.notifications.announcement(parsedPayload()))}>Announcement</ActionButton>
                <ActionButton busy={isBusy("DELETE read notifications")} icon={Send} onClick={() => run("DELETE read notifications", () => operations.notifications.clearRead())}>Clear Read</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "cron" ? (
            <ActionCard title="Scheduled Job Triggers" description="Manually trigger reminder, approval, deallocation, leave, and timelog notification jobs." icon={ServerCog}>
              <div className="flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET reminder")} icon={Play} onClick={() => run("GET reminder", () => operations.cron.reminder())}>Reminder</ActionButton>
                <ActionButton busy={isBusy("GET auto approve")} icon={Play} onClick={() => run("GET auto approve", () => operations.cron.autoApprove())}>Auto Approve</ActionButton>
                <ActionButton busy={isBusy("GET deallocate")} icon={Play} onClick={() => run("GET deallocate", () => operations.cron.deallocate())}>Deallocate</ActionButton>
                <ActionButton busy={isBusy("GET monthly leave cron")} icon={Play} onClick={() => run("GET monthly leave cron", () => operations.cron.monthlyLeave())}>Monthly Leave</ActionButton>
                <ActionButton busy={isBusy("GET notify timelogs")} icon={Play} onClick={() => run("GET notify timelogs", () => operations.cron.notifyTimelogs())}>Notify Timelogs</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "reference" ? (
            <ActionCard title="Reference Lists" description="Load departments, streams, designation lookups, band lists, leave summary, and the certification catalog." icon={Search}>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Band ID" value={bandId} onChange={setBandId} />
                <TextField label="Department" value={department} onChange={setDepartment} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET departments")} icon={Search} onClick={() => run("GET departments", () => operations.reference.departments())}>Departments</ActionButton>
                <ActionButton busy={isBusy("GET streams")} icon={Search} onClick={() => run("GET streams", () => operations.reference.streams())}>Streams</ActionButton>
                <ActionButton busy={isBusy("GET designations")} icon={Search} onClick={() => run("GET designations", () => operations.reference.designations({ bandId, department }))}>Designations</ActionButton>
                <ActionButton busy={isBusy("GET band-list")} icon={Search} onClick={() => run("GET band-list", () => operations.reference.bandList())}>Band List</ActionButton>
                <ActionButton busy={isBusy("GET leave summary")} icon={Search} onClick={() => run("GET leave summary", () => operations.leave.summary())}>Leave Summary</ActionButton>
              </div>
            </ActionCard>
          ) : null}

          {active === "auth" ? (
            <ActionCard title="Auth & OAuth" description="Use Google sign-in helpers, dev OAuth bypass, or backend logout when needed." icon={KeyRound}>
              <TextField label="Bypass Email" value={email} onChange={setEmail} placeholder="dev.user@webknot.in" />
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton busy={isBusy("GET google signin")} icon={KeyRound} onClick={() => run("GET google signin", () => operations.auth.googleSignin())}>Google Signin URL</ActionButton>
                <ActionButton busy={isBusy("GET oauth bypass")} icon={KeyRound} onClick={() => run("GET oauth bypass", () => operations.auth.oauthBypass(email))}>OAuth Bypass</ActionButton>
                <ActionButton busy={isBusy("POST logout")} icon={Send} onClick={() => run("POST logout", () => operations.auth.logout())}>Logout API</ActionButton>
              </div>
            </ActionCard>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rt-panel-subtle p-4">
            <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Shared Inputs</h2>
            <div className="mt-3 grid gap-3">
              <TextField label="Date" value={date} onChange={setDate} type="date" />
              <TextField label="Row / Notification ID" value={rowId} onChange={setRowId} />
            </div>
          </div>
          <div className="rt-panel-subtle p-4">
            <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Latest Response</h2>
            <ResultPanel state={result} />
            {!result ? <p className="mt-2 text-sm text-[rgb(var(--muted))]">Run an action to see the backend response here.</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
