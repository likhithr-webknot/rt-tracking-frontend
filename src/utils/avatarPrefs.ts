import type { CharacterAvatarStyle } from "./avatarCharacter";
import { characterAvatarUrl, defaultCharacterStyle } from "./avatarCharacter";

const AVATAR_PREFS_KEY = "rt_pulse_avatar_prefs_v1";

export type AvatarPrefs = {
  /** @deprecated use characterSeed */
  emoji?: string;
  avatarUrl?: string;
  characterSeed?: string;
  characterStyle?: CharacterAvatarStyle;
};

function storageKey(email: string) {
  return `${AVATAR_PREFS_KEY}:${String(email || "").trim().toLowerCase()}`;
}

export function loadAvatarPrefs(email: string): AvatarPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(email));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAvatarPrefs(email: string, prefs: AvatarPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(email), JSON.stringify(prefs ?? {}));
  } catch {
    void 0;
  }
}

export function resolveDisplayAvatar(
  email: string,
  sources: { profilePic?: string; picture?: string; avatarUrl?: string } = {},
) {
  const prefs = loadAvatarPrefs(email);
  if (prefs.characterSeed) {
    return {
      type: "character" as const,
      value: characterAvatarUrl(prefs.characterSeed, prefs.characterStyle || defaultCharacterStyle()),
    };
  }
  const remote = String(sources.profilePic ?? sources.picture ?? sources.avatarUrl ?? "").trim();
  if (remote) return { type: "image" as const, value: remote };
  if (prefs.avatarUrl) return { type: "image" as const, value: prefs.avatarUrl };
  return { type: "none" as const, value: "" };
}

/** Crop image file to square JPEG blob via canvas. */
export async function cropImageFileToBlob(
  file: File,
  crop: { x: number; y: number; width: number; height: number },
  outputSize = 256,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image."));
    };
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  const scaleX = img.naturalWidth / crop.width;
  const scaleY = img.naturalHeight / crop.height;
  ctx.drawImage(
    img,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))),
      "image/jpeg",
      0.92,
    );
  });
}
