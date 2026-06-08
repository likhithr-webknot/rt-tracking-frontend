// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { fetchPromotionPaths, savePromotionPaths } from "../../api/promotion-settings";
import {
  DEFAULT_NON_TECH_PROMOTION_PATH,
  DEFAULT_TECH_PROMOTION_PATH,
  formatPromotionPathLabel,
  KNOWN_PROMOTION_BANDS,
  sanitizePromotionPath,
  setCachedPromotionPaths,
  validatePromotionPathsConfig,
} from "../../utils/promotionPathSettings";
import { SectionCard, FieldLabel } from "../shared/settings/SettingsLayout";

function PathLadder({ path }) {
  if (!path?.length) {
    return <p className="text-xs text-[rgb(var(--muted))]">No bands configured.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {path.map((band, idx) => (
        <React.Fragment key={`${band}-${idx}`}>
          <span className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 font-mono font-semibold text-[rgb(var(--text))]">
            {band}
          </span>
          {idx < path.length - 1 ? <span className="text-[rgb(var(--muted))]">→</span> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function PathEditor({ label, hint, path, onChange }) {
  const available = useMemo(
    () => KNOWN_PROMOTION_BANDS.filter((band) => !path.includes(band)),
    [path],
  );

  function moveBand(index, delta) {
    const next = [...path];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function removeBand(index) {
    onChange(path.filter((_, idx) => idx !== index));
  }

  function addBand(band) {
    const code = String(band || "").trim();
    if (!code || path.includes(code)) return;
    onChange([...path, code]);
  }

  return (
    <div className="rounded-lg border border-[rgb(var(--border))] p-4 space-y-3">
      <div>
        <FieldLabel hint={hint}>{label}</FieldLabel>
        <p className="text-xs text-[rgb(var(--muted))] mt-1">
          Ordered lowest (entry) to highest (max promotion). Employees move one step at a time along this ladder.
        </p>
      </div>
      <PathLadder path={path} />
      <div className="space-y-2">
        {path.map((band, index) => (
          <div key={`${band}-${index}`} className="flex items-center gap-2">
            <span className="w-6 text-xs text-[rgb(var(--muted))]">{index + 1}.</span>
            <span className="flex-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 font-mono text-sm">
              {band}
            </span>
            <button
              type="button"
              className="rt-btn rt-btn-ghost p-2"
              onClick={() => moveBand(index, -1)}
              disabled={index === 0}
              title="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rt-btn rt-btn-ghost p-2"
              onClick={() => moveBand(index, 1)}
              disabled={index === path.length - 1}
              title="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rt-btn rt-btn-ghost p-2 text-rose-600 dark:text-rose-300"
              onClick={() => removeBand(index)}
              disabled={path.length <= 1}
              title="Remove band"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rt-input text-sm min-w-[8rem]"
          defaultValue=""
          onChange={(e) => {
            addBand(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Add band…
          </option>
          {available.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>
        <span className="text-xs text-[rgb(var(--muted))]">
          {available.length ? "Pick a band to append at the end." : "All known bands are already in this path."}
        </span>
      </div>
    </div>
  );
}

export default function PromotionPathSettings({ onToast }) {
  const [techPath, setTechPath] = useState([...DEFAULT_TECH_PROMOTION_PATH]);
  const [nonTechPath, setNonTechPath] = useState([...DEFAULT_NON_TECH_PROMOTION_PATH]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const refresh = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    try {
      const config = await fetchPromotionPaths({ signal });
      const tech = sanitizePromotionPath(config.techPath, DEFAULT_TECH_PROMOTION_PATH);
      const nonTech = sanitizePromotionPath(config.nonTechPath, DEFAULT_NON_TECH_PROMOTION_PATH);
      setTechPath(tech);
      setNonTechPath(nonTech);
      setCachedPromotionPaths({ techPath: tech, nonTechPath: nonTech });
      const snapshot = JSON.stringify({ techPath: tech, nonTechPath: nonTech });
      setSavedSnapshot(snapshot);
      setDirty(false);
    } catch (err) {
      onToast?.({
        title: "Could not load promotion paths",
        message: err?.message || "Using defaults until the server responds.",
        tone: "error",
      });
      const fallback = {
        techPath: [...DEFAULT_TECH_PROMOTION_PATH],
        nonTechPath: [...DEFAULT_NON_TECH_PROMOTION_PATH],
      };
      setTechPath(fallback.techPath);
      setNonTechPath(fallback.nonTechPath);
      setSavedSnapshot(JSON.stringify(fallback));
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    const ac = new AbortController();
    refresh({ signal: ac.signal }).catch(() => {});
    return () => ac.abort();
  }, [refresh]);

  useEffect(() => {
    const snapshot = JSON.stringify({ techPath, nonTechPath });
    setDirty(snapshot !== savedSnapshot);
  }, [techPath, nonTechPath, savedSnapshot]);

  async function handleSave() {
    const payload = {
      techPath: sanitizePromotionPath(techPath, DEFAULT_TECH_PROMOTION_PATH),
      nonTechPath: sanitizePromotionPath(nonTechPath, DEFAULT_NON_TECH_PROMOTION_PATH),
    };
    const validation = validatePromotionPathsConfig(payload);
    if (!validation.ok) {
      onToast?.({ title: "Invalid promotion paths", message: validation.message, tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const saved = await savePromotionPaths(payload);
      const tech = sanitizePromotionPath(saved.techPath, DEFAULT_TECH_PROMOTION_PATH);
      const nonTech = sanitizePromotionPath(saved.nonTechPath, DEFAULT_NON_TECH_PROMOTION_PATH);
      setTechPath(tech);
      setNonTechPath(nonTech);
      setCachedPromotionPaths({ techPath: tech, nonTechPath: nonTech });
      const snapshot = JSON.stringify({ techPath: tech, nonTechPath: nonTech });
      setSavedSnapshot(snapshot);
      setDirty(false);
      onToast?.({
        title: "Promotion paths saved",
        message: "Tech and non-tech ladders are now active for promotions.",
      });
    } catch (err) {
      onToast?.({
        title: "Save failed",
        message: err?.message || "Could not save promotion paths.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefaults() {
    setTechPath([...DEFAULT_TECH_PROMOTION_PATH]);
    setNonTechPath([...DEFAULT_NON_TECH_PROMOTION_PATH]);
  }

  return (
    <SectionCard
      icon={TrendingUp}
      title="Promotion ladders"
      description="Configure the band order used when HR promotes employees on tech and non-tech tracks."
    >
      <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">
        Promotions always advance one step along the selected ladder. The backend uses these paths for{" "}
        <code className="text-xs">POST /api/v1/user/promote</code> and the directory preview.
      </p>

      {loading ? (
        <p className="text-sm text-[rgb(var(--muted))]">Loading promotion paths…</p>
      ) : (
        <div className="space-y-4">
          <PathEditor
            label="Tech path"
            hint="Example: B8 → B7L → B7H → B6L → B6H → B6 → B5"
            path={techPath}
            onChange={setTechPath}
          />
          <PathEditor
            label="Non-tech path"
            hint="Example: B8 → B7L → B7H → B6 → B5 → B4 → B3 → B2 → B1"
            path={nonTechPath}
            onChange={setNonTechPath}
          />
          <div className="rounded-lg border border-dashed border-[rgb(var(--border))] px-4 py-3 text-xs text-[rgb(var(--muted))] space-y-1">
            <div>
              <span className="font-semibold text-[rgb(var(--text))]">Tech preview:</span>{" "}
              {formatPromotionPathLabel(techPath)}
            </div>
            <div>
              <span className="font-semibold text-[rgb(var(--text))]">Non-tech preview:</span>{" "}
              {formatPromotionPathLabel(nonTechPath)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button type="button" className="rt-btn rt-btn-primary" onClick={handleSave} disabled={loading || saving || !dirty}>
          {saving ? "Saving…" : "Save promotion paths"}
        </button>
        <button type="button" className="rt-btn rt-btn-secondary" onClick={handleResetDefaults} disabled={loading || saving}>
          Reset to defaults
        </button>
        <button
          type="button"
          className="rt-btn rt-btn-ghost inline-flex items-center gap-2"
          onClick={() => refresh().catch(() => {})}
          disabled={loading || saving}
        >
          <RefreshCw className="h-4 w-4" />
          Reload
        </button>
        {dirty ? <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span> : null}
      </div>
    </SectionCard>
  );
}
