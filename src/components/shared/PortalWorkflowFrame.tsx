// @ts-nocheck

/** Page content frame — full-width flow with consistent vertical rhythm. */
export default function PortalWorkflowFrame({ children, className = "" }) {
  return (
    <div className={`pulse-page ${className}`.trim()}>
      {children}
    </div>
  );
}
