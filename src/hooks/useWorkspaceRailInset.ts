import { useEffect, useState } from "react";

export type WorkspaceRailOptions = {
  expanded: number;
  collapsedDesktop: number;
  collapsedMobile: number;
};

const DEFAULTS: WorkspaceRailOptions = {
  expanded: 240,
  collapsedDesktop: 56,
  collapsedMobile: 56,
};

/**
 * Live pixel width of the fixed workspace sidebar rail (expanded vs collapsed, responsive).
 */
export function useWorkspaceRailInset(isExpanded: boolean, options: Partial<WorkspaceRailOptions> = {}) {
  const { expanded, collapsedDesktop, collapsedMobile } = { ...DEFAULTS, ...options };
  const [isMd, setIsMd] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsMd(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (isExpanded) return expanded;
  return isMd ? collapsedDesktop : collapsedMobile;
}
