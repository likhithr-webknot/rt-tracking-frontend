// @ts-nocheck
import React from "react";
import { BookOpen } from "lucide-react";
import ModalOverlay from "./ModalOverlay";
import { getPortalUsageGuide } from "../../utils/portalUsageGuide";

export default function PortalUsageGuideModal({ open, onClose, guideKey }) {
  const guide = getPortalUsageGuide(guideKey);

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      zIndex={125}
      title={guide.title}
      subtitle={guide.subtitle}
    >
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-xs font-semibold text-[rgb(var(--muted))]">
        <BookOpen size={14} />
        Guide for {guide.roleLabel}
      </div>

      <div className="space-y-4 max-h-[min(60vh,520px)] overflow-y-auto custom-scrollbar pr-1">
        {guide.sections.map((section) => (
          <section
            key={section.id}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <h3 className="text-sm font-semibold text-[rgb(var(--text))]">{section.title}</h3>
            <p className="mt-1.5 text-sm text-[rgb(var(--muted))] leading-relaxed">{section.body}</p>
            {Array.isArray(section.tips) && section.tips.length ? (
              <ul className="mt-3 space-y-2 border-t border-[rgb(var(--border))]/60 pt-3">
                {section.tips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-sm text-[rgb(var(--text))] leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--primary))]" aria-hidden />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" className="rt-btn-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
