// @ts-nocheck

/** Wraps a portal workflow step with consistent spacing and card surface. */
export default function PortalWorkflowFrame({ children, className = "" }) {
  return (
    <div className={`rt-workflow-frame ${className}`.trim()}>
      <div className="rt-workflow-frame-inner">{children}</div>
    </div>
  );
}
