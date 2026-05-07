/**
 * date-utils.ts
 * All date helpers are locked to America/Chicago (US Central).
 * Use these instead of bare `new Date()` / `.toISOString()` calls wherever
 * dates are user-facing or stored as local dates (YYYY-MM-DD).
 */

export const TZ = "America/Chicago";

/** Returns today's date as "YYYY-MM-DD" in Central time. */
export function todayCentral(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA gives YYYY-MM-DD
}

/**
 * Returns the current date/time as a JS Date whose local fields
 * reflect Central time. Useful for date range math (getFullYear, getMonth…).
 */
export function nowCentral(): Date {
  const str = new Date().toLocaleString("en-US", { timeZone: TZ });
  return new Date(str);
}

/** Format a date string or Date for display, always in Central time. */
export function formatDateCentral(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", { timeZone: TZ, ...options });
}

/** Format a datetime string or Date for display, always in Central time. */
export function formatDateTimeCentral(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { timeZone: TZ, ...options });
}
