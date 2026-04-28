/** Merge dose-mapped micronutrients into an AI estimate; keep AI macros unless overridden later. */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function mergeMappedSupplementMicronutrients(
  estimated: Record<string, unknown>,
  mapped: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...estimated };

  const mv = mapped.vitamins;
  if (isPlainObject(mv)) {
    const ev = isPlainObject(out.vitamins)
      ? { ...(out.vitamins as Record<string, unknown>) }
      : {};
    for (const [k, v] of Object.entries(mv)) {
      if (typeof v === "number" && Number.isFinite(v)) ev[k] = v;
    }
    out.vitamins = ev;
  }

  const mm = mapped.minerals;
  if (isPlainObject(mm)) {
    const em = isPlainObject(out.minerals)
      ? { ...(out.minerals as Record<string, unknown>) }
      : {};
    for (const [k, v] of Object.entries(mm)) {
      if (typeof v === "number" && Number.isFinite(v)) em[k] = v;
    }
    out.minerals = em;
  }

  const mf = mapped.fiber_g;
  if (typeof mf === "number" && Number.isFinite(mf) && mf > 0) {
    out.fiber_g = mf;
  }

  return out;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Per-serving sanity caps for a single supplement log row. */
export function clampSupplementServing(n: Record<string, unknown>): Record<string, unknown> {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  return {
    ...n,
    calories: clamp(num(n.calories), 900),
    protein_g: clamp(num(n.protein_g), 200),
    carbs_g: clamp(num(n.carbs_g), 200),
    fat_g: clamp(num(n.fat_g), 200),
    fiber_g: clamp(num(n.fiber_g), 120),
  };
}

export type SupplementMacroOverrides = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export function applySupplementMacroOverrides(
  base: Record<string, unknown>,
  over: SupplementMacroOverrides,
): Record<string, unknown> {
  const o = { ...base };
  if (over.calories != null && Number.isFinite(over.calories)) o.calories = over.calories;
  if (over.protein_g != null && Number.isFinite(over.protein_g)) o.protein_g = over.protein_g;
  if (over.carbs_g != null && Number.isFinite(over.carbs_g)) o.carbs_g = over.carbs_g;
  if (over.fat_g != null && Number.isFinite(over.fat_g)) o.fat_g = over.fat_g;
  return o;
}

export function hasAnyMacroOverride(over: SupplementMacroOverrides): boolean {
  return (
    over.calories != null ||
    over.protein_g != null ||
    over.carbs_g != null ||
    over.fat_g != null
  );
}

/**
 * After re-estimating a supplement from a new description, AI JSON is often sparse
 * (e.g. omits `minerals.creatine_g`). Merge so prior micronutrients stay unless the
 * model supplies a finite value for that key.
 */
export function mergeSupplementNutrientsAfterAiReestimate(
  previous: Record<string, unknown>,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parsed };

  for (const macro of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const) {
    const pv = parsed[macro];
    if (typeof pv !== "number" || !Number.isFinite(pv)) {
      const prev = previous[macro];
      if (typeof prev === "number" && Number.isFinite(prev)) out[macro] = prev;
    }
  }

  const mergeSub = (key: "vitamins" | "minerals") => {
    const prevSub = isPlainObject(previous[key])
      ? (previous[key] as Record<string, unknown>)
      : {};
    const nextSub = isPlainObject(parsed[key])
      ? (parsed[key] as Record<string, unknown>)
      : {};
    const merged: Record<string, unknown> = { ...prevSub };
    for (const [k, v] of Object.entries(nextSub)) {
      if (typeof v === "number" && Number.isFinite(v)) merged[k] = v;
    }
    if (Object.keys(merged).length > 0) out[key] = merged;
  };

  mergeSub("vitamins");
  mergeSub("minerals");
  return out;
}
