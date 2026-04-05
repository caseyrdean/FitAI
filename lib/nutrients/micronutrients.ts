/** Micronutrient reference values (~ adult RDA / DV mix) for dashboard % — all ~est. */

export type MicronutrientGroup = "vitamin" | "mineral";

export type MicronutrientDef = {
  key: string;
  label: string;
  unit: string;
  rda: number;
  group: MicronutrientGroup;
  get: (t: MicronutrientTotals) => number;
};

export type MicronutrientTotals = {
  vitamins: Record<string, number>;
  minerals: Record<string, number>;
  fiber_g: number;
};

export function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Macros stored on every food log row (plan quick-add and AI log). */
export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export function aggregateMacrosFromEntries(
  entries: { nutrients: unknown }[],
): MacroTotals {
  const acc: MacroTotals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };
  for (const e of entries) {
    const raw = e.nutrients;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    acc.calories += num(r.calories);
    acc.protein_g += num(r.protein_g);
    acc.carbs_g += num(r.carbs_g);
    acc.fat_g += num(r.fat_g);
    acc.fiber_g += num(r.fiber_g);
  }
  return acc;
}

type RawNutrients = {
  vitamins?: Record<string, unknown>;
  minerals?: Record<string, unknown>;
  fiber_g?: unknown;
};

function normNutrientKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Lowercase normalized field name → canonical key on MicronutrientTotals.vitamins */
const VIT_NORM_TO_CANON: Record<string, string> = {
  a_mcg: "A_mcg",
  vitamin_a_mcg: "A_mcg",
  vit_a_mcg: "A_mcg",
  c_mg: "C_mg",
  vitamin_c_mg: "C_mg",
  d_mcg: "D_mcg",
  vitamin_d_mcg: "D_mcg",
  e_mg: "E_mg",
  vitamin_e_mg: "E_mg",
  k_mcg: "K_mcg",
  vitamin_k_mcg: "K_mcg",
  b1_mg: "B1_mg",
  thiamine_mg: "B1_mg",
  b2_mg: "B2_mg",
  riboflavin_mg: "B2_mg",
  b3_mg: "B3_mg",
  niacin_mg: "B3_mg",
  b5_mg: "B5_mg",
  pantothenic_mg: "B5_mg",
  pantothenic_acid_mg: "B5_mg",
  b6_mg: "B6_mg",
  vitamin_b6_mg: "B6_mg",
  b12_mcg: "B12_mcg",
  vitamin_b12_mcg: "B12_mcg",
  biotin_mcg: "biotin_mcg",
  b7_mcg: "biotin_mcg",
  folate_mcg: "folate_mcg",
  folic_acid_mcg: "folate_mcg",
};

/** Lowercase normalized field name → canonical key on MicronutrientTotals.minerals */
const MIN_NORM_TO_CANON: Record<string, string> = {
  calcium_mg: "calcium_mg",
  ca_mg: "calcium_mg",
  iron_mg: "iron_mg",
  fe_mg: "iron_mg",
  magnesium_mg: "magnesium_mg",
  mg_mg: "magnesium_mg",
  zinc_mg: "zinc_mg",
  zn_mg: "zinc_mg",
  potassium_mg: "potassium_mg",
  k_mg: "potassium_mg",
  sodium_mg: "sodium_mg",
  na_mg: "sodium_mg",
  selenium_mcg: "selenium_mcg",
  se_mcg: "selenium_mcg",
  phosphorus_mg: "phosphorus_mg",
  p_mg: "phosphorus_mg",
};

const VIT_CANON = new Set(Object.values(VIT_NORM_TO_CANON));
const MIN_CANON = new Set(Object.values(MIN_NORM_TO_CANON));

const SKIP_ROOT_HOIST = new Set([
  "vitamins",
  "minerals",
  "nutrition",
  "micronutrients",
  "micros",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
]);

function parseObjectJson(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function nonEmptySubRecord(v: unknown): Record<string, unknown> | null {
  const r = parseObjectJson(v);
  return r && Object.keys(r).length > 0 ? r : null;
}

function normalizeNutrientRoot(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function addMicronutrientValue(into: MicronutrientTotals, key: string, val: unknown): void {
  const n = num(val);
  const norm = normNutrientKey(key);

  const vitCanon = VIT_NORM_TO_CANON[norm];
  if (vitCanon) {
    into.vitamins[vitCanon] = (into.vitamins[vitCanon] ?? 0) + n;
    return;
  }
  const minCanon = MIN_NORM_TO_CANON[norm];
  if (minCanon) {
    into.minerals[minCanon] = (into.minerals[minCanon] ?? 0) + n;
    return;
  }

  if (VIT_CANON.has(key)) {
    into.vitamins[key] = (into.vitamins[key] ?? 0) + n;
    return;
  }
  if (MIN_CANON.has(key)) {
    into.minerals[key] = (into.minerals[key] ?? 0) + n;
    return;
  }

  for (const c of Array.from(VIT_CANON)) {
    if (normNutrientKey(c) === norm) {
      into.vitamins[c] = (into.vitamins[c] ?? 0) + n;
      return;
    }
  }
  for (const c of Array.from(MIN_CANON)) {
    if (normNutrientKey(c) === norm) {
      into.minerals[c] = (into.minerals[c] ?? 0) + n;
      return;
    }
  }
}

export const MICRONUTRIENT_DEFS: MicronutrientDef[] = [
  { key: "A", label: "Vitamin A", unit: "mcg", rda: 900, group: "vitamin", get: (t) => t.vitamins.A_mcg },
  { key: "C", label: "Vitamin C", unit: "mg", rda: 90, group: "vitamin", get: (t) => t.vitamins.C_mg },
  { key: "D", label: "Vitamin D", unit: "mcg", rda: 20, group: "vitamin", get: (t) => t.vitamins.D_mcg },
  { key: "E", label: "Vitamin E", unit: "mg", rda: 15, group: "vitamin", get: (t) => t.vitamins.E_mg },
  { key: "K", label: "Vitamin K", unit: "mcg", rda: 120, group: "vitamin", get: (t) => t.vitamins.K_mcg },
  { key: "B1", label: "Thiamine (B1)", unit: "mg", rda: 1.2, group: "vitamin", get: (t) => t.vitamins.B1_mg },
  { key: "B2", label: "Riboflavin (B2)", unit: "mg", rda: 1.3, group: "vitamin", get: (t) => t.vitamins.B2_mg },
  { key: "B3", label: "Niacin (B3)", unit: "mg", rda: 16, group: "vitamin", get: (t) => t.vitamins.B3_mg },
  { key: "B5", label: "Pantothenic (B5)", unit: "mg", rda: 5, group: "vitamin", get: (t) => t.vitamins.B5_mg },
  { key: "B6", label: "Vitamin B6", unit: "mg", rda: 1.7, group: "vitamin", get: (t) => t.vitamins.B6_mg },
  { key: "B7", label: "Biotin (B7)", unit: "mcg", rda: 30, group: "vitamin", get: (t) => t.vitamins.biotin_mcg },
  { key: "B12", label: "Vitamin B12", unit: "mcg", rda: 2.4, group: "vitamin", get: (t) => t.vitamins.B12_mcg },
  { key: "folate", label: "Folate", unit: "mcg", rda: 400, group: "vitamin", get: (t) => t.vitamins.folate_mcg },
  { key: "Ca", label: "Calcium", unit: "mg", rda: 1000, group: "mineral", get: (t) => t.minerals.calcium_mg },
  { key: "Fe", label: "Iron", unit: "mg", rda: 18, group: "mineral", get: (t) => t.minerals.iron_mg },
  { key: "Mg", label: "Magnesium", unit: "mg", rda: 420, group: "mineral", get: (t) => t.minerals.magnesium_mg },
  { key: "Zn", label: "Zinc", unit: "mg", rda: 11, group: "mineral", get: (t) => t.minerals.zinc_mg },
  { key: "K_pot", label: "Potassium", unit: "mg", rda: 3400, group: "mineral", get: (t) => t.minerals.potassium_mg },
  { key: "Na", label: "Sodium", unit: "mg", rda: 2300, group: "mineral", get: (t) => t.minerals.sodium_mg },
  { key: "Se", label: "Selenium", unit: "mcg", rda: 55, group: "mineral", get: (t) => t.minerals.selenium_mcg },
  { key: "P", label: "Phosphorus", unit: "mg", rda: 700, group: "mineral", get: (t) => t.minerals.phosphorus_mg },
  { key: "fiber", label: "Fiber", unit: "g", rda: 28, group: "mineral", get: (t) => t.fiber_g },
];

export function emptyTotals(): MicronutrientTotals {
  return { vitamins: {}, minerals: {}, fiber_g: 0 };
}

function mergeNutritionSubtree(into: MicronutrientTotals, sub: Record<string, unknown>): void {
  const vit = nonEmptySubRecord(sub.vitamins);
  if (vit) {
    for (const [k, val] of Object.entries(vit)) {
      addMicronutrientValue(into, k, val);
    }
  }
  const min = nonEmptySubRecord(sub.minerals);
  if (min) {
    for (const [k, val] of Object.entries(min)) {
      addMicronutrientValue(into, k, val);
    }
  }
  if (sub.fiber_g != null) into.fiber_g += num(sub.fiber_g);
}

export function mergeNutrients(raw: unknown, into: MicronutrientTotals): void {
  const o = normalizeNutrientRoot(raw);
  if (!o) return;

  const vitSub = nonEmptySubRecord((o as RawNutrients).vitamins);
  if (vitSub) {
    for (const [k, val] of Object.entries(vitSub)) {
      addMicronutrientValue(into, k, val);
    }
  }

  const minSub = nonEmptySubRecord((o as RawNutrients).minerals);
  if (minSub) {
    for (const [k, val] of Object.entries(minSub)) {
      addMicronutrientValue(into, k, val);
    }
  }

  into.fiber_g += num((o as RawNutrients).fiber_g);

  // Nested shapes some tools / plans use when top-level vitamins/minerals are absent
  if (!vitSub && !minSub) {
    for (const wrapKey of ["nutrition", "micronutrients", "micros"] as const) {
      const wrapped = nonEmptySubRecord(o[wrapKey]);
      if (wrapped) {
        mergeNutritionSubtree(into, wrapped);
        break;
      }
    }
  }

  for (const [k, val] of Object.entries(o)) {
    if (SKIP_ROOT_HOIST.has(normNutrientKey(k))) continue;
    addMicronutrientValue(into, k, val);
  }
}

export function aggregateFromEntries(
  entries: { nutrients: unknown }[],
): MicronutrientTotals {
  const acc = emptyTotals();
  for (const e of entries) mergeNutrients(e.nutrients, acc);
  return acc;
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Food log `loggedAt` from JSON (string or rare number). Invalid → "" so filters skip safely. */
export function localDateKeyFromLoggedAt(loggedAt: unknown): string {
  if (loggedAt == null || loggedAt === "") return "";
  if (typeof loggedAt === "object" && loggedAt !== null && "toISOString" in loggedAt) {
    try {
      return localDateKeyFromLoggedAt((loggedAt as { toISOString: () => string }).toISOString());
    } catch {
      return "";
    }
  }
  const s = typeof loggedAt === "string" ? loggedAt.trim() : String(loggedAt);
  // Plain calendar date: do not parse as UTC midnight (would shift local day in many TZs).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar "today" (YYYY-MM-DD). Use on the client — not during SSR if TZ must match the user. */
export function todayLocalDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type IntakeRow = {
  key: string;
  label: string;
  unit: string;
  intake: number;
  target: number;
  pct: number;
  group: MicronutrientGroup;
};

/** `rdaDayMultiplier`: 1 = daily ref., 7 = sum targets for a 7-day week. */
export function rowsFromTotalsScaled(
  totals: MicronutrientTotals,
  rdaDayMultiplier: number,
): IntakeRow[] {
  const mult = Math.max(1, rdaDayMultiplier);
  return MICRONUTRIENT_DEFS.map((def) => {
    const intake = num(def.get(totals));
    const target = def.rda * mult;
    const pct = target > 0 ? (intake / target) * 100 : 0;
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      intake,
      target,
      pct: Math.round(pct * 10) / 10,
      group: def.group,
    };
  });
}

export function rowsFromTotals(totals: MicronutrientTotals): IntakeRow[] {
  return rowsFromTotalsScaled(totals, 1);
}

/** Mean % of daily reference across all defs in a group (0 if none). */
export function meanPercentForGroup(rows: IntakeRow[], group: MicronutrientGroup): number {
  const subset = rows.filter((r) => r.group === group);
  if (subset.length === 0) return 0;
  const sum = subset.reduce((s, r) => s + r.pct, 0);
  return Math.round((sum / subset.length) * 10) / 10;
}

/** Last `n` calendar days ending today, oldest first (YYYY-MM-DD, local). */
export function lastNDayKeys(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

export type TrendPoint = {
  dateKey: string;
  label: string;
  vitaminsPct: number;
  mineralsPct: number;
  targetPct: number;
};

export function buildTrendSeriesForDateKeys(
  entries: { loggedAt: string; nutrients: unknown }[],
  dateKeys: string[],
): TrendPoint[] {
  return dateKeys.map((dateKey) => {
    const dayEntries = entries.filter(
      (e) => localDateKeyFromLoggedAt(e.loggedAt) === dateKey,
    );
    const totals = aggregateFromEntries(dayEntries);
    const rows = rowsFromTotals(totals);
    const d = new Date(dateKey + "T12:00:00");
    return {
      dateKey,
      label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      vitaminsPct: meanPercentForGroup(rows, "vitamin"),
      mineralsPct: meanPercentForGroup(rows, "mineral"),
      targetPct: 100,
    };
  });
}

export function buildTrendSeries(
  entries: { loggedAt: string; nutrients: unknown }[],
  days: number,
): TrendPoint[] {
  return buildTrendSeriesForDateKeys(entries, lastNDayKeys(days));
}
