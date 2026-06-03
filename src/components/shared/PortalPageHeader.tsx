// @ts-nocheck

export default function PortalPageHeader({ title, subtitle, sectionLabel = "This page", children, className = "" }) {
  return (
    <header className={["rt-portal-page-header", className].filter(Boolean).join(" ")}>
      <div className="rt-portal-page-header-accent" aria-hidden="true" />
      <div className="rt-portal-page-header-body">
        <div className="min-w-0 flex-1 space-y-2">
          {sectionLabel ? <p className="rt-kicker">{sectionLabel}</p> : null}
          <h1 className="rt-page-title">{title}</h1>
          {subtitle ? <p className="rt-page-subtitle max-w-2xl">{subtitle}</p> : null}
        </div>
        {children ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
