import React from 'react';
import { clearAuth } from '../../api/auth';
import { LifeBuoy, LogOut } from 'lucide-react';

export default function UnregisteredUserPage({ onTryAgain, onContactSupport }) {
  const handleLogout = () => {
    clearAuth();
    if (onTryAgain) {
      onTryAgain();
    } else {
      // If no callback, just reload the page to clear state
      window.location.href = window.location.pathname;
    }
  };

  return (
    <div className="rt-shell grid place-items-center px-6 bg-red-50 dark:bg-red-900/20">
      <div className="rt-panel text-center px-8 sm:px-12 py-10 w-full max-w-xl border-red-200 dark:border-red-700/50 shadow-lg shadow-red-500/10">
        <div className="w-fit mx-auto rounded-full bg-red-100 dark:bg-red-500/10 p-3">
            <LifeBuoy size={32} className="text-red-600 dark:text-red-400" />
        </div>
        <div className="mt-4 rt-kicker text-red-600 dark:text-red-400">Access Denied</div>
        <h1 className="mt-2 rt-title text-2xl sm:text-3xl">Unregistered Account</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          The Google account you used to sign in is not registered with this application.
          Please contact your administrator to request access, or sign in with a different, authorized account.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <button
            className="rt-btn-primary inline-flex items-center justify-center gap-2"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            Try a Different Account
          </button>
          <button
            className="rt-btn-ghost inline-flex items-center justify-center gap-2"
            onClick={onContactSupport}
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
