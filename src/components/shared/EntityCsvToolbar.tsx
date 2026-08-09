// @ts-nocheck
import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import ImportExportActions from "./ImportExportActions";
import { importCsvSingle } from "../../api/csv-import";
import { CSV_ENTITY_SCHEMAS, downloadCsvTemplate } from "../../utils/csvImportNormalize";

function schemaHasCsvTemplate(entityKey) {
  return Boolean(CSV_ENTITY_SCHEMAS[entityKey]?.columns);
}

/**
 * Per-entity import / export toolbar (replaces central CSV Import tab).
 */
export default function EntityCsvToolbar({
  entityKey,
  onImportComplete,
  onExport,
  exportLabel = "Export",
  importLabel = "Import",
  disabled = false,
  showToast,
  allowMissingRequired = false,
  confirmImportMessage = null,
  replaceCatalog = false,
}) {
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const schema = CSV_ENTITY_SCHEMAS[entityKey];
  const canDownloadTemplate = schemaHasCsvTemplate(entityKey);

  async function runImport(file) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const res = await importCsvSingle(entityKey, file, { allowMissingRequired, replaceCatalog });
      const msg =
        (typeof res?.data === "string" ? res.data : null) ||
        res?.message ||
        `Imported ${schema?.label || entityKey}.`;
      showToast?.({ title: "Import complete", message: msg, tone: "success" });
      await onImportComplete?.();
    } catch (err) {
      showToast?.({
        title: "Import failed",
        message: err?.message || "Could not import CSV.",
        tone: "error",
      });
    } finally {
      setBusy(false);
      setPendingFile(null);
    }
  }

  function handleImport(file) {
    if (!file || busy) return;
    if (confirmImportMessage) {
      setPendingFile(file);
      return;
    }
    runImport(file);
  }

  function downloadTemplate() {
    if (!entityKey) return;
    downloadCsvTemplate(entityKey);
  }

  return (
    <>
      <div className="inline-flex flex-wrap items-center gap-2">
        <ImportExportActions
          disabled={disabled || busy}
          importLabel={busy ? "Importing…" : importLabel}
          exportLabel={exportLabel}
          onFileSelected={handleImport}
          onExport={onExport || (canDownloadTemplate ? downloadTemplate : undefined)}
        >
          {canDownloadTemplate && onExport ? (
            <button type="button" className="rt-toolbar-btn" onClick={downloadTemplate} disabled={disabled || busy}>
              CSV template
            </button>
          ) : null}
        </ImportExportActions>
        {busy ? <Loader2 size={16} className="animate-spin text-[rgb(var(--muted))]" /> : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingFile)}
        title="Confirm import"
        message={confirmImportMessage || "Import this CSV file?"}
        confirmText="Import"
        confirmVariant="primary"
        busy={busy}
        onCancel={() => !busy && setPendingFile(null)}
        onConfirm={() => pendingFile && runImport(pendingFile)}
      />
    </>
  );
}
