// @ts-nocheck
import { ChevronLeft, ChevronRight, ExternalLink, HelpCircle, Settings } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { SidebarLogoMark } from "./CompanyLogo";
import { WEBKNOT_WEBSITE_URL } from "../../constants/brand";
import { flattenNavGroups } from "../../config/portalNavigation";

const SIDEBAR_OPEN = 260;
const SIDEBAR_CLOSED = 60;

export function sidebarWidthPx(isOpen) {
  return isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED;
}

function resolveNavEntries(navItems, navGroups) {
  if (Array.isArray(navGroups) && navGroups.length) {
    return { mode: "grouped", groups: navGroups };
  }
  const flat = Array.isArray(navItems) ? navItems : [];
  return { mode: "flat", items: flat };
}

function NavButton({ item, active, isOpen, setActiveTab, setIsOpen }) {
  return (
    <button
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
        !isOpen ? "justify-center px-0 min-h-[44px]" : "",
      ].join(" ")}
      title={!isOpen ? item.label : item.description || item.label}
      aria-current={active ? "page" : undefined}
    >
      <span className="shrink-0">{item.icon}</span>
      {isOpen ? (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{item.label}</span>
          {item.description ? (
            <span className="block truncate text-[11px] font-normal leading-snug opacity-75 mt-0.5">
              {item.description}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

export default function PortalSidebar({
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  portalTag,
  navItems,
  navGroups = null,
  showThemeToggle = false,
  onSettingsClick = null,
  settingsActive = false,
  helpUrl = WEBKNOT_WEBSITE_URL,
}) {
  const settingsIsHandler = typeof onSettingsClick === "function";
  const nav = resolveNavEntries(navItems, navGroups);
  const flatForFallback = nav.mode === "grouped" ? flattenNavGroups(nav.groups) : nav.items;

  return (
    <aside
      className="rt-sidebar transition-[width] duration-200 ease-out"
      style={{ width: isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED }}
      aria-label="Main menu"
    >
      <div
        className={`rt-sidebar-brand flex shrink-0 gap-2.5 ${
          isOpen ? "flex-row items-center" : "flex-col items-center py-3"
        }`}
      >
        <SidebarLogoMark />
        {isOpen ? (
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[rgb(var(--sidebar-text))] truncate">
              Pulse
            </div>
            <div className="text-[12px] text-[rgb(var(--sidebar-muted))] truncate">{portalTag}</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex shrink-0 rounded-[var(--radius-md)] p-2 text-[rgb(var(--sidebar-muted))] hover:bg-[rgb(var(--sidebar-hover))] min-h-[40px] min-w-[40px] items-center justify-center"
          aria-label={isOpen ? "Hide menu labels" : "Show menu labels"}
        >
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="rt-sidebar-nav custom-scrollbar">
        {nav.mode === "grouped"
          ? nav.groups.map((group) => (
              <div key={group.title} className="rt-sidebar-nav-group">
                {isOpen ? (
                  <div className="rt-sidebar-nav-group-title">{group.title}</div>
                ) : (
                  <div className="rt-sidebar-nav-group-divider" aria-hidden />
                )}
                {group.items.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={activeTab === item.id}
                    isOpen={isOpen}
                    setActiveTab={setActiveTab}
                    setIsOpen={setIsOpen}
                  />
                ))}
              </div>
            ))
          : flatForFallback.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id}
                isOpen={isOpen}
                setActiveTab={setActiveTab}
                setIsOpen={setIsOpen}
              />
            ))}
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
            title={!isOpen ? "Settings" : "App preferences and review windows"}
          >
            <Settings size={18} className="shrink-0" />
            {isOpen ? <span className="flex-1 truncate text-left">Settings</span> : null}
          </button>
        ) : null}

        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={["rt-sidebar-nav-item", !isOpen ? "justify-center px-0" : ""].join(" ")}
          title={!isOpen ? "Help" : "Open help in a new tab"}
        >
          <HelpCircle size={18} className="shrink-0" />
          {isOpen ? (
            <>
              <span className="flex-1 truncate text-left">Help & support</span>
              <ExternalLink size={12} className="opacity-40" />
            </>
          ) : null}
        </a>

        {showThemeToggle ? (
          <div className={["px-2 py-1", !isOpen ? "flex justify-center" : ""].join(" ")}>
            <ThemeToggle compact={!isOpen} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
