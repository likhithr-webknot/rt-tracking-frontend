/** Illustrated avatars: Memoji-adjacent on Apple, fun characters elsewhere (DiceBear CDN). */

export type CharacterAvatarStyle = "memoji" | "pulse";

export function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");
  return /Mac|iPhone|iPad|iPod/i.test(ua) || /Mac|iPhone|iPad/i.test(platform);
}

export function defaultCharacterStyle(): CharacterAvatarStyle {
  return isAppleDevice() ? "memoji" : "pulse";
}

export function characterAvatarUrl(seed: string, style: CharacterAvatarStyle = defaultCharacterStyle()): string {
  const s = encodeURIComponent(String(seed || "pulse").trim() || "pulse");
  if (style === "memoji") {
    return `https://api.dicebear.com/9.x/micah/svg?seed=${s}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${s}&backgroundColor=ede9fe,dbeafe,fef3c7,fce7f3`;
}

export type CharacterPickerOption = {
  seed: string;
  style: CharacterAvatarStyle;
  url: string;
};

export function buildCharacterPickerOptions(
  email: string,
  count = 16,
  style: CharacterAvatarStyle = defaultCharacterStyle(),
): CharacterPickerOption[] {
  const base = String(email || "user").trim().toLowerCase() || "user";
  return Array.from({ length: count }, (_, i) => {
    const seed = `${base}-${style}-${i}`;
    return { seed, style, url: characterAvatarUrl(seed, style) };
  });
}

export function characterStyleLabel(style: CharacterAvatarStyle): string {
  return style === "memoji" ? "Memoji-style" : "Pulse character";
}
