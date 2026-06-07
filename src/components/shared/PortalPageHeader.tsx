// @ts-nocheck

export default function PortalPageHeader({ title, subtitle, sectionLabel = "This page", children, className = "" }) {
  return (
    <header className={["pulse-page-head", className].filter(Boolean).join(" ")}>
      <div className="pulse-page-head-grid">
        <div className="min-w-0 space-y-2">
          {sectionLabel ? <p className="pulse-eyebrow">{sectionLabel}</p> : null}
          <h1 className="pulse-title">{title}</h1>
          {subtitle ? <p className="pulse-lead">{subtitle}</p> : null}
        </div>
        {children ? <div className="pulse-page-actions">{children}</div> : null}
      </div>
    </header>
  );
}
