// @ts-nocheck

const STORAGE_VERSION = "v2";

export function notesStorageKey(portal, userKey) {
  const p = String(portal || "portal").trim().toLowerCase();
  const u = String(userKey || "anonymous")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "_");
  return `rt_portal_notes_${STORAGE_VERSION}_${p}_${u}`;
}

export function createEmptyNotesState() {
  const now = new Date().toISOString();
  return {
    notebooks: [
      {
        id: "default",
        title: "General",
        color: "indigo",
        pages: [
          {
            id: "welcome",
            title: "Getting started",
            content:
              "Use sections like OneNote notebooks.\n\n• Rename sections from the sidebar\n• Add unlimited pages\n• Notes save automatically for your account only",
            updatedAt: now,
          },
        ],
      },
    ],
    activeNotebookId: "default",
    activePageId: "welcome",
  };
}

function normalizePage(page) {
  if (!page || typeof page !== "object") return null;
  const id = String(page.id || "").trim() || `pg_${Date.now()}`;
  return {
    id,
    title: String(page.title ?? "Untitled page").trim() || "Untitled page",
    content: String(page.content ?? ""),
    updatedAt: page.updatedAt || new Date().toISOString(),
  };
}

function normalizeNotebook(nb) {
  if (!nb || typeof nb !== "object") return null;
  const id = String(nb.id || "").trim() || `nb_${Date.now()}`;
  const pages = (Array.isArray(nb.pages) ? nb.pages : [])
    .map(normalizePage)
    .filter(Boolean);
  if (!pages.length) {
    pages.push({
      id: `pg_${Date.now()}`,
      title: "Untitled page",
      content: "",
      updatedAt: new Date().toISOString(),
    });
  }
  return {
    id,
    title: String(nb.title ?? "Section").trim() || "Section",
    color: String(nb.color || "indigo").trim() || "indigo",
    pages,
  };
}

export function normalizeNotesState(raw) {
  if (!raw || typeof raw !== "object") return createEmptyNotesState();
  const notebooks = (Array.isArray(raw.notebooks) ? raw.notebooks : [])
    .map(normalizeNotebook)
    .filter(Boolean);
  if (!notebooks.length) return createEmptyNotesState();
  const activeNotebookId =
    notebooks.find((n) => n.id === raw.activeNotebookId)?.id || notebooks[0].id;
  const notebook = notebooks.find((n) => n.id === activeNotebookId) || notebooks[0];
  const activePageId =
    notebook.pages.find((p) => p.id === raw.activePageId)?.id || notebook.pages[0].id;
  return { notebooks, activeNotebookId, activePageId };
}

export function loadPortalNotes(portal, userKey) {
  if (typeof window === "undefined") return createEmptyNotesState();
  try {
    const raw = window.localStorage.getItem(notesStorageKey(portal, userKey));
    if (!raw) return createEmptyNotesState();
    return normalizeNotesState(JSON.parse(raw));
  } catch {
    return createEmptyNotesState();
  }
}

export function savePortalNotes(portal, userKey, state) {
  if (typeof window === "undefined") return;
  const normalized = normalizeNotesState(state);
  window.localStorage.setItem(notesStorageKey(portal, userKey), JSON.stringify(normalized));
  return normalized;
}

export function newId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
