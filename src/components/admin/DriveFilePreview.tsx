// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import ModalOverlay from "../shared/ModalOverlay";
import { getAuthHeader } from "../../api/auth";
import { buildApiUrl, toHttpError } from "../../api/http";
import { getDrivePreviewUrl } from "../../api/webknot-drive";

function guessPreviewKind(mimeType, name) {
  const mime = String(mimeType || "").toLowerCase();
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("video/") || ["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    ["txt", "md", "csv", "json", "xml", "log", "html", "htm", "css", "js", "ts", "tsx", "jsx"].includes(ext)
  ) {
    return "text";
  }
  return "generic";
}

export default function DriveFilePreview({ file, open, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const kind = useMemo(
    () => guessPreviewKind(file?.mimeType, file?.name),
    [file?.mimeType, file?.name],
  );

  const previewSrc = useMemo(() => {
    if (!file) return null;
    if (file.source === "local" && file.downloadUrl) return file.downloadUrl;
    const built = getDrivePreviewUrl(file.id);
    return built || file.previewUrl || file.downloadUrl;
  }, [file]);

  const downloadHref = file?.downloadUrl || previewSrc;

  useEffect(() => {
    if (!open || !file || !previewSrc) {
      setLoading(false);
      return;
    }

    let revoked = null;
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      setTextContent("");
      setBlobUrl(null);

      try {
        if (kind === "text") {
          const auth = getAuthHeader();
          const res = await fetch(previewSrc.startsWith("http") ? previewSrc : buildApiUrl(previewSrc), {
            credentials: "include",
            headers: auth ? { Authorization: auth } : undefined,
          });
          if (!res.ok) throw await toHttpError(res);
          const text = await res.text();
          if (alive) setTextContent(text.length > 500_000 ? `${text.slice(0, 500_000)}\n… (truncated)` : text);
        } else if (kind === "image" || kind === "pdf" || kind === "video" || kind === "audio") {
          if (file.source === "local" && file.downloadUrl?.startsWith("blob:")) {
            if (alive) setBlobUrl(file.downloadUrl);
          } else {
            const auth = getAuthHeader();
            const url = previewSrc.startsWith("http") ? previewSrc : buildApiUrl(previewSrc);
            const res = await fetch(url, {
              credentials: "include",
              headers: auth ? { Authorization: auth } : undefined,
            });
            if (!res.ok) throw await toHttpError(res);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            revoked = objectUrl;
            if (alive) setBlobUrl(objectUrl);
          }
        }
      } catch (err) {
        if (alive) setError(err?.message || "Could not load preview.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, file, previewSrc, kind]);

  const displaySrc = blobUrl || (kind !== "text" && file?.source === "local" ? file.downloadUrl : null);

  return (
    <ModalOverlay
      open={open && Boolean(file)}
      onClose={onClose}
      maxWidth="max-w-4xl"
      zIndex={130}
      title={file?.name || "Preview"}
      subtitle={file?.mimeType || "Unknown type"}
      footer={
        <>
          {downloadHref ? (
            <a href={downloadHref} download={file?.name} className="rt-btn-soft text-sm inline-flex items-center gap-1">
              <Download size={14} /> Download
            </a>
          ) : null}
          <button type="button" className="rt-btn-primary text-sm" onClick={onClose}>
            Close
          </button>
        </>
      }
      panelClassName="flex flex-col"
    >
      <div className="min-h-[200px] max-h-[65vh] overflow-auto custom-scrollbar -mt-2">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-[rgb(var(--muted))]">
            <Loader2 size={24} className="animate-spin mr-2" />
            Loading preview…
          </div>
        ) : null}

        {!loading && error ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-rose-600">{error}</p>
          </div>
        ) : null}

        {!loading && !error && kind === "image" && displaySrc ? (
          <img src={displaySrc} alt={file.name} className="max-w-full max-h-[65vh] mx-auto object-contain" />
        ) : null}

        {!loading && !error && kind === "pdf" && displaySrc ? (
          <iframe title={file.name} src={displaySrc} className="w-full h-[65vh] rounded-lg border border-[rgb(var(--border))]" />
        ) : null}

        {!loading && !error && kind === "video" && displaySrc ? (
          <video src={displaySrc} controls className="max-w-full max-h-[65vh] mx-auto w-full" />
        ) : null}

        {!loading && !error && kind === "audio" && displaySrc ? (
          <audio src={displaySrc} controls className="w-full max-w-lg mx-auto" />
        ) : null}

        {!loading && !error && kind === "text" ? (
          <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-[rgb(var(--surface-2))] rounded-lg p-4">
            {textContent || "(empty file)"}
          </pre>
        ) : null}

        {!loading && !error && kind === "generic" ? (
          <div className="text-center py-16 space-y-4">
            <FileText size={48} className="mx-auto text-[rgb(var(--muted))]" />
            <p className="text-sm text-[rgb(var(--muted))]">
              Inline preview is not available for this file type. Download to open it locally.
            </p>
          </div>
        ) : null}
      </div>
    </ModalOverlay>
  );
}
