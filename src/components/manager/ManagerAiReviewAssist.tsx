// @ts-nocheck
import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { suggestManagerReviewDraft } from "../../api/ai-agents";

export default function ManagerAiReviewAssist({
  context = {},
  onApply,
  disabled = false,
  className = "",
}) {
  const [busy, setBusy] = useState(false);

  async function handleSuggest() {
    setBusy(true);
    try {
      const res = await suggestManagerReviewDraft(context);
      const text = String(res?.text || "").trim();
      if (text && onApply) onApply(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handleSuggest}
      className={["rt-btn-soft text-xs inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
      title="Draft comment from KPI and value deltas — does not auto-score"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      Suggest comment
    </button>
  );
}
