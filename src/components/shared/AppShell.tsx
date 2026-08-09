// @ts-nocheck
import { AnimatePresence, motion as Motion } from "framer-motion";
import { sidebarWidthPx } from "./PortalSidebar";

export default function AppShell({
  isSidebarOpen,
  setIsSidebarOpen,
  sidebar,
  topbar,
  children,
  maxWidth = "max-w-[88rem]",
}) {
  const sidebarWidth = sidebarWidthPx(isSidebarOpen);

  return (
    <div className="pulse-app">
      <AnimatePresence>
        {isSidebarOpen ? (
          <Motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pulse-scrim md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close menu"
          />
        ) : null}
      </AnimatePresence>

      <div className="pulse-app-body">
        <div
          className={[
            "pulse-sidebar-wrap",
            isSidebarOpen ? "pulse-sidebar-wrap--open" : "",
          ].join(" ")}
          style={{ "--pulse-sidebar-width": `${sidebarWidth}px` }}
        >
          {sidebar}
        </div>

        <div className="pulse-main">
          <header className="pulse-topbar">
            <div className="pulse-topbar-inner">{topbar}</div>
          </header>

          <main className="pulse-content custom-scrollbar">
            <div className={`pulse-content-inner mx-auto w-full min-w-0 ${maxWidth}`}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
