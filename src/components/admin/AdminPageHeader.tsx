import type { ReactNode } from "react";
import PortalPageHeader from "../shared/PortalPageHeader";
import PortalWorkflowFrame from "../shared/PortalWorkflowFrame";

type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children?: ReactNode;
  className?: string;
};

/** Admin pages use the same accent header as employee/manager portals. */
export default function AdminPageHeader({
  title,
  subtitle,
  sectionLabel = "Admin",
  children,
  className = "",
}: AdminPageHeaderProps) {
  return (
    <PortalPageHeader
      title={title}
      subtitle={subtitle}
      sectionLabel={sectionLabel}
      className={className}
    >
      {children}
    </PortalPageHeader>
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
    <PortalWorkflowFrame className={["w-full animate-in fade-in duration-500", maxWidth, className].filter(Boolean).join(" ")}>
      {children}
    </PortalWorkflowFrame>
  );
}
