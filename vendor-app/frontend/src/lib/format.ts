const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-01-05" -> "05-Jan-2026". Parsed by hand to avoid timezone shifts. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** "120000.00", "INR" -> "₹1,20,000.00" (Indian digit grouping). */
export function formatCost(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`; // unknown currency code
  }
}

/** Today's date in the user's local timezone as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type RenewalStatus = "overdue" | "due-soon" | "ok";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from today until the given date; negative once it has passed. */
export function daysUntil(iso: string, today = todayIso()): number {
  return Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);
}

/** "Due today", "Due in 5 days", "3 days overdue". */
export function relativeDays(iso: string, today = todayIso()): string {
  const days = daysUntil(iso, today);
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  return days > 0 ? `Due in ${plural(days)}` : `${plural(-days)} overdue`;
}

/** "Acme Cloud Services" -> "AC". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Past renewal -> overdue; renewal within the next 30 days (inclusive) -> due-soon. */
export function renewalStatus(renewalIso: string, today = todayIso()): RenewalStatus {
  const days = daysUntil(renewalIso, today);
  if (days < 0) return "overdue";
  if (days <= 30) return "due-soon";
  return "ok";
}
