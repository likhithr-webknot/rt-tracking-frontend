import type { ImgHTMLAttributes } from "react";

export const COMPANY_LOGO_SRC = "/favicon.ico";

type CompanyLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  size?: number;
  alt?: string;
};

export default function CompanyLogo({
  size = 36,
  alt = "Webknot",
  className = "",
  ...rest
}: CompanyLogoProps) {
  return (
    <img
      src={COMPANY_LOGO_SRC}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={["object-contain bg-transparent", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function SidebarLogoMark({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <img
      src={COMPANY_LOGO_SRC}
      alt=""
      width={size}
      height={size}
      decoding="async"
      aria-hidden
      className={["shrink-0 object-contain bg-transparent", className].filter(Boolean).join(" ")}
    />
  );
}
