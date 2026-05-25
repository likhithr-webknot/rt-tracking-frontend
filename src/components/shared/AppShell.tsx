// @ts-nocheck
import { AnimatePresence, motion as Motion } from "framer-motion";
import { sidebarWidthPx } from "./PortalSidebar";

export default function AppShell({
  isSidebarOpen,
  setIsSidebarOpen,
  sidebar,
  topbar,
  children,
  maxWidth = "max-w-7xl",
}) {
  const inset = sidebarWidthPx(isSidebarOpen);

  return (
    <div className="rt-shell flex min-h-[100dvh] overflow-x-hidden">
      <AnimatePresence>
        {isSidebarOpen ? (
          <Motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close menu"
          />
        ) : null}
      </AnimatePresence>

      {sidebar}

      <div
        className="rt-workspace-topbar pointer-events-auto"
        style={{ left: inset, right: 0 }}
      >
        <div className="flex w-full items-center justify-end gap-2 sm:gap-3">{topbar}</div>
      </div>

      <main className="rt-workspace-main" style={{ marginLeft: inset }}>
        <div className={`mx-auto w-full min-w-0 ${maxWidth}`}>{children}</div>
      </main>
    </div>
  );
}
