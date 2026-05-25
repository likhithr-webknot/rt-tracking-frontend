import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children?: ReactNode;
  className?: string;
};

export default function AdminPageHeader({
  title,
  subtitle,
  sectionLabel = "Admin",
  children,
  className = "",
}: AdminPageHeaderProps) {
  return (
    <header
      className={[
        "mb-8 sm:mb-10 flex w-full min-w-0 flex-col gap-5",
        "sm:flex-row sm:items-end sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 space-y-2">
        {sectionLabel ? <p className="rt-kicker">{sectionLabel}</p> : null}
        <h2 className="rt-page-title">{title}</h2>
        {subtitle ? <p className="rt-page-subtitle">{subtitle}</p> : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}

type AdminPageShellProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

export function AdminPageShell({
  children,
  className = "",
  maxWidth = "max-w-7xl",
}: AdminPageShellProps) {
  return (
    <div
      className={["w-full animate-in fade-in duration-500", maxWidth, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
