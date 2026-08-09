// @ts-nocheck
import React from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

/**
 * Shared portal page chrome with optional back control and clickable breadcrumbs.
 */
export default function PortalPageHeader({
  title,
  subtitle,
  sectionLabel = "This page",
  breadcrumbs = null,
  onBack = null,
  backLabel = "Back",
  children,
  className = "",
}) {
  const crumbs = Array.isArray(breadcrumbs) ? breadcrumbs.filter(Boolean) : [];

  return (
    <header className={["pulse-page-head", className].filter(Boolean).join(" ")}>
      {(onBack || crumbs.length) ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-xs font-semibold text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-colors"
            >
              <ArrowLeft size={14} />
              {backLabel}
            </button>
          ) : null}
          {crumbs.length ? (
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                const label = String(crumb?.label ?? "").trim() || "—";
                return (
                  <React.Fragment key={`${label}-${index}`}>
                    {index > 0 ? <ChevronRight size={12} className="shrink-0 opacity-60" /> : null}
                    {isLast || !crumb?.onClick ? (
                      <span
                        className={
                          isLast
                            ? "font-semibold text-[rgb(var(--text))] truncate max-w-[16rem]"
                            : "truncate max-w-[12rem]"
                        }
                      >
                        {label}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="truncate max-w-[12rem] font-medium text-[rgb(var(--primary))] hover:underline"
                      >
                        {label}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          ) : null}
        </div>
      ) : null}

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
