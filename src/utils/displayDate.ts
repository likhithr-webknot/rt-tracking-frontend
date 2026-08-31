// @ts-nocheck

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse ISO, dd/mm/yyyy, dd-MMM-yyyy, and locale date strings into a Date. */
export function parseFlexibleDate(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text === "—" || text === "-") return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900) return d;
  }

  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900) return d;
  }

  const dmyDash = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dmyDash) {
    const mon = MONTHS[dmyDash[2].toLowerCase()];
    if (mon != null) {
      const d = new Date(Number(dmyDash[3]), mon, Number(dmyDash[1]));
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900) return d;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) return parsed;

  return null;
}

/** Canonical storage form yyyy-mm-dd when parseable. */
export function toIsoDateString(raw) {
  const d = parseFlexibleDate(raw);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Display as "Jan 12, 2024" everywhere in the UI. */
export function formatDisplayDate(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text === "—" || text === "-") return "—";
  const d = parseFlexibleDate(text);
  if (!d) return text;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
