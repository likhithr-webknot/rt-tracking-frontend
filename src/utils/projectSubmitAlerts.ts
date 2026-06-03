// @ts-nocheck

function cleanName(value) {
  return String(value ?? "").trim();
}

export function extractPmAmFromProject(project = {}) {
  const pm = cleanName(project.pm ?? project.managerName ?? project.projectManager ?? "");
  const am = cleanName(project.am ?? project.accountManager ?? project.accountManagerName ?? "");
  const description = cleanName(project.description ?? "");
  if (!pm && description) {
    const pmMatch = /PM:\s*([^·|]+)/i.exec(description);
    if (pmMatch) return { pm: cleanName(pmMatch[1]), am: am || cleanName(/AM:\s*([^·|]+)/i.exec(description)?.[1]) };
  }
  if (!am && description) {
    const amMatch = /AM:\s*([^·|]+)/i.exec(description);
    if (amMatch) return { pm, am: cleanName(amMatch[1]) };
  }
  return { pm, am };
}

export function buildProjectStakeholderAlerts(projects = [], { employeeName = "", month = "" } = {}) {
  const alerts = [];
  const seen = new Set();
  for (const project of projects) {
    const projectId = cleanName(project?.id ?? project?.projectId ?? "");
    const projectName = cleanName(project?.name ?? project?.code ?? projectId);
    const { pm, am } = extractPmAmFromProject(project);
    const base = { projectId, projectName, employeeName, month };

    const push = (recipientRole, recipientName) => {
      const name = cleanName(recipientName);
      if (!name) return;
      const key = `${recipientRole}:${name.toLowerCase()}:${projectId}`;
      if (seen.has(key)) return;
      seen.add(key);
      alerts.push({ ...base, recipientRole, recipientName: name });
    };

    if (pm) {
      push("PM", pm);
    } else if (am) {
      push("AM", am);
    } else {
      push("ADMIN", "Admin");
      push("HR", "HR");
    }
  }
  return alerts;
}
