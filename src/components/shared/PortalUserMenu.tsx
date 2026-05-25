// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { LogOut, UserCircle2 } from "lucide-react";
import PortalTopUserChip from "./PortalTopUserChip";

export default function PortalUserMenu({
  auth,
  onProfile,
  onLogout,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={rootRef} className={["relative", className].filter(Boolean).join(" ")}>
      <PortalTopUserChip auth={auth} onClick={() => setOpen((v) => !v)} aria-expanded={open} />
      {open ? (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-52 overflow-hidden rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]"
            onClick={() => {
              setOpen(false);
              onProfile?.();
            }}
          >
            <UserCircle2 size={16} className="text-[rgb(var(--muted))]" />
            My profile
          </button>
          {typeof onLogout === "function" ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger-soft))]"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
