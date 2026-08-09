/**
 * Spring/Jackson often expects JPA relation fields (e.g. `Band`, `Stream`) as a
 * nested object, not a bare string like "B7L".
 */
export function toNestedEntityRef(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return { code: s, name: s };
}
