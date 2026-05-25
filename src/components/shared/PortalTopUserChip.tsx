// @ts-nocheck
import UserAvatar from "./UserAvatar";
import { resolveEmploymentSubtitle } from "../../utils/employmentSubtitle";

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

export default function PortalTopUserChip({
  auth,
  className = "",
  onClick = null,
}) {
  const claims = auth?.claims && typeof auth.claims === "object" ? auth.claims : {};

  const displayName = firstNonEmpty(
    auth?.employeeName,
    auth?.name,
    claims?.name,
    claims?.given_name && claims?.family_name ? `${claims.given_name} ${claims.family_name}` : "",
    claims?.given_name,
  );

  const email = firstNonEmpty(auth?.email, claims?.email, claims?.preferred_username);
  const employmentLine = resolveEmploymentSubtitle(auth);

  const interactive = typeof onClick === "function";
  const title = [displayName || email || "User", employmentLine, interactive ? "Open profile" : ""]
    .filter(Boolean)
    .join(" · ");

  const inner = (
    <>
      <UserAvatar email={email} name={displayName} auth={auth} size={28} className="h-7 w-7" />
      <div className="hidden min-w-0 flex-1 text-left sm:block">
        <div className="truncate text-[13px] font-medium text-[rgb(var(--text))]">
          {displayName || email || "User"}
        </div>
        {employmentLine ? (
          <div className="truncate text-[11px] text-[rgb(var(--muted))]">{employmentLine}</div>
        ) : null}
      </div>
    </>
  );

  const shellClass = [
    "flex max-w-[min(100%,16rem)] items-center gap-2 rounded-[var(--radius-md)]",
    "border border-transparent px-1.5 py-1 transition-colors sm:pr-2",
    interactive ? "cursor-pointer hover:bg-[rgb(var(--surface-2))] hover:border-[rgb(var(--border))]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={shellClass} title={title} aria-label="Open my profile">
        {inner}
      </button>
    );
  }

  return (
    <div className={shellClass} title={title}>
      {inner}
    </div>
  );
}
