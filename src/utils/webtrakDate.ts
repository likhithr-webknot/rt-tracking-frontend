/** Webtrak {@link UserCreateDTO} expects dates as `dd-MM-yyyy`. */
export function toWebtrakDate(value: string | null | undefined): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return s;
}

export function todayWebtrakDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
