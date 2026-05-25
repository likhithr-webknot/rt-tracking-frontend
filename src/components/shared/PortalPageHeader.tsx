// @ts-nocheck

export default function PortalPageHeader({ title, subtitle, children, className = "" }) {
  return (
    <header
      className={[
        "mb-10 flex w-full min-w-0 flex-col gap-5",
        "md:flex-row md:items-end md:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 space-y-2">
        <p className="rt-kicker">My workspace</p>
        <h1 className="rt-page-title">{title}</h1>
        {subtitle ? <p className="rt-page-subtitle">{subtitle}</p> : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{children}</div>
      ) : null}
    </header>
  );
}
