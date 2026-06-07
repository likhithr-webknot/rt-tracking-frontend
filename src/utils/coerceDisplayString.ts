/** Turn API/profile values (string, number, or nested DTO) into a safe display string. */
export function coerceDisplayString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const s = value.trim();
    return s === "[object Object]" ? "" : s;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of [
      "bandName",
      "name",
      "code",
      "bandCode",
      "label",
      "value",
      "designation",
      "title",
      "displayName",
      "department",
      "stream",
    ]) {
      const nested = coerceDisplayString(obj[key]);
      if (nested) return nested;
    }
    return "";
  }
  const s = String(value).trim();
  return s === "[object Object]" ? "" : s;
}

export function firstDisplayString(...values: unknown[]): string {
  for (const value of values) {
    const s = coerceDisplayString(value);
    if (s) return s;
  }
  return "";
}
