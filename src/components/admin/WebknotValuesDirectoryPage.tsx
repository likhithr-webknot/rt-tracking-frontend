// @ts-nocheck
import React from "react";
import CompanyValuesWorkspace from "./CompanyValuesWorkspace";

/** Standalone route shell — delegates to CompanyValuesWorkspace */
export default function WebknotValuesDirectoryPage() {
  return (
    <div className="rt-shell min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <CompanyValuesWorkspace />
      </div>
    </div>
  );
}
