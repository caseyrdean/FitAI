/**
 * Single source of truth: weeks start Sunday 00:00 local time.
 * All plan weekStart values and UI labels use local calendar dates (not UTC date drift from ISO strings).
 */

export function toLocalDateOnly(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d) : new Date(d.getTime());
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/** Sunday 00:00 local for the calendar week that contains `ref`. */
export function startOfLocalWeekSunday(ref: Date = new Date()): Date {
  const day = toLocalDateOnly(ref);
  day.setDate(day.getDate() - day.getDay());
  day.setHours(0, 0, 0, 0);
  return day;
}

export function endExclusiveLocalWeek(weekStartLocal: Date): Date {
  return new Date(
    weekStartLocal.getFullYear(),
    weekStartLocal.getMonth(),
    weekStartLocal.getDate() + 7,
  );
}

/** True if `day` falls in [planWeekStart, planWeekStart + 7 days) in the local calendar. */
export function localDayInPlanWeek(day: Date | string, planWeekStart: Date | string): boolean {
  const d = toLocalDateOnly(typeof day === "string" ? new Date(day) : day);
  const anchor = toLocalDateOnly(planWeekStart);
  const end = endExclusiveLocalWeek(anchor);
  return d.getTime() >= anchor.getTime() && d.getTime() < end.getTime();
}

/**
 * Parse model weekStart (YYYY-MM-DD or ISO). Interpret YYYY-MM-DD as a local calendar date,
 * then snap to the Sunday that starts that week (same convention as the rest of the app).
 */
export function parseWeekStartToLocalSunday(input: string, referenceNow: Date = new Date()): Date {
  const trimmed = input.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const day = Number(ymd[3]);
    const date = new Date(y, m - 1, day);
    if (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === day
    ) {
      return startOfLocalWeekSunday(date);
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return startOfLocalWeekSunday(toLocalDateOnly(parsed));
  }
  return startOfLocalWeekSunday(referenceNow);
}

/** e.g. "Sun, Mar 29, 2026 – Sat, Apr 4, 2026" */
export function formatLocalWeekRangeLabel(weekStart: Date | string): string {
  const s = toLocalDateOnly(weekStart);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${s.toLocaleDateString(undefined, o)} – ${e.toLocaleDateString(undefined, o)}`;
}

/**
 * Session log timestamp: local calendar day for plan day index, stored at noon local
 * (stable through DST vs midnight).
 */
export function localPlanDayNoonIso(weekStart: Date | string, dayIndex: number): string {
  const anchor = toLocalDateOnly(weekStart);
  const d = new Date(anchor);
  d.setDate(anchor.getDate() + dayIndex);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/** 0–6 index from plan week start (Sunday = 0) to today; clamped. */
export function planDayIndexFromWeekStart(weekStartIso: string, ref: Date = new Date()): number {
  const weekStart = toLocalDateOnly(weekStartIso);
  const today = toLocalDateOnly(ref);
  const diff = Math.round(
    (today.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.min(6, Math.max(0, diff));
}

/** YYYY-MM-DD for each day in the local Sunday–Saturday week that contains `ref`. */
export function currentLocalWeekDateKeys(ref: Date = new Date()): string[] {
  const ws = startOfLocalWeekSunday(ref);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    keys.push(`${y}-${m}-${day}`);
  }
  return keys;
}

/** Shared window for food-log GET so dashboard, meals, nutrients, and list stay in sync. */
export const FOOD_LOG_SYNC_DAYS = 30;
