/**
 * Read a single planned meal from stored meal plan JSON (same layout as generate_meal_plan).
 * Legacy helper (meal-plan JSON lookup). Food log POST now always estimates from description text.
 */

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeNumericRecord(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function normaliseDayMeals(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()] = v;
  }
  return out;
}

function resolveDayMeals(
  mealsRoot: Record<string, unknown>,
  day: string,
): Record<string, unknown> {
  if (isRecord(mealsRoot[day])) return normaliseDayMeals(mealsRoot[day] as Record<string, unknown>);
  const lower = day.toLowerCase();
  for (const key of Object.keys(mealsRoot)) {
    if (key.toLowerCase() === lower && isRecord(mealsRoot[key])) {
      return normaliseDayMeals(mealsRoot[key] as Record<string, unknown>);
    }
  }
  return {};
}

function mealsObjectFromPlanRoot(root: Record<string, unknown>): Record<string, unknown> | null {
  if (WEEK_DAYS.some((d) => isRecord(root[d]))) return root;
  const inner = root.meals;
  if (isRecord(inner) && WEEK_DAYS.some((d) => isRecord(inner[d]))) return inner;
  return null;
}

function normaliseMealTypeKey(mealType: string): string {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1).toLowerCase();
}

/** Vitamins / minerals / fiber from a meal object (any shape Atlas may emit). */
export function extractMicronutrientsFromMealRaw(raw: unknown): {
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
  fiber_g?: number;
} {
  if (!isRecord(raw)) return {};
  const r = raw;

  let vitamins = sanitizeNumericRecord(r.vitamins);
  let minerals = sanitizeNumericRecord(r.minerals);
  let fiber_g =
    typeof r.fiber_g === "number" && Number.isFinite(r.fiber_g) ? r.fiber_g : undefined;

  const mergeWrap = (w: unknown) => {
    if (!isRecord(w)) return;
    vitamins = vitamins ?? sanitizeNumericRecord(w.vitamins);
    minerals = minerals ?? sanitizeNumericRecord(w.minerals);
    if (fiber_g == null && typeof w.fiber_g === "number" && Number.isFinite(w.fiber_g)) {
      fiber_g = w.fiber_g;
    }
  };

  mergeWrap(r.nutrition);
  mergeWrap(r.micronutrients);
  mergeWrap(r.micros);

  return {
    ...(vitamins ? { vitamins } : {}),
    ...(minerals ? { minerals } : {}),
    ...(fiber_g != null ? { fiber_g } : {}),
  };
}

/**
 * Find raw meal object for `dayName` (e.g. Sunday) and `mealType` (e.g. Breakfast).
 */
export function findMealRawInPlanJson(
  meals: unknown,
  dayName: string,
  mealType: string,
): Record<string, unknown> | null {
  let root: unknown = meals;
  if (typeof root === "string") {
    try {
      root = JSON.parse(root) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(root)) return null;
  const mealsRoot = mealsObjectFromPlanRoot(root);
  if (!mealsRoot) return null;

  const day =
    WEEK_DAYS.find((d) => d.toLowerCase() === dayName.trim().toLowerCase()) ?? dayName;
  const dayMeals = resolveDayMeals(mealsRoot, day);
  const mt = normaliseMealTypeKey(mealType);
  let mealRaw = dayMeals[mt];
  if (mealRaw == null) {
    const lower = mealType.toLowerCase();
    for (const k of Object.keys(dayMeals)) {
      if (k.toLowerCase() === lower) {
        mealRaw = dayMeals[k];
        break;
      }
    }
  }
  if (mealRaw == null || typeof mealRaw === "string") return null;
  if (!isRecord(mealRaw)) return null;
  return mealRaw;
}

export function mergeQuickAddNutrientsWithPlanMeal(
  base: Record<string, unknown>,
  fromMeal: { vitamins?: Record<string, number>; minerals?: Record<string, number>; fiber_g?: number },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  const baseV = sanitizeNumericRecord(out.vitamins);
  const baseM = sanitizeNumericRecord(out.minerals);
  if ((!baseV || Object.keys(baseV).length === 0) && fromMeal.vitamins) {
    out.vitamins = fromMeal.vitamins;
  }
  if ((!baseM || Object.keys(baseM).length === 0) && fromMeal.minerals) {
    out.minerals = fromMeal.minerals;
  }
  if (
    (out.fiber_g == null || (typeof out.fiber_g === "number" && !Number.isFinite(out.fiber_g))) &&
    fromMeal.fiber_g != null
  ) {
    out.fiber_g = fromMeal.fiber_g;
  }
  return out;
}
