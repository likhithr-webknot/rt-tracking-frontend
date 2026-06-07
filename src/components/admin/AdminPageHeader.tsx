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
  maxWidth = "",
}: AdminPageShellProps) {
  const layoutClass = maxWidth ? `${maxWidth} mx-auto w-full` : "w-full";
  return (
    <PortalWorkflowFrame className={[layoutClass, className].filter(Boolean).join(" ")}>
      {children}
    </PortalWorkflowFrame>
  );
}
