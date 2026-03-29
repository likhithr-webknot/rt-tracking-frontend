import { z } from "zod";

const JsonUnknownSchema = z.unknown();

export function safeJsonParse(raw, schema = JsonUnknownSchema, fallback = null) {
  const text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}
