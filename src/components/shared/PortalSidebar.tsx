// @ts-nocheck
import { PanelLeftClose, PanelLeftOpen, ExternalLink, HelpCircle, Settings } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { SidebarLogoMark } from "./CompanyLogo";
import { WEBKNOT_WEBSITE_URL } from "../../constants/brand";
import { flattenNavGroups } from "../../config/portalNavigation";

const SIDEBAR_OPEN = 252;
const SIDEBAR_CLOSED = 76;

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
        "pulse-nav-item",
        active ? "pulse-nav-item--active" : "",
        !isOpen ? "pulse-nav-item--compact" : "",
      ].join(" ")}
      title={!isOpen ? item.label : item.description || item.label}
      aria-current={active ? "page" : undefined}
    >
      <span className="pulse-nav-icon">{item.icon}</span>
      {isOpen ? (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{item.label}</span>
          {item.description ? (
            <span className="block truncate text-[11px] font-normal leading-snug text-[rgb(var(--sidebar-muted))] mt-0.5">
              {item.description}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function SidebarFooterItem({
  icon: Icon,
  label,
  description,
  active = false,
  isOpen,
  onClick,
  href,
  external = false,
}) {
  const compact = !isOpen;
  const className = [
    "pulse-nav-item w-full",
    active ? "pulse-nav-item--active" : "",
    compact ? "pulse-nav-item--compact" : "",
  ].join(" ");

  const body = (
    <>
      <span className="pulse-nav-icon">
        <Icon size={20} strokeWidth={2} />
      </span>
      {isOpen ? (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{label}</span>
          {description ? (
            <span className="block truncate text-[11px] font-normal leading-snug text-[rgb(var(--sidebar-muted))] mt-0.5">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
      {external && isOpen ? <ExternalLink size={12} strokeWidth={2} className="shrink-0 opacity-40" /> : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={className}
        title={compact ? label : description || label}
      >
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} title={compact ? label : description || label}>
      {body}
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
      className={["pulse-sidebar", isOpen ? "pulse-sidebar--expanded" : "pulse-sidebar--collapsed"].join(" ")}
      style={{ width: isOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED }}
      aria-label="Main menu"
    >
      <div className={`pulse-sidebar-brand ${isOpen ? "" : "pulse-sidebar-brand--compact"}`}>
        <SidebarLogoMark />
        {isOpen ? (
          <div className="min-w-0 flex-1">
            <div className="pulse-sidebar-title">Pulse</div>
            <div className="pulse-sidebar-tag">{portalTag}</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="pulse-icon-btn pulse-icon-btn--ghost"
          aria-label={isOpen ? "Collapse menu" : "Expand menu"}
        >
          {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <nav className="pulse-sidebar-nav custom-scrollbar">
        {nav.mode === "grouped"
          ? nav.groups.map((group) => (
              <div key={group.title} className="pulse-nav-group">
                {isOpen ? (
                  <div className="pulse-nav-group-label">{group.title}</div>
                ) : (
                  <div className="pulse-nav-group-rule" aria-hidden />
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

      <div className="pulse-sidebar-footer">
        {settingsIsHandler ? (
          <SidebarFooterItem
            icon={Settings}
            label="Settings"
            description="App preferences and review windows"
            active={settingsActive}
            isOpen={isOpen}
            onClick={() => {
              onSettingsClick();
              if (typeof window !== "undefined" && window.innerWidth < 768 && isOpen) {
                setIsOpen(false);
              }
            }}
          />
        ) : null}

        <SidebarFooterItem
          icon={HelpCircle}
          label="Help & support"
          description="Open help in a new tab"
          isOpen={isOpen}
          href={helpUrl}
          external
        />

        {showThemeToggle ? (
          <div className={["px-1 py-1", !isOpen ? "flex justify-center" : ""].join(" ")}>
            <ThemeToggle compact={!isOpen} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
