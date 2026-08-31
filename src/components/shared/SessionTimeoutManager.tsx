// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import {
  getSessionExpiryReason,
  getSessionRemainingMs,
  SESSION_WARNING_MS,
  touchSessionActivity,
} from "../../api/auth";

function formatCountdown(totalSec) {
  const sec = Math.max(0, totalSec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s} second${s === 1 ? "" : "s"}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function expiryMessage(reason) {
  if (reason === "token_expired") {
    return "Your sign-in token expired for security. Please sign in again to continue.";
  }
  if (reason === "max_duration") {
    return "Your session reached the maximum allowed length. Please sign in again to continue.";
  }
  return "You were signed out due to inactivity. Please sign in again to continue.";
}

/**
 * Warns before idle/max/token session expiry, then shows a final dialog before logout.
 */
export default function SessionTimeoutManager({ signedIn = false, onExpire }) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [countdownSec, setCountdownSec] = useState(0);
  const [expiryReason, setExpiryReason] = useState("");
  const expiredHandledRef = useRef(false);
  const lastTouchRef = useRef(0);

  const handleExpire = useCallback(() => {
    if (expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    setWarningOpen(false);
    setExpiredOpen(true);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setWarningOpen(false);
      setExpiredOpen(false);
      setCountdownSec(0);
      setExpiryReason("");
      expiredHandledRef.current = false;
      return undefined;
    }

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouchRef.current < 15_000) return;
      lastTouchRef.current = now;
      touchSessionActivity();
    };

    const windowEvents = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"];
    for (const ev of windowEvents) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onActivity);

    const tick = () => {
      const reason = getSessionExpiryReason();
      if (reason === "max_duration" || reason === "inactivity" || reason === "token_expired") {
        setExpiryReason(reason);
        handleExpire();
        return;
      }

      const remaining = getSessionRemainingMs();
      if (remaining <= 0) {
        setExpiryReason(reason || "inactivity");
        handleExpire();
        return;
      }

      if (remaining <= SESSION_WARNING_MS) {
        setCountdownSec(Math.ceil(remaining / 1000));
        setWarningOpen(true);
      } else {
        setWarningOpen(false);
      }
    };

    tick();
    touchSessionActivity({ ensureIssuedAt: true });
    const interval = window.setInterval(tick, 1000);

    return () => {
      for (const ev of windowEvents) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onActivity);
      window.clearInterval(interval);
    };
  }, [handleExpire, signedIn]);

  const staySignedIn = () => {
    touchSessionActivity({ ensureIssuedAt: false });
    setWarningOpen(false);
    setCountdownSec(0);
  };

  const confirmExpired = () => {
    setExpiredOpen(false);
    onExpire?.();
  };

  return (
    <>
      <ConfirmDialog
        open={warningOpen && !expiredOpen}
        title="Session expiring soon"
        message={`You will be signed out in ${formatCountdown(countdownSec)} unless you stay signed in.`}
        confirmText="Stay signed in"
        cancelText="Sign out now"
        confirmVariant="primary"
        onConfirm={staySignedIn}
        onCancel={confirmExpired}
        zIndex={200}
      />
      <ConfirmDialog
        open={expiredOpen}
        title="Session expired"
        message={expiryMessage(expiryReason)}
        confirmText="Back to login"
        showCancel={false}
        confirmVariant="primary"
        onConfirm={confirmExpired}
        onCancel={confirmExpired}
        zIndex={201}
      />
    </>
  );
}
