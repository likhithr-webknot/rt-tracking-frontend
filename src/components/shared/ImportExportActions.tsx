import type { ReactNode } from "react";
import { Download, Upload } from "lucide-react";

type ImportExportActionsProps = {
  onImport?: () => void;
  onExport?: () => void;
  importLabel?: string;
  exportLabel?: string;
  accept?: string;
  onFileSelected?: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Consistent import / export control group for admin data panels.
 */
export default function ImportExportActions({
  onImport,
  onExport,
  importLabel = "Import CSV",
  exportLabel = "Export CSV",
  accept = ".csv,text/csv",
  onFileSelected,
  disabled = false,
  className = "",
  children,
}: ImportExportActionsProps) {
  const useHiddenInput = Boolean(onFileSelected);

  return (
    <div className={["rt-toolbar", className].filter(Boolean).join(" ")} role="group" aria-label="Import and export">
      {useHiddenInput ? (
        <label className={["rt-toolbar-btn cursor-pointer", disabled ? "pointer-events-none opacity-50" : ""].join(" ")}>
          <Upload size={15} strokeWidth={2} />
          {importLabel}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              onFileSelected?.(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <button
          type="button"
          disabled={disabled || !onImport}
          onClick={onImport}
          className="rt-toolbar-btn"
        >
          <Upload size={15} strokeWidth={2} />
          {importLabel}
        </button>
      )}
      <span className="rt-toolbar-divider" aria-hidden />
      <button type="button" disabled={disabled || !onExport} onClick={onExport} className="rt-toolbar-btn">
        <Download size={15} strokeWidth={2} />
        {exportLabel}
      </button>
      {children ? (
        <>
          <span className="rt-toolbar-divider" aria-hidden />
          {children}
        </>
      ) : null}
    </div>
  );
}
