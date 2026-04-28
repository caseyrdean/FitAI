/**
 * Map a generic supplement kind + dose to food-log nutrient JSON (micronutrients only; macros zero).
 * Returns null when unrecognized — caller may fall back to AI estimation.
 */

function normUnit(u: string): string {
  return u.trim().toLowerCase().replace(/µ/g, "u");
}

type VitMin = { vitamins: Record<string, number>; minerals: Record<string, number> };

function merge(out: VitMin, vit?: Record<string, number>, min?: Record<string, number>) {
  if (vit) for (const [k, v] of Object.entries(vit)) {
    if (Number.isFinite(v)) out.vitamins[k] = (out.vitamins[k] ?? 0) + v;
  }
  if (min) for (const [k, v] of Object.entries(min)) {
    if (Number.isFinite(v)) out.minerals[k] = (out.minerals[k] ?? 0) + v;
  }
}

/** Vitamin D3/D2: IU → mcg (cholecalciferol). */
function vitaminDToMcg(amount: number, unit: string): number | null {
  const u = normUnit(unit);
  if (u === "iu") return amount * 0.025;
  if (u === "mcg" || u === "ug") return amount;
  if (u === "mg") return amount * 1000;
  return null;
}

/** Vitamin A as retinol acetate / palmitate often labeled IU; use RAE mcg approx from IU (retinol). */
function vitaminAToMcg(amount: number, unit: string): number | null {
  const u = normUnit(unit);
  if (u === "iu") return amount * 0.3;
  if (u === "mcg" || u === "ug") return amount;
  if (u === "mg") return amount * 1000;
  return null;
}

/** Vitamin E as alpha-tocopherol: IU → mg (synthetic dl-alpha ~0.45 mg/IU varies; use common 0.67). */
function vitaminEToMg(amount: number, unit: string): number | null {
  const u = normUnit(unit);
  if (u === "iu") return amount * 0.67;
  if (u === "mg") return amount;
  if (u === "mcg" || u === "ug") return amount / 1000;
  return null;
}

export function buildSupplementNutrients(
  kindRaw: string,
  amount: number,
  unitRaw: string,
): Record<string, unknown> | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kind = kindRaw.toLowerCase().trim();
  const unit = normUnit(unitRaw);

  const vm: VitMin = { vitamins: {}, minerals: {} };

  if (
    /vitamin\s*a\b|retinol|beta[\s-]?carotene|carotene/.test(kind) &&
    !/vitamin\s*d/.test(kind)
  ) {
    const mcg = vitaminAToMcg(amount, unit);
    if (mcg == null) return null;
    merge(vm, { A_mcg: mcg });
  } else if (/vitamin\s*c\b|ascorbic/.test(kind)) {
    if (unit === "mg") merge(vm, { C_mg: amount });
    else if (unit === "g") merge(vm, { C_mg: amount * 1000 });
    else return null;
  } else if (
    /vitamin\s*d\b|cholecalciferol|ergocalciferol|\bd3\b|\bd2\b/.test(kind)
  ) {
    const mcg = vitaminDToMcg(amount, unit);
    if (mcg == null) return null;
    merge(vm, { D_mcg: mcg });
  } else if (/vitamin\s*e\b|tocopherol/.test(kind)) {
    const mg = vitaminEToMg(amount, unit);
    if (mg == null) return null;
    merge(vm, { E_mg: mg });
  } else if (/vitamin\s*k\b|phylloquinone|mk-7|menaquinone|k2\b/.test(kind)) {
    if (unit === "mcg" || unit === "ug") merge(vm, { K_mcg: amount });
    else if (unit === "mg") merge(vm, { K_mcg: amount * 1000 });
    else if (unit === "iu") merge(vm, { K_mcg: amount * 0.25 });
    else return null;
  } else if (/thiamine|vitamin\s*b1\b|\bb1\b/.test(kind)) {
    if (unit === "mg") merge(vm, { B1_mg: amount });
    else return null;
  } else if (/riboflavin|vitamin\s*b2\b|\bb2\b/.test(kind)) {
    if (unit === "mg") merge(vm, { B2_mg: amount });
    else return null;
  } else if (/niacin|vitamin\s*b3\b|nicotinic|\bb3\b/.test(kind)) {
    if (unit === "mg") merge(vm, { B3_mg: amount });
    else return null;
  } else if (/pantothen|vitamin\s*b5\b|\bb5\b/.test(kind)) {
    if (unit === "mg") merge(vm, { B5_mg: amount });
    else return null;
  } else if (/pyridox|vitamin\s*b6\b|\bb6\b/.test(kind)) {
    if (unit === "mg") merge(vm, { B6_mg: amount });
    else return null;
  } else if (/b12|cobalamin|cyanocobalamin|methylcobalamin/.test(kind)) {
    if (unit === "mcg" || unit === "ug") merge(vm, { B12_mcg: amount });
    else if (unit === "mg") merge(vm, { B12_mcg: amount * 1000 });
    else return null;
  } else if (/biotin|vitamin\s*b7\b/.test(kind)) {
    if (unit === "mcg" || unit === "ug") merge(vm, { biotin_mcg: amount });
    else if (unit === "mg") merge(vm, { biotin_mcg: amount * 1000 });
    else return null;
  } else if (/folate|folic|methylfolate|5-mthf/.test(kind)) {
    if (unit === "mcg" || unit === "ug") merge(vm, { folate_mcg: amount });
    else if (unit === "mg") merge(vm, { folate_mcg: amount * 1000 });
    else if (unit === "dfes" || unit === "dfe") merge(vm, { folate_mcg: amount });
    else return null;
  } else if (/calcium(\s+carbonate|\s+citrate)?\b/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { calcium_mg: amount });
    else if (unit === "g") merge(vm, undefined, { calcium_mg: amount * 1000 });
    else return null;
  } else if (/iron(\s+bisglycinate|\s+sulfate|\s+fumarate)?\b|ferrous/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { iron_mg: amount });
    else return null;
  } else if (/magnesium(\s+citrate|\s+glycinate|\s+oxide)?\b/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { magnesium_mg: amount });
    else if (unit === "g") merge(vm, undefined, { magnesium_mg: amount * 1000 });
    else return null;
  } else if (/zinc(\s+picolinate|\s+citrate|\s+gluconate)?\b/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { zinc_mg: amount });
    else return null;
  } else if (/potassium(\s+chloride|\s+citrate)?\b/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { potassium_mg: amount });
    else if (unit === "g") merge(vm, undefined, { potassium_mg: amount * 1000 });
    else return null;
  } else if (/selenium|selenomethionine/.test(kind)) {
    if (unit === "mcg" || unit === "ug") merge(vm, undefined, { selenium_mcg: amount });
    else if (unit === "mg") merge(vm, undefined, { selenium_mcg: amount * 1000 });
    else return null;
  } else if (/phosphorus/.test(kind)) {
    if (unit === "mg") merge(vm, undefined, { phosphorus_mg: amount });
    else return null;
  } else if (/creatine/.test(kind)) {
    if (unit === "g") merge(vm, undefined, { creatine_g: amount });
    else if (unit === "mg") merge(vm, undefined, { creatine_g: amount / 1000 });
    else return null;
  } else {
    return null;
  }

  if (Object.keys(vm.vitamins).length === 0 && Object.keys(vm.minerals).length === 0) {
    return null;
  }

  const out: Record<string, unknown> = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  };
  if (Object.keys(vm.vitamins).length > 0) out.vitamins = vm.vitamins;
  if (Object.keys(vm.minerals).length > 0) out.minerals = vm.minerals;
  return out;
}
