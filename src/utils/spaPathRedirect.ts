/** Recover client routes when edge nginx mistakenly proxies SPA paths to the API. */
export function consumeSpaPathRedirect() {
  if (typeof window === "undefined") return "";

  const win = window;
  const preset = String(win.__RT_SPA_PATH__ || "").trim();
  if (preset) {
    delete win.__RT_SPA_PATH__;
    return preset.startsWith("/") ? preset : `/${preset}`;
  }

  const url = new URL(window.location.href);
  const raw = String(url.searchParams.get("spa_path") || url.searchParams.get("redirect") || "").trim();
  if (!raw) return "";

  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = raw;
  }
  if (!path.startsWith("/")) path = `/${path}`;

  url.searchParams.delete("spa_path");
  url.searchParams.delete("redirect");
  const search = url.searchParams.toString();
  const next = url.pathname + (search ? `?${search}` : "") + url.hash;
  window.history.replaceState({}, "", next || "/");
  return path;
}
