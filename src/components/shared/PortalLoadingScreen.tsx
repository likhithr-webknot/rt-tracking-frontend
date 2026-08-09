import CompanyLogo from "./CompanyLogo";

type PortalLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  kicker?: string;
  className?: string;
};

/**
 * Full-viewport Pulse loader — orbital mark + scanning bar (used for auth bootstrap + Suspense).
 */
export default function PortalLoadingScreen({
  title = "Loading workspace",
  subtitle = "Syncing people, projects, and permissions…",
  kicker = "Webknot Pulse",
  className = "",
}: PortalLoadingScreenProps) {
  return (
    <div
      className={[
        "pulse-loader-screen grid min-h-[100dvh] place-items-center px-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pulse-loader-card relative w-full max-w-md overflow-hidden px-10 py-12 text-center">
        <div className="pulse-loader-orbit mx-auto" aria-hidden>
          <span className="pulse-loader-orbit__ring" />
          <span className="pulse-loader-orbit__ring pulse-loader-orbit__ring--delay" />
          <span className="pulse-loader-orbit__core">
            <CompanyLogo size={40} className="h-10 w-10" aria-hidden />
          </span>
          <span className="pulse-loader-orbit__dot" />
        </div>

        <p className="rt-kicker mt-8">{kicker}</p>
        <h1 className="rt-title mt-2">{title}</h1>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">{subtitle}</p>

        <div className="pulse-loader-scan mt-8" aria-hidden>
          <span className="pulse-loader-scan__beam" />
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="pulse-loader-tick" />
          <span className="pulse-loader-tick pulse-loader-tick--2" />
          <span className="pulse-loader-tick pulse-loader-tick--3" />
        </div>
      </div>
    </div>
  );
}
