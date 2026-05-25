// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FilePlus,
  FolderPlus,
  Pencil,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  createEmptyNotesState,
  newId,
} from "../../utils/portalNotesStorage";
import { loadPortalNotesSynced, savePortalNotesSynced } from "../../api/portal-notes";
import { resolveAccountStorageKey } from "../../utils/accountStorageKey";
import ConfirmDialog from "./ConfirmDialog";
import PortalPageHeader from "./PortalPageHeader";

const SECTION_COLORS = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
  violet: "bg-violet-500",
};

function titleCase(s) {
  return String(s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PortalNotesWorkspace({
  portal = "admin",
  auth = null,
  userKey: userKeyProp = null,
  title = "Notes",
  subtitle = "Private sections and pages — only visible to your signed-in account.",
}) {
  const accountKey = useMemo(
    () => resolveAccountStorageKey(auth, userKeyProp || "anonymous"),
    [auth, userKeyProp],
  );

  const [state, setState] = useState(() => createEmptyNotesState());
  const [syncSource, setSyncSource] = useState("local");
  const [notesLoading, setNotesLoading] = useState(true);
  const [pageSearch, setPageSearch] = useState("");
  const [saveHint, setSaveHint] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState(null);
  const [confirmDeletePage, setConfirmDeletePage] = useState(false);
  const [confirmDeleteNotebookId, setConfirmDeleteNotebookId] = useState(null);
  const saveTimerRef = useRef(null);

  const persist = useCallback(
    async (next) => {
      const result = await savePortalNotesSynced(portal, accountKey, next);
      setState(result.state);
      setSyncSource(result.source);
      setSaveHint(result.source === "server" ? "Synced" : "Saved locally");
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => setSaveHint(""), 1400);
    },
    [portal, accountKey],
  );

  const schedulePersist = useCallback(
    (next) => {
      setState(next);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => persist(next), 350);
    },
    [persist],
  );

  useEffect(() => {
    let alive = true;
    setNotesLoading(true);
    loadPortalNotesSynced(portal, accountKey)
      .then((result) => {
        if (!alive) return;
        setState(result.state);
        setSyncSource(result.source);
      })
      .finally(() => {
        if (alive) setNotesLoading(false);
      });
    setRenamingSectionId(null);
    return () => {
      alive = false;
    };
  }, [portal, accountKey]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const notebook = useMemo(
    () => state.notebooks?.find((n) => n.id === state.activeNotebookId) || state.notebooks?.[0],
    [state],
  );

  const page = useMemo(
    () => notebook?.pages?.find((p) => p.id === state.activePageId) || notebook?.pages?.[0],
    [notebook, state.activePageId],
  );

  const filteredPages = useMemo(() => {
    const pages = notebook?.pages || [];
    const q = pageSearch.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        String(p.title || "").toLowerCase().includes(q) ||
        String(p.content || "").toLowerCase().includes(q),
    );
  }, [notebook, pageSearch]);

  function selectNotebook(id) {
    const nb = state.notebooks.find((n) => n.id === id);
    const firstPage = nb?.pages?.[0]?.id;
    persist({ ...state, activeNotebookId: id, activePageId: firstPage || null });
  }

  function selectPage(id) {
    persist({ ...state, activePageId: id });
  }

  function addNotebook() {
    const id = newId("nb");
    const colorKeys = Object.keys(SECTION_COLORS);
    const color = colorKeys[state.notebooks.length % colorKeys.length];
    const nb = {
      id,
      title: `Section ${state.notebooks.length + 1}`,
      color,
      pages: [
        {
          id: newId("pg"),
          title: "Untitled page",
          content: "",
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    persist({
      ...state,
      notebooks: [...state.notebooks, nb],
      activeNotebookId: id,
      activePageId: nb.pages[0].id,
    });
  }

  function addPage() {
    if (!notebook) return;
    const id = newId("pg");
    const pg = {
      id,
      title: "Untitled page",
      content: "",
      updatedAt: new Date().toISOString(),
    };
    const notebooks = state.notebooks.map((nb) =>
      nb.id === notebook.id ? { ...nb, pages: [pg, ...(nb.pages || [])] } : nb,
    );
    persist({ ...state, notebooks, activePageId: id });
  }

  function renameNotebook(id, title) {
    const nextTitle = String(title ?? "").trim() || "Section";
    const notebooks = state.notebooks.map((nb) =>
      nb.id === id ? { ...nb, title: nextTitle } : nb,
    );
    persist({ ...state, notebooks });
    setRenamingSectionId(null);
  }

  function updatePage(patch) {
    if (!notebook || !page) return;
    const notebooks = state.notebooks.map((nb) => {
      if (nb.id !== notebook.id) return nb;
      return {
        ...nb,
        pages: nb.pages.map((p) =>
          p.id === page.id
            ? { ...p, ...patch, updatedAt: new Date().toISOString() }
            : p,
        ),
      };
    });
    schedulePersist({ ...state, notebooks });
  }

  function deletePage() {
    if (!notebook || !page) return;
    const pages = notebook.pages.filter((p) => p.id !== page.id);
    if (!pages.length) {
      addPage();
      return;
    }
    const notebooks = state.notebooks.map((nb) =>
      nb.id === notebook.id ? { ...nb, pages } : nb,
    );
    persist({
      ...state,
      notebooks,
      activePageId: pages[0]?.id || null,
    });
    setConfirmDeletePage(false);
  }

  function deleteNotebook(id) {
    const nb = state.notebooks.find((n) => n.id === id);
    if (!nb) return;
    const notebooks = state.notebooks.filter((n) => n.id !== id);
    const first = notebooks[0];
    persist({
      ...state,
      notebooks,
      activeNotebookId: first.id,
      activePageId: first.pages?.[0]?.id || null,
    });
    setConfirmDeleteNotebookId(null);
  }

  const pageCount = notebook?.pages?.length ?? 0;
  const notebookToDelete = confirmDeleteNotebookId
    ? state.notebooks.find((n) => n.id === confirmDeleteNotebookId)
    : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 animate-in fade-in duration-300">
      <PortalPageHeader title={title} subtitle={subtitle}>
        <span className="rt-badge rt-badge--neutral">
          {state.notebooks.length} section{state.notebooks.length === 1 ? "" : "s"}
        </span>
        <span className="rt-badge rt-badge--primary">{pageCount} pages</span>
        {notesLoading ? <span className="rt-badge rt-badge--neutral">Loading…</span> : null}
        {!notesLoading && syncSource === "server" ? (
          <span className="rt-badge rt-badge--success">Cloud sync</span>
        ) : !notesLoading ? (
          <span className="rt-badge rt-badge--neutral">This device</span>
        ) : null}
        {saveHint ? <span className="rt-badge rt-badge--success">{saveHint}</span> : null}
      </PortalPageHeader>

      <div className="rt-panel flex min-h-[min(78vh,920px)] overflow-hidden">
        <aside className="flex w-60 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
          <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3 py-3">
            <span className="rt-field-label">Sections</span>
            <button type="button" onClick={addNotebook} className="rt-btn-ghost p-1.5" title="Add section">
              <FolderPlus size={16} />
            </button>
          </div>
          <ul className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
            {state.notebooks.map((nb) => {
              const active = nb.id === state.activeNotebookId;
              const dot = SECTION_COLORS[nb.color] || SECTION_COLORS.indigo;
              const renaming = renamingSectionId === nb.id;
              return (
                <li key={nb.id} className="group">
                  {renaming ? (
                    <input
                      autoFocus
                      className="rt-input w-full py-2 text-sm"
                      defaultValue={nb.title}
                      onBlur={(e) => renameNotebook(nb.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameNotebook(nb.id, e.currentTarget.value);
                        if (e.key === "Escape") setRenamingSectionId(null);
                      }}
                    />
                  ) : (
                    <div
                      className={[
                        "flex w-full items-center gap-1 rounded-[var(--radius-lg)] transition-colors",
                        active
                          ? "bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]"
                          : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))] hover:text-[rgb(var(--text))]",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => selectNotebook(nb.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm font-medium"
                      >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                        <span className="truncate">{nb.title}</span>
                        <span className="ml-auto text-[10px] opacity-60">{nb.pages?.length ?? 0}</span>
                      </button>
                      <button
                        type="button"
                        className="rt-btn-ghost shrink-0 p-1.5 opacity-0 group-hover:opacity-100"
                        title="Rename section"
                        onClick={() => setRenamingSectionId(nb.id)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="rt-btn-ghost shrink-0 p-1.5 text-red-500 opacity-0 group-hover:opacity-100"
                        title="Delete section"
                        onClick={() => {
                          if (state.notebooks.length <= 1) return;
                          setConfirmDeleteNotebookId(nb.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <aside className="flex w-64 shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
          <div className="space-y-2 border-b border-[rgb(var(--border))] p-3">
            <div className="flex items-center justify-between">
              <span className="rt-field-label">Pages</span>
              <button type="button" onClick={addPage} className="rt-btn-ghost p-1.5" title="Add page">
                <FilePlus size={16} />
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <input
                className="rt-input w-full py-2 pl-8 text-xs"
                placeholder="Search pages…"
                value={pageSearch}
                onChange={(e) => setPageSearch(e.target.value)}
              />
            </div>
          </div>
          <ul className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto p-2">
            {filteredPages.map((p) => {
              const active = p.id === state.activePageId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPage(p.id)}
                    className={[
                      "w-full rounded-[var(--radius-lg)] px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]"
                        : "hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-2">
                      <StickyNote size={14} className="mt-0.5 shrink-0 opacity-60" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{p.title || "Untitled"}</div>
                        <div className="text-[10px] text-[rgb(var(--muted))]">
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ""}
                        </div>
                      </div>
                      {active ? <ChevronRight size={14} className="shrink-0 opacity-50" /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
            {!filteredPages.length ? (
              <li className="px-2 py-8 text-center text-xs text-[rgb(var(--muted))]">No pages</li>
            ) : null}
          </ul>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[rgb(var(--bg))]">
          {page ? (
            <>
              <header className="flex flex-wrap items-center gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-4">
                <BookOpen size={20} className="text-[rgb(var(--accent))]" />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent text-xl font-semibold text-[rgb(var(--text))] outline-none"
                  value={page.title}
                  onChange={(e) => updatePage({ title: e.target.value })}
                  placeholder="Page title"
                />
                <button
                  type="button"
                  onClick={() => setConfirmDeletePage(true)}
                  className="rt-btn-ghost text-red-500"
                  title="Delete page"
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
                <textarea
                  className="min-h-[min(62vh,720px)] w-full resize-y rounded-[var(--radius-xl)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-6 py-5 text-[15px] leading-8 text-[rgb(var(--text))] shadow-sm outline-none focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgb(var(--accent))]/15"
                  value={page.content}
                  onChange={(e) => updatePage({ content: e.target.value })}
                  placeholder="Start typing notes…"
                  spellCheck
                />
                <p className="mt-4 text-center text-[11px] text-[rgb(var(--muted))]">
                  {titleCase(portal)} workspace · account {accountKey.slice(0, 24)}
                  {accountKey.length > 24 ? "…" : ""} · section {notebook?.title || "—"}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[rgb(var(--muted))]">
              Select or create a page
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={confirmDeletePage}
        title="Delete page"
        message={`Delete page "${page?.title || "Untitled"}"? This cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onCancel={() => setConfirmDeletePage(false)}
        onConfirm={deletePage}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteNotebookId)}
        title="Delete section"
        message={
          notebookToDelete
            ? `Delete section "${notebookToDelete.title}" and all its pages? This cannot be undone.`
            : ""
        }
        confirmText="Delete"
        confirmVariant="danger"
        onCancel={() => setConfirmDeleteNotebookId(null)}
        onConfirm={() => confirmDeleteNotebookId && deleteNotebook(confirmDeleteNotebookId)}
      />
    </div>
  );
}
