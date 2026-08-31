// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ImageIcon,
  Link2,
  Loader2,
  Lock,
  Phone,
  Sparkles,
} from "lucide-react";
import { fetchProfile, fetchEmployeeProfile, updateProfileWithPhoto } from "../../api/user";
import { extractEmploymentDetails } from "../../utils/employmentProfile";
import { getAuth, notifyAuthChanged, setAuth } from "../../api/auth";
import {
  buildCharacterPickerOptions,
  characterStyleLabel,
  defaultCharacterStyle,
  isAppleDevice,
} from "../../utils/avatarCharacter";
import {
  cropImageFileToBlob,
  loadAvatarPrefs,
  resolveDisplayAvatar,
  saveAvatarPrefs,
} from "../../utils/avatarPrefs";
import Toast from "./Toast";
import { resolveEmploymentSubtitle } from "../../utils/employmentSubtitle";
import { coerceDisplayString } from "../../utils/coerceDisplayString";

function unwrapProfile(raw) {
  if (!raw || typeof raw !== "object") return {};
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  return data.profile && typeof data.profile === "object" ? data.profile : data;
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function displayValue(value) {
  const s = coerceDisplayString(value);
  return s || "—";
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="py-3 border-b border-[rgb(var(--border))] last:border-0 sm:grid sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-medium text-[rgb(var(--muted))] uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 sm:mt-0 text-sm font-medium text-[rgb(var(--text))] break-words">
        {displayValue(value)}
      </dd>
    </div>
  );
}

function buildAddressPayload(remote, workLocation) {
  const base =
    remote?.address && typeof remote.address === "object" ? { ...remote.address } : {};
  const loc = String(workLocation ?? "").trim();
  if (loc) base.workLocation = loc;
  else delete base.workLocation;
  return Object.keys(base).length ? base : { workLocation: loc || undefined };
}

export default function UserProfilePage({ auth, onBack }) {
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [remote, setRemote] = useState(null);
  const [employeeRecord, setEmployeeRecord] = useState(null);
  const [phone, setPhone] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [avatarMode, setAvatarMode] = useState("url");
  const [characterSeed, setCharacterSeed] = useState("");
  const [characterStyle, setCharacterStyle] = useState(() => defaultCharacterStyle());
  const [avatarUrl, setAvatarUrl] = useState("");
  const [cropPreview, setCropPreview] = useState(null);
  const [cropFile, setCropFile] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const fileRef = useRef(null);

  const email = firstNonEmpty(auth?.email, auth?.claims?.email);
  const prefs = useMemo(() => loadAvatarPrefs(email), [email]);
  const characterOptions = useMemo(
    () => buildCharacterPickerOptions(email, 16, characterStyle),
    [email, characterStyle],
  );

  const displayName = firstNonEmpty(
    auth?.employeeName,
    auth?.name,
    remote?.name,
    remote?.employeeName,
  );

  useEffect(() => {
    const style = prefs.characterStyle || defaultCharacterStyle();
    setCharacterStyle(style);
    setCharacterSeed(prefs.characterSeed || "");
    setAvatarUrl(prefs.avatarUrl || "");
    if (prefs.characterSeed) setAvatarMode("character");
    else if (prefs.avatarUrl) setAvatarMode("url");
    else if (remote?.profilePic) setAvatarMode("photo");
  }, [prefs.avatarUrl, prefs.characterSeed, prefs.characterStyle, remote?.profilePic]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const empId = String(auth?.employeeId ?? "").trim();
        const [raw, empRaw] = await Promise.all([
          fetchProfile({ signal: controller.signal }),
          empId ? fetchEmployeeProfile(empId, { signal: controller.signal }).catch(() => null) : null,
        ]);
        if (!mounted) return;
        const p = unwrapProfile(raw);
        setRemote(p);
        const empData = empRaw?.data ?? empRaw?.employee ?? empRaw;
        if (empData && typeof empData === "object") setEmployeeRecord(empData);

        const addr = p?.address && typeof p.address === "object" ? p.address : {};
        setPhone(String(p?.phoneNumber ?? "").trim());
        setWorkLocation(String(addr.workLocation ?? p?.workLocation ?? "").trim());
      } catch (err) {
        if (!mounted || err?.name === "AbortError") return;
        setError(err?.message || "Could not load profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [auth?.employeeId, email]);

  const employment = useMemo(
    () =>
      extractEmploymentDetails({
        profile: remote,
        employee: employeeRecord,
        auth,
      }),
    [remote, employeeRecord, auth],
  );

  const avatarDisplay = useMemo(() => {
    if (cropPreview) return { type: "image", value: cropPreview };
    if (avatarMode === "character" && characterSeed) {
      const opt = characterOptions.find((o) => o.seed === characterSeed);
      return { type: "image", value: opt?.url || characterOptions[0]?.url };
    }
    return resolveDisplayAvatar(email, {
      profilePic: remote?.profilePic,
      picture: auth?.picture,
      avatarUrl: avatarMode === "url" ? avatarUrl : prefs.avatarUrl,
    });
  }, [
    avatarMode,
    avatarUrl,
    auth?.picture,
    characterOptions,
    characterSeed,
    cropPreview,
    email,
    prefs.avatarUrl,
    remote?.profilePic,
  ]);

  const onPickFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast({ title: "Invalid file", message: "Choose a JPEG or PNG image.", tone: "error" });
      return;
    }
    setCropFile(file);
    setCropPreview(URL.createObjectURL(file));
    setAvatarMode("photo");
    setCropZoom(1);
  }, []);

  async function buildCroppedBlob() {
    if (!cropFile) return null;
    const img = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(cropFile);
      const el = new Image();
      el.onload = () => {
        URL.revokeObjectURL(url);
        resolve(el);
      };
      el.onerror = reject;
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight) / cropZoom;
    const x = (img.naturalWidth - side) / 2;
    const y = (img.naturalHeight - side) / 2;
    return cropImageFileToBlob(cropFile, { x, y, width: side, height: side }, 320);
  }

  async function handleSaveContact() {
    setSavingContact(true);
    setError("");
    try {
      await updateProfileWithPhoto({
        body: {
          phoneNumber: phone.trim(),
          address: buildAddressPayload(remote, workLocation),
        },
      });
      setRemote((prev) => ({
        ...(prev || {}),
        phoneNumber: phone.trim(),
        address: buildAddressPayload(remote, workLocation),
      }));
      setToast({ title: "Contact updated", message: "Phone and work location were saved." });
    } catch (err) {
      setError(err?.message || "Save failed.");
      setToast({ title: "Save failed", message: err?.message, tone: "error" });
    } finally {
      setSavingContact(false);
    }
  }

  async function handleSaveAvatar() {
    setSavingAvatar(true);
    setError("");
    try {
      saveAvatarPrefs(email, {
        characterSeed: avatarMode === "character" ? characterSeed : "",
        characterStyle: avatarMode === "character" ? characterStyle : undefined,
        avatarUrl: avatarMode === "url" ? avatarUrl.trim() : "",
        emoji: "",
      });

      const blob = avatarMode === "photo" && cropFile ? await buildCroppedBlob() : null;
      if (blob) {
        await updateProfileWithPhoto({ body: {}, photoBlob: blob });
      }

      const session = getAuth() || {};
      setAuth({
        ...session,
        characterSeed: avatarMode === "character" ? characterSeed : undefined,
        characterStyle: avatarMode === "character" ? characterStyle : undefined,
        avatarUrl: avatarMode === "url" ? avatarUrl.trim() : undefined,
        avatarEmoji: undefined,
        picture: blob ? cropPreview : session.picture,
      });
      notifyAuthChanged();

      setToast({ title: "Photo saved", message: "Your profile picture preferences were updated." });
      if (cropPreview && cropPreview.startsWith("blob:")) URL.revokeObjectURL(cropPreview);
      setCropPreview(null);
      setCropFile(null);
    } catch (err) {
      setError(err?.message || "Save failed.");
      setToast({ title: "Save failed", message: err?.message, tone: "error" });
    } finally {
      setSavingAvatar(false);
    }
  }

  const styleHint = isAppleDevice()
    ? "On Apple devices you get soft Memoji-style portraits."
    : "On your device you get unique Pulse characters — playful and distinct.";

  const avatarTabs = [
    { id: "url", label: "Avatar URL", icon: Link2 },
    { id: "photo", label: "Photo", icon: Camera },
    {
      id: "character",
      label: isAppleDevice() ? "Memoji" : "Character",
      icon: Sparkles,
    },
  ];

  return (
    <div className="linear-page max-w-3xl mx-auto w-full min-w-0 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="linear-btn-ghost mb-6 -ml-1 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <header className="linear-card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="linear-avatar-ring h-20 w-20 shrink-0 overflow-hidden">
            {avatarDisplay.type === "image" && avatarDisplay.value ? (
              <img src={avatarDisplay.value} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-[rgb(var(--muted))]">
                {(displayName || email || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="linear-kicker">Account</p>
            <h1 className="linear-title mt-0.5 truncate">{displayName || email || "Your profile"}</h1>
            <p className="linear-subtitle mt-1 truncate">{email}</p>
            {resolveEmploymentSubtitle(auth) ? (
              <span className="linear-badge mt-2">{resolveEmploymentSubtitle(auth)}</span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="linear-callout linear-callout--warn mb-6 text-sm">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[rgb(var(--muted))] mb-6">
          <Loader2 size={16} className="animate-spin" />
          Loading profile…
        </div>
      ) : null}

      <section className="linear-card p-6 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Contact information</h2>
            <p className="text-xs text-[rgb(var(--muted))] mt-1">
              You can update phone and work location. Other fields are maintained by HR.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="linear-label inline-flex items-center gap-1.5">
              <Phone size={13} className="text-[rgb(var(--muted))]" />
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="linear-input mt-1.5"
              placeholder="+91 …"
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="linear-label inline-flex items-center gap-1.5">
              <Building2 size={13} className="text-[rgb(var(--muted))]" />
              Work location
            </label>
            <input
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              className="linear-input mt-1.5"
              placeholder="e.g. Bangalore — Hybrid"
            />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={() => handleSaveContact().catch(() => {})}
            disabled={savingContact || loading}
            className="linear-btn-primary"
          >
            {savingContact ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Save contact
          </button>
        </div>
      </section>

      <section className="linear-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={14} className="text-[rgb(var(--muted))]" />
          <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Employment record</h2>
        </div>
        <p className="text-xs text-[rgb(var(--muted))] mb-4">Read-only — contact HR to change role or org data.</p>
        <dl>
          <ReadOnlyField label="Employee ID" value={employment.empId} />
          <ReadOnlyField label="Work email" value={employment.email} />
          <ReadOnlyField label="Designation" value={employment.designation} />
          <ReadOnlyField label="Band" value={employment.band} />
          <ReadOnlyField label="Department" value={employment.stream} />
          <ReadOnlyField label="Manager ID" value={employment.managerId} />
          <ReadOnlyField label="Date of joining" value={employment.joinDateLabel} />
          <ReadOnlyField label="Years of experience" value={employment.yearsLabel} />
        </dl>
        {employment.bio ? (
          <div className="mt-4 pt-4 border-t border-[rgb(var(--border))]">
            <div className="text-xs font-medium text-[rgb(var(--muted))] uppercase tracking-wide mb-1">
              Bio
            </div>
            <p className="text-sm text-[rgb(var(--text))] leading-relaxed">{employment.bio}</p>
          </div>
        ) : null}
      </section>

      <section className="linear-card p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Profile picture</h2>
          <p className="text-xs text-[rgb(var(--muted))] mt-1">
            Use an image URL, upload a photo to the server, or pick a character avatar on this device.
          </p>
        </div>

        <div className="linear-tab-row">
          {avatarTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAvatarMode(tab.id)}
              className={["linear-tab", avatarMode === tab.id ? "linear-tab--active" : ""].join(" ")}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {avatarMode === "url" ? (
          <div>
            <label className="linear-label">Avatar image URL</label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="linear-input mt-1.5"
              placeholder="https://…"
            />
            <p className="text-xs text-[rgb(var(--muted))] mt-2">
              Paste a public HTTPS image link. Saved on this device and shown across portals.
            </p>
          </div>
        ) : null}

        {avatarMode === "photo" ? (
          <div className="space-y-4">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            {cropPreview ? (
              <div className="space-y-3">
                <div className="mx-auto h-40 w-40 overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
                  <img
                    src={cropPreview}
                    alt="Crop preview"
                    className="h-full w-full object-cover"
                    style={{ transform: `scale(${cropZoom})` }}
                  />
                </div>
                <label className="block text-xs text-[rgb(var(--muted))]">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="mt-1 w-full accent-[rgb(var(--accent))]"
                  />
                </label>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="linear-btn-ghost w-full py-8 flex flex-col items-center gap-2 border-dashed"
              >
                <ImageIcon size={22} className="text-[rgb(var(--muted))]" />
                <span className="text-sm font-medium">Upload photo</span>
                <span className="text-xs text-[rgb(var(--muted))]">Stored on the server when you save</span>
              </button>
            )}
            {cropPreview ? (
              <button
                type="button"
                className="text-xs text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                onClick={() => fileRef.current?.click()}
              >
                Choose a different image
              </button>
            ) : null}
          </div>
        ) : null}

        {avatarMode === "character" ? (
          <div className="space-y-3">
            <p className="text-xs text-[rgb(var(--muted))] leading-relaxed">
              {styleHint} Pick one — {characterStyleLabel(characterStyle)}.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {characterOptions.map((opt) => (
                <button
                  key={opt.seed}
                  type="button"
                  onClick={() => {
                    setCharacterSeed(opt.seed);
                    setCharacterStyle(opt.style);
                  }}
                  className={[
                    "aspect-square rounded-xl border overflow-hidden transition-all",
                    characterSeed === opt.seed
                      ? "ring-2 ring-[rgb(var(--accent))] border-[rgb(var(--accent))] scale-[1.02]"
                      : "border-[rgb(var(--border))] hover:border-[rgb(var(--accent)/.5)]",
                  ].join(" ")}
                  title="Select avatar"
                >
                  <img
                    src={opt.url}
                    alt=""
                    className="h-full w-full object-cover bg-[rgb(var(--surface-2))]"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-[rgb(var(--border))]">
          <button type="button" onClick={onBack} className="linear-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSaveAvatar().catch(() => {})}
            disabled={
              savingAvatar ||
              loading ||
              (avatarMode === "character" && !characterSeed) ||
              (avatarMode === "photo" && !cropFile)
            }
            className="linear-btn-primary"
          >
            {savingAvatar ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Save picture
          </button>
        </div>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
