// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import {
  getScopedSettings,
  resetScopedSettings,
  saveScopedSettings,
} from "../utils/portalSettings";

export default function useScopedSettings(scope) {
  const [settings, setSettings] = useState(() => getScopedSettings(scope));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(getScopedSettings(scope)));

  useEffect(() => {
    function onUpdated(event) {
      if (event?.detail?.scope !== scope) return;
      const next = event?.detail?.settings ?? getScopedSettings(scope);
      setSettings(next);
      setSavedSnapshot(JSON.stringify(next));
    }
    window.addEventListener("rt:portal-settings-updated", onUpdated);
    return () => window.removeEventListener("rt:portal-settings-updated", onUpdated);
  }, [scope]);

  const hasUnsaved = useMemo(
    () => JSON.stringify(settings) !== savedSnapshot,
    [settings, savedSnapshot],
  );

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    const saved = saveScopedSettings(scope, settings);
    setSettings(saved);
    setSavedSnapshot(JSON.stringify(saved));
    return saved;
  }

  function onReset() {
    const defaults = resetScopedSettings(scope);
    setSettings(defaults);
    setSavedSnapshot(JSON.stringify(defaults));
    return defaults;
  }

  return {
    settings,
    hasUnsaved,
    updateSetting,
    onSave,
    onReset,
    setSettings,
    setSavedSnapshot,
  };
}
