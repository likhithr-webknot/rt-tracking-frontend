// @ts-nocheck
import { useMemo } from "react";
import { characterAvatarUrl, defaultCharacterStyle } from "../../utils/avatarCharacter";
import { loadAvatarPrefs, resolveDisplayAvatar } from "../../utils/avatarPrefs";

function buildInitials(name, email) {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) return e.replace(/@.*/, "").slice(0, 2).toUpperCase();
  return "?";
}

export default function UserAvatar({
  email = "",
  name = "",
  auth = null,
  size = 40,
  className = "",
  ringClassName = "rounded-full",
}) {
  const avatar = useMemo(() => {
    const prefs = loadAvatarPrefs(email);
    if (prefs.characterSeed) {
      return {
        type: "character",
        url: characterAvatarUrl(prefs.characterSeed, prefs.characterStyle || defaultCharacterStyle()),
      };
    }
    if (auth?.characterSeed) {
      return {
        type: "character",
        url: characterAvatarUrl(auth.characterSeed, auth.characterStyle || defaultCharacterStyle()),
      };
    }
    return resolveDisplayAvatar(email, {
      profilePic: auth?.profilePic,
      picture: auth?.picture,
      avatarUrl: auth?.avatarUrl || prefs.avatarUrl,
    });
  }, [auth?.avatarUrl, auth?.characterSeed, auth?.characterStyle, auth?.picture, auth?.profilePic, email]);

  const px = typeof size === "number" ? size : 40;
  const shell = [
    "inline-flex shrink-0 items-center justify-center overflow-hidden bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))]",
    ringClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (avatar.type === "character" || (avatar.type === "image" && avatar.value)) {
    const src = avatar.type === "character" ? avatar.url : avatar.value;
    return (
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        className={shell}
        style={{ width: px, height: px }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={[shell, "text-[rgb(var(--muted))] font-semibold"].join(" ")}
      style={{ width: px, height: px, fontSize: Math.max(10, Math.round(px * 0.34)) }}
      aria-hidden
    >
      {buildInitials(name || auth?.employeeName || auth?.name, email)}
    </div>
  );
}
