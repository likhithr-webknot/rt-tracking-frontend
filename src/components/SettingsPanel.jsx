import React from "react";

export default function SettingsPanel() {
  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-black uppercase tracking-tighter italic">Settings</h2>
      <p className="text-gray-500 text-sm mt-2">
        Settings will live here (roles, permissions, cycles, integrations, etc.).
      </p>

      <div className="mt-8 bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        <p className="text-gray-400">
          Add your settings form components here.
        </p>
      </div>
    </div>
  );
}