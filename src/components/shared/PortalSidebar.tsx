// @ts-nocheck
import { ChevronLeft, ChevronRight, ExternalLink, HelpCircle, Settings } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { SidebarLogoMark } from "./CompanyLogo";
import { WEBKNOT_WEBSITE_URL } from "../../constants/brand";

const SIDEBAR_OPEN = 240;
const SIDEBAR_CLOSED = 56;

export function sidebarWidthPx(isOpen) {
  return isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED;
}

export default function PortalSidebar({
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  portalTag,
  navItems,
  showThemeToggle = false,
  onSettingsClick = null,
  settingsActive = false,
  helpUrl = WEBKNOT_WEBSITE_URL,
}) {
  const settingsIsHandler = typeof onSettingsClick === "function";

  return (
    <aside
      className="rt-sidebar transition-[width] duration-200 ease-out"
      style={{ width: isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED }}
    >
      <div
        className={`rt-sidebar-brand flex shrink-0 gap-2.5 ${
          isOpen ? "flex-row items-center" : "flex-col items-center py-3"
        }`}
      >
        <SidebarLogoMark />
        {isOpen ? (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[rgb(var(--sidebar-text))] truncate">
              Pulse
            </div>
            <div className="text-[11px] text-[rgb(var(--sidebar-muted))] truncate">{portalTag}</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[rgb(var(--sidebar-muted))] hover:bg-[rgb(var(--sidebar-hover))]"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      <nav className="rt-sidebar-nav custom-scrollbar">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                if (typeof window !== "undefined" && window.innerWidth < 768 && isOpen) {
                  setIsOpen(false);
                }
              }}
              className={[
                "rt-sidebar-nav-item",
                active ? "rt-sidebar-nav-item--active" : "",
                !isOpen ? "justify-center px-0" : "",
              ].join(" ")}
              title={!isOpen ? item.label : undefined}
            >
              <span className="shrink-0 opacity-80">{item.icon}</span>
              {isOpen ? <span className="flex-1 truncate text-left">{item.label}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="rt-sidebar-footer space-y-0.5">
        {settingsIsHandler ? (
          <button
            type="button"
            onClick={() => {
              onSettingsClick();
              if (typeof window !== "undefined" && window.innerWidth < 768 && isOpen) {
                setIsOpen(false);
              }
            }}
            className={[
              "rt-sidebar-nav-item w-full",
              settingsActive ? "rt-sidebar-nav-item--active" : "",
              !isOpen ? "justify-center px-0" : "",
            ].join(" ")}
            title={!isOpen ? "Settings" : undefined}
          >
            <Settings size={16} className="shrink-0" />
            {isOpen ? <span className="flex-1 truncate text-left">Settings</span> : null}
          </button>
        ) : null}

        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "rt-sidebar-nav-item",
            !isOpen ? "justify-center px-0" : "",
          ].join(" ")}
          title={!isOpen ? "Help" : undefined}
        >
          <HelpCircle size={16} className="shrink-0" />
          {isOpen ? (
            <>
              <span className="flex-1 truncate text-left">Help</span>
              <ExternalLink size={12} className="opacity-40" />
            </>
          ) : null}
        </a>

        {showThemeToggle ? (
          isOpen ? (
            <div className="px-1 py-1">
              <ThemeToggle />
            </div>
          ) : (
            <div className="flex justify-center py-1">
              <ThemeToggle compact />
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
