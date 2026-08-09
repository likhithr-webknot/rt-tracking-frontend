import type { ReactNode } from "react";
import PortalPageHeader from "../shared/PortalPageHeader";
import PortalWorkflowFrame from "../shared/PortalWorkflowFrame";

type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  breadcrumbs?: Array<{ label: string; onClick?: () => void } | null>;
  onBack?: (() => void) | null;
  backLabel?: string;
  children?: ReactNode;
  className?: string;
};

export default function AdminPageHeader({
  title,
  subtitle,
  sectionLabel = "Admin",
  breadcrumbs = null,
  onBack = null,
  backLabel = "Back",
  children,
  className = "",
}: AdminPageHeaderProps) {
  return (
    <PortalPageHeader
      title={title}
      subtitle={subtitle}
      sectionLabel={sectionLabel}
      breadcrumbs={breadcrumbs}
      onBack={onBack}
      backLabel={backLabel}
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
