// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { buildApiUrl, ensureCsrfCookie, readError, withCsrfHeaders } from "./http";

function normalizeAuthPayload(raw) {
  if (!raw || typeof raw !== "object") return {};
  const inner = raw?.data != null && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
  return inner;
}

/**
 * Public auth endpoints: Spring often returns 401 when a stale session cookie or
 * Authorization is sent to a permitAll route. Try without cookies first, then with
 * session + CSRF.
 */
const PUBLIC_AUTH_CREDENTIAL_MODES = [
  { credentials: "omit", useCsrf: false },
  { credentials: "include", useCsrf: true },
];

/**
 * Try email + password login against common Spring-style routes and body shapes.
 * Backend must verify password (e.g. BCrypt) and return a JWT or session.
 */
export async function loginWithEmailPassword(email, password, { signal } = {} as ApiOptions) {
  const emailTrim = String(email ?? "").trim().toLowerCase();
  const pass = String(password ?? "");
  if (!emailTrim || !pass) throw new Error("Email and password are required.");

  const paths = ["/api/v1/auth/login"];
  const bodyVariants = [
    { email: emailTrim, password: pass },
    { username: emailTrim, password: pass },
  ];

  // Always try session cookies first so httpOnly accessToken is set for API calls.
  const credentialModes = [
    { credentials: "include" as RequestCredentials, useCsrf: true },
    { credentials: "omit" as RequestCredentials, useCsrf: false },
  ];

  let lastErr = null;

  for (const path of paths) {
    for (const { credentials, useCsrf } of credentialModes) {
      for (const payload of bodyVariants) {
        if (useCsrf) {
          await ensureCsrfCookie({ signal }).catch(() => {});
        }
        const headers = useCsrf
          ? withCsrfHeaders({ "Content-Type": "application/json" })
          : { "Content-Type": "application/json" };

        let res;
        try {
          res = await fetch(buildApiUrl(path), {
            method: "POST",
            credentials,
            headers,
            body: JSON.stringify(payload),
            signal,
          });
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          lastErr = e;
          continue;
        }

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          return normalizeAuthPayload(json);
        }

        const msg = await readError(res);
        lastErr = Object.assign(new Error(msg || "Sign-in failed."), { status: res.status });

        if (res.status === 401 || res.status === 403 || res.status === 400) {
          const hint =
            /invalid email or password/i.test(msg) && import.meta.env?.DEV
              ? " Check qa.*@webknot.in / WebknotQA#Test1 or seed QA users (SPRING_PROFILES_ACTIVE=dev)."
              : "";
          const err = new Error((msg || "Invalid email or password.") + hint);
          err.status = res.status;
          throw err;
        }
        if (res.status === 404 || res.status === 405) continue;
        if (res.status >= 400 && res.status < 500) throw lastErr;
      }
    }
  }

  const err = new Error(
    lastErr?.message ||
      "Cannot reach login API. Start Webtrak on :8080 (dev profile) and npm run dev for the proxy."
  );
  err.status = lastErr?.status || 502;
  throw err;
}

/**
 * Request a password-reset email (contains a one-time code or link).
 * Uses anonymous-friendly fetch strategies to avoid 401 from stale sessions.
 */
export async function requestPasswordReset(email, { signal } = {} as ApiOptions) {
  const emailTrim = String(email ?? "").trim();
  if (!emailTrim) throw new Error("Email is required.");

  const paths = [
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/password/forgot",
    "/api/v1/password-reset/request",
    "/api/v1/auth/password-reset/request",
    "/api/v1/public/auth/forgot-password",
    "/api/v1/public/forgot-password",
    "/api/v1/forgot-password",
  ];
  const body = JSON.stringify({ email: emailTrim });

  let last404 = false;
  let lastErr = null;

  pathLoop: for (const path of paths) {
    for (const { credentials, useCsrf } of PUBLIC_AUTH_CREDENTIAL_MODES) {
      if (useCsrf) {
        await ensureCsrfCookie({ signal }).catch(() => {});
      }
      const headers = useCsrf
        ? withCsrfHeaders({ "Content-Type": "application/json" })
        : { "Content-Type": "application/json" };

      let res;
      try {
        res = await fetch(buildApiUrl(path), {
          method: "POST",
          credentials,
          headers,
          body,
          signal,
        });
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        lastErr = e;
        continue;
      }

      if (res.ok) return true;

      if (res.status === 404 || res.status === 405) {
        last404 = true;
        lastErr = Object.assign(new Error(await readError(res)), { status: res.status });
        continue pathLoop;
      }

      if (res.status === 401 || res.status === 403) {
        lastErr = Object.assign(new Error(await readError(res)), { status: res.status });
        continue;
      }

      if (res.status >= 400 && res.status < 500) {
        const msg = await readError(res);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }

      const msg = await readError(res);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
  }

  if (last404) {
    const err = new Error(
      "Password reset request endpoint not found (404). Add a public POST route (e.g. /api/v1/auth/forgot-password) accepting JSON { \"email\" }."
    );
    err.status = 404;
    throw err;
  }

  const err = new Error(
    lastErr?.message ||
      "Password reset failed (401/403). Configure the API to allow unauthenticated POST for forgot-password, or allow anonymous access without invalid session rejection."
  );
  err.status = lastErr?.status || 401;
  throw err;
}

/**
 * Complete reset after user received code by email: set new password.
 */
export async function resetPasswordWithCode({ email, code, newPassword }, { signal } = {} as ApiOptions) {
  const emailTrim = String(email ?? "").trim();
  const codeTrim = String(code ?? "").trim();
  const pw = String(newPassword ?? "");
  if (!emailTrim || !codeTrim || !pw) throw new Error("Email, code, and new password are required.");

  const paths = [
    "/api/v1/auth/reset-password",
    "/api/v1/auth/password/reset",
    "/api/v1/password-reset/confirm",
    "/api/v1/auth/password-reset/confirm",
    "/api/v1/public/auth/reset-password",
    "/api/v1/public/reset-password",
  ];
  const bodies = [
    JSON.stringify({ email: emailTrim, code: codeTrim, newPassword: pw }),
    JSON.stringify({ email: emailTrim, token: codeTrim, newPassword: pw }),
    JSON.stringify({ email: emailTrim, otp: codeTrim, password: pw, newPassword: pw }),
  ];

  let last404 = false;
  let lastErr = null;

  pathLoop: for (const path of paths) {
    for (const { credentials, useCsrf } of PUBLIC_AUTH_CREDENTIAL_MODES) {
      for (const body of bodies) {
        if (useCsrf) {
          await ensureCsrfCookie({ signal }).catch(() => {});
        }
        const headers = useCsrf
          ? withCsrfHeaders({ "Content-Type": "application/json" })
          : { "Content-Type": "application/json" };

        let res;
        try {
          res = await fetch(buildApiUrl(path), {
            method: "POST",
            credentials,
            headers,
            body,
            signal,
          });
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          lastErr = e;
          continue;
        }

        if (res.ok) return res.json().catch(() => ({}));

        if (res.status === 404 || res.status === 405) {
          last404 = true;
          lastErr = Object.assign(new Error(await readError(res)), { status: res.status });
          continue pathLoop;
        }

        if (res.status === 401 || res.status === 403) {
          lastErr = Object.assign(new Error(await readError(res)), { status: res.status });
          continue;
        }

        if (res.status === 400 || res.status === 422) {
          const msg = await readError(res);
          const err = new Error(msg);
          err.status = res.status;
          throw err;
        }

        const msg = await readError(res);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
    }
  }

  if (last404) {
    const err = new Error(
      "Password reset confirm endpoint not found (404). Add POST /api/v1/auth/reset-password accepting JSON { \"email\", \"code\", \"newPassword\" }."
    );
    err.status = 404;
    throw err;
  }

  const err = new Error(
    lastErr?.message ||
      "Could not reset password. Ensure the API exposes a public reset-password route and accepts the JSON field names above."
  );
  err.status = lastErr?.status || 401;
  throw err;
}
