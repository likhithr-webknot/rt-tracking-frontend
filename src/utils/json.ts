import { z } from "zod";
import type { ZodTypeAny } from "zod";

const JsonUnknownSchema = z.unknown();

export function safeJsonParse(raw: unknown, schema?: ZodTypeAny, fallback: unknown = null): unknown {
  const zodSchema = schema ?? JsonUnknownSchema;
  const text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    const result = zodSchema.safeParse(parsed);
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}
