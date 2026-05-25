// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  FolderOpen,
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
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
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

  const appSettings = useMemo(() => getAppSettings(), []);
  const maxUploadBytes = (Number(appSettings.driveMaxUploadMb) || 10) * 1024 * 1024;
  const quotaBytes = (Number(appSettings.driveQuotaGb) || 50) * 1024 * 1024 * 1024;

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
  const usedBytes = storageStats?.totalBytes ?? filteredFiles.reduce((s, f) => s + (Number(f.size) || 0), 0);
  const usedPct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

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
        <span className="rt-badge rt-badge--neutral">
          {formatBytes(usedBytes)} / {formatBytes(quotaBytes)} ({usedPct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-[rgb(var(--surface-2))] overflow-hidden max-w-md">
        <div
          className="h-full bg-[rgb(var(--primary))] transition-all"
          style={{ width: `${usedPct}%` }}
        />
      </div>

      <div className="rt-panel overflow-hidden">
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
                    <td className="p-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="rt-btn-soft text-xs"
                        onClick={() => setPreviewFile(f)}
                      >
                        Preview
                      </button>
                      {f.downloadUrl ? (
                        <a href={f.downloadUrl} download={f.name} className="rt-btn-soft text-xs">
                          Download
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="rt-btn-soft text-xs inline-flex items-center gap-1"
                        onClick={() => setShareFile(f)}
                      >
                        <Share2 size={12} /> Share
                      </button>
                      <button
                        type="button"
                        className="rt-btn-soft text-xs inline-flex items-center gap-1 text-[rgb(var(--danger))]"
                        disabled={deletingId === f.id}
                        onClick={() => requestDelete(f)}
                      >
                        {deletingId === f.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}{" "}
                        Remove
                      </button>
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
