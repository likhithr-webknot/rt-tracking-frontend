// @ts-nocheck
import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function PortalStepper({ activeTab, steps, onNavigate, className = "" }) {
  const list = Array.isArray(steps) ? steps : [];
  const activeIdx = list.findIndex((s) => s.id === activeTab);

  return (
    <div className={`rt-workflow-stepper ${className}`.trim()}>
      <div className="rt-workflow-stepper-track custom-scrollbar">
        {list.map((step, idx) => {
          const status = step?.status || "pending";
          const active = activeTab === step.id;
          const done = status === "done";
          const isPast = idx < activeIdx;
          return (
            <React.Fragment key={step.id}>
              {idx > 0 ? (
                <div
                  className={[
                    "rt-workflow-stepper-connector hidden sm:block",
                    done || isPast ? "rt-workflow-stepper-connector--done" : "",
                  ].join(" ")}
                />
              ) : null}
              <motion.button
                type="button"
                onClick={() => onNavigate?.(step.id)}
                layout
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={[
                  "rt-workflow-stepper-step",
                  active ? "rt-workflow-stepper-step--active" : "",
                  done ? "rt-workflow-stepper-step--done" : "",
                ].join(" ")}
                title={String(step?.label || "")}
              >
                <span className="rt-workflow-stepper-badge">
                  {done ? <CheckCircle2 size={13} /> : <span>{idx + 1}</span>}
                </span>
                <span className="rt-workflow-stepper-label">{step?.label}</span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
