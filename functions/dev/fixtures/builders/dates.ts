import { Timestamp } from "firebase-admin/firestore";

/**
 * A `YYYY-MM-DD` day at local midnight, the way the web stores invoice dates
 * (it builds them with `new Date(year, month, day)`).
 */
export function localDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(year, month - 1, date);
}

export function timestamp(day: string) {
  return Timestamp.fromDate(localDate(day));
}

export function todayDate() {
  const date = new Date();

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
