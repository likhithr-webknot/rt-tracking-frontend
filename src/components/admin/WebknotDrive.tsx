// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  Download,
  Eye,
  FolderOpen,
  HardDrive,
  Loader2,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteDriveFile,
  fetchDriveStorageStats,
  listDriveFiles,
  uploadDriveFile,
} from "../../api/webknot-drive";
import { getAppSettings } from "../../utils/appSettings";
import { friendlyProxyUnreachableMessage } from "../../api/http";
import { resolveAccountStorageKey } from "../../utils/accountStorageKey";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import ConfirmDialog from "../shared/ConfirmDialog";
import DriveFilePreview from "./DriveFilePreview";
import DriveShareModal from "./DriveShareModal";
import Toast from "../shared/Toast";

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function storageBarTone(usedFraction) {
  const usedPct = usedFraction * 100;
  if (usedPct >= 90) return "bg-red-500";
  if (usedPct >= 75) return "bg-amber-500";
  return "bg-[rgb(var(--primary))]";
}

function computeStorageUsage(usedBytes, quotaBytes) {
  const used = Math.max(0, Number(usedBytes) || 0);
  const quota = Math.max(0, Number(quotaBytes) || 0);
  if (!quota) {
    return {
      usedBytes: used,
      quotaBytes: quota,
      usedFraction: 0,
      usedPct: 0,
      availablePct: 100,
      statusLabel: "Available",
    };
  }

  const usedFraction = Math.min(1, used / quota);
  const usedPctExact = usedFraction * 100;
  const availablePctExact = 100 - usedPctExact;

  const formatPct = (value) => {
    if (value <= 0) return 0;
    if (value < 1) return Number(value.toFixed(1));
    if (value >= 99.95) return 100;
    return Math.round(value * 10) / 10;
  };

  const usedPct = formatPct(usedPctExact);
  const availablePct = formatPct(availablePctExact);

  let statusLabel = "Available";
  if (availablePctExact <= 10) statusLabel = "Nearly full";
  else if (availablePctExact <= 25) statusLabel = "Getting full";

  return {
    usedBytes: used,
    quotaBytes: quota,
    usedFraction,
    usedPct,
    availablePct,
    statusLabel,
  };
}

function DriveIconButton({
  title,
  onClick,
  href,
  download,
  disabled = false,
  tone = "default",
  children,
}) {
  const toneClass =
    tone === "danger"
      ? "text-[rgb(var(--muted))] hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
      : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--primary-soft))] hover:text-[rgb(var(--primary))] hover:border-[rgb(var(--primary))]/25";
  const className = [
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-colors",
    toneClass,
    disabled ? "opacity-50 pointer-events-none" : "",
  ].join(" ");

  if (href) {
    return (
      <a href={href} download={download} title={title} aria-label={title} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export default function WebknotDrive({ auth = null, portalLabel = "your account" }) {
  const [files, setFiles] = useState([]);
  const [storageSource, setStorageSource] = useState("server");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [storageStats, setStorageStats] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const uploadLockRef = useRef(false);

  const [appSettings, setAppSettings] = useState(() => getAppSettings());
  const maxUploadBytes = (Number(appSettings.driveMaxUploadMb) || 10) * 1024 * 1024;
  const quotaBytes = (Number(appSettings.driveQuotaGb) || 50) * 1024 * 1024 * 1024;

  useEffect(() => {
    const onSettings = (event) => {
      setAppSettings(event?.detail ?? getAppSettings());
    };
    window.addEventListener("rt:app-settings-updated", onSettings);
    return () => window.removeEventListener("rt:app-settings-updated", onSettings);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const [res, stats] = await Promise.all([listDriveFiles(), fetchDriveStorageStats()]);
      setFiles(res.items || []);
      setStorageSource(res.source || "server");
      setStorageStats(stats);
    } catch (err) {
      setFiles([]);
      setStorageSource("error");
      setToast({
        title: "Drive unavailable",
        message: friendlyProxyUnreachableMessage(err?.message) || "Could not load files from the server.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const accountLabel = useMemo(
    () => resolveAccountStorageKey(auth, "you"),
    [auth],
  );

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading || uploadLockRef.current) return;
    if (file.size > maxUploadBytes) {
      setToast({
        title: "File too large",
        message: `Max upload size is ${appSettings.driveMaxUploadMb} MB (change in Settings).`,
        tone: "error",
      });
      return;
    }
    uploadLockRef.current = true;
    setUploading(true);
    try {
      await uploadDriveFile(file);
      setToast({ title: "Uploaded", message: file.name });
      await loadFiles();
    } catch (err) {
      setToast({ title: "Upload failed", message: err?.message, tone: "error" });
    } finally {
      setUploading(false);
      uploadLockRef.current = false;
    }
  }

  async function onDelete(file) {
    if (!file?.id) return;
    setDeletingId(file.id);
    try {
      await deleteDriveFile(file.id);
      setToast({ title: "Removed", message: file.name });
      if (previewFile?.id === file.id) setPreviewFile(null);
      await loadFiles();
    } catch (err) {
      setToast({ title: "Delete failed", message: err?.message, tone: "error" });
    } finally {
      setDeletingId(null);
      setFileToDelete(null);
    }
  }

  function requestDelete(file) {
    if (!file?.id) return;
    setFileToDelete(file);
  }

  const filteredFiles = useMemo(() => files, [files]);
  const storage = useMemo(() => {
    const usedBytes =
      storageStats?.totalBytes ?? filteredFiles.reduce((s, f) => s + (Number(f.size) || 0), 0);
    return computeStorageUsage(usedBytes, quotaBytes);
  }, [storageStats?.totalBytes, filteredFiles, quotaBytes]);

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Webknot Drive"
        subtitle={`Private file storage for ${portalLabel} only — others cannot browse your drive.`}
      >
        <label className="rt-btn-primary cursor-pointer inline-flex items-center gap-2">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload
          <input type="file" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>
        <button type="button" className="rt-btn-secondary" onClick={loadFiles}>
          Refresh
        </button>
      </AdminPageHeader>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rt-badge rt-badge--primary">
          <Cloud size={12} className="inline mr-1" />
          {storageSource === "server"
            ? "Object storage API"
            : storageSource === "local"
              ? "Local fallback (API pending)"
              : "Connection error"}
        </span>
        <span className="rt-badge rt-badge--neutral">{filteredFiles.length} files</span>
        <span className="rt-badge rt-badge--neutral">Account: {accountLabel}</span>
      </div>

      <div className="rt-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]">
              <HardDrive size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">
                Storage used
              </p>
              <p className="mt-1 text-sm font-semibold text-[rgb(var(--text))] tabular-nums">
                {formatBytes(storage.usedBytes)}
                <span className="font-normal text-[rgb(var(--muted))]"> / {formatBytes(storage.quotaBytes)}</span>
              </p>
              <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
                {filteredFiles.length} file{filteredFiles.length === 1 ? "" : "s"} in your drive
                {storage.usedPct > 0 ? ` · ${storage.usedPct}% used` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-end gap-3 sm:flex-col sm:items-end">
            <span className="text-2xl font-bold tabular-nums leading-none text-[rgb(var(--text))]">
              {storage.availablePct}%
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              {storage.statusLabel}
            </span>
          </div>
        </div>
        <div className="border-b border-[rgb(var(--border))] px-4 pb-4 pt-3 sm:px-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-[rgb(var(--surface-2))] ring-1 ring-[rgb(var(--border))]/60">
            <div
              className={`h-full rounded-full transition-all duration-500 ${storageBarTone(storage.usedFraction)}`}
              style={{
                width: `${storage.usedBytes > 0 ? Math.max(storage.usedFraction * 100, 0.5) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
                <th className="p-4">Name</th>
                <th className="p-4">Size</th>
                <th className="p-4">Uploaded</th>
                <th className="p-4">Shared with</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[rgb(var(--muted))]">
                    <Loader2 className="animate-spin inline mr-2" size={18} />
                    Loading drive…
                  </td>
                </tr>
              ) : null}
              {!loading &&
                filteredFiles.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]/40 cursor-pointer"
                    onClick={() => setPreviewFile(f)}
                  >
                    <td className="p-4 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <FolderOpen size={14} className="text-[rgb(var(--accent))]" />
                        {f.name}
                      </span>
                    </td>
                    <td className="p-4 text-[rgb(var(--muted))]">{formatBytes(f.size)}</td>
                    <td className="p-4 text-xs text-[rgb(var(--muted))]">
                      {new Date(f.uploadedAt).toLocaleString()}
                    </td>
                    <td className="p-4 max-w-[220px]">
                      {f.sharedWith?.length ? (
                        <button
                          type="button"
                          className="text-left text-xs text-[rgb(var(--text))] hover:text-[rgb(var(--accent))] underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareFile(f);
                          }}
                        >
                          <span className="rt-badge rt-badge--neutral mr-1.5">{f.sharedWith.length}</span>
                          {(f.sharedWith || [])
                            .slice(0, 2)
                            .map((u) => u.name || u.email)
                            .filter(Boolean)
                            .join(", ")}
                          {f.sharedWith.length > 2 ? ` +${f.sharedWith.length - 2}` : ""}
                        </button>
                      ) : (
                        <span className="text-[rgb(var(--muted))]">Private</span>
                      )}
                    </td>
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center justify-end gap-1">
                        <DriveIconButton title="Preview" onClick={() => setPreviewFile(f)}>
                          <Eye size={15} />
                        </DriveIconButton>
                        {f.downloadUrl ? (
                          <DriveIconButton title="Download" href={f.downloadUrl} download={f.name}>
                            <Download size={15} />
                          </DriveIconButton>
                        ) : null}
                        <DriveIconButton title="Share" onClick={() => setShareFile(f)}>
                          <Share2 size={15} />
                        </DriveIconButton>
                        <DriveIconButton
                          title="Remove"
                          tone="danger"
                          disabled={deletingId === f.id}
                          onClick={() => requestDelete(f)}
                        >
                          {deletingId === f.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </DriveIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && !filteredFiles.length ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-[rgb(var(--muted))]">
                    No files yet. Upload to Webknot Drive.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <DriveShareModal
        file={shareFile}
        open={Boolean(shareFile)}
        onClose={() => setShareFile(null)}
        onShared={loadFiles}
        showToast={setToast}
      />

      <DriveFilePreview
        file={previewFile}
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
      />

      <ConfirmDialog
        open={Boolean(fileToDelete)}
        title="Remove file"
        message={
          fileToDelete
            ? `Remove “${fileToDelete.name}” from your drive? This cannot be undone.`
            : ""
        }
        confirmText="Remove"
        confirmVariant="danger"
        busy={Boolean(deletingId)}
        onCancel={() => !deletingId && setFileToDelete(null)}
        onConfirm={() => fileToDelete && onDelete(fileToDelete)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
