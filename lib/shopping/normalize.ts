const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const FRACTION_MAP: Record<string, number> = {
  "1/4": 0.25, "1/3": 1 / 3, "1/2": 0.5, "2/3": 2 / 3, "3/4": 0.75, "¼": 0.25, "½": 0.5, "¾": 0.75,
};
const UNIT_NORMALISE: Record<string, string> = {
  cups: "cup", tablespoons: "tbsp", tablespoon: "tbsp", teaspoons: "tsp", teaspoon: "tsp",
  ounces: "oz", ounce: "oz", grams: "g", gram: "g", pieces: "piece", slices: "slice",
};
const INGREDIENT_CANONICAL: Record<string, string> = {
  mayo: "mayonnaise",
  scallion: "green onion",
  "spring onion": "green onion",
  "mixed green": "mixed greens",
  "whey protein": "protein powder",
  "whey protein powder": "protein powder",
  "plant protein": "protein powder",
  "pea protein": "protein powder",
  "ahi tuna fillet": "ahi tuna",
  "mahi-mahi fillet": "mahi-mahi",
  "yellowtail fillet": "yellowtail",
  "ono fillet": "ono",
  "salmon fillet": "salmon",
  maple: "maple syrup",
};
const STRIP_WORDS = new Set([
  "fresh", "dried", "chunk", "chunks", "diced", "chopped", "minced", "sliced", "slice",
  "roasted", "grilled", "baked", "steamed", "fried", "in", "juice", "syrup",
  "fillet", "fillets", "cooked", "lean", "ground", "low-sodium", "medium",
]);

export type ShoppingItem = { qty: number; unit: string; name: string; sources: string[] };
export type ShoppingCategory = { label: string; color: string; items: ShoppingItem[] };
export type ShoppingListTelemetry = {
  totalItems: number;
  otherItems: number;
  otherCategoryPercent: number;
};

const CATEGORIES: { label: string; color: string; keywords: string[] }[] = [
  {
    label: "Protein",
    color: "text-neon-green",
    keywords: [
      "chicken", "beef", "fish", "egg", "tofu", "protein powder", "turkey", "salmon", "tuna",
      "ahi", "mahi", "yellowtail", "ono", "shrimp", "cod", "tilapia",
    ],
  },
  { label: "Dairy & Alternatives", color: "text-neon-blue", keywords: ["milk", "cheese", "yogurt", "butter", "cream"] },
  {
    label: "Grains & Bread",
    color: "text-neon-amber",
    keywords: [
      "oat", "rice", "bread", "toast", "pasta", "quinoa", "tortilla", "bagel", "barley",
      "couscous", "farro", "buckwheat", "flour", "granola",
    ],
  },
  {
    label: "Vegetables",
    color: "text-emerald-400",
    keywords: [
      "broccoli", "spinach", "carrot", "pepper", "onion", "garlic", "cucumber", "lettuce",
      "kale", "tomato", "mixed greens", "green onion", "asparagus", "bok choy",
      "brussels sprout", "green bean", "zucchini", "sweet potato", "potato", "vegetable", "taro",
    ],
  },
  {
    label: "Fruit",
    color: "text-pink-400",
    keywords: ["apple", "banana", "berry", "orange", "lemon", "lime", "mango", "grape", "peach", "pear", "avocado", "papaya", "coconut", "coconut water"],
  },
  {
    label: "Nuts, Seeds & Oils",
    color: "text-yellow-400",
    keywords: ["almond", "walnut", "cashew", "peanut", "chia", "flax", "olive oil", "avocado oil", "sesame oil", "sesame", "macadamia", "pecan", "coconut oil", "shredded coconut"],
  },
  {
    label: "Condiments & Spices",
    color: "text-gray-300",
    keywords: ["salt", "pepper", "mustard", "vinegar", "honey", "mayonnaise", "mayo", "baking powder", "cumin", "oregano", "paprika", "thyme", "soy sauce", "salsa", "maple syrup"],
  },
];

const VALID_CATEGORY_LABELS = new Set(CATEGORIES.map((c) => c.label).concat("Other"));
const ING_RE =
  /^([\d¼½¾⅓⅔]+(?:\/\d+)?(?:\.\d+)?)(?:\s+(cups?|tablespoons?|tbsp|teaspoons?|tsp|oz|ounces?|g|grams?|pieces?|slices?))?\s+(.+)$/i;
const TRAILING_MEASURE_RE =
  /^(.+?)([\d¼½¾⅓⅔]+(?:\/\d+)?(?:\.\d+)?)(?:\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|oz|ounces?|g|grams?|pieces?|slices?))$/i;
const NUT_OIL_RE = /walnut|almond|cashew|peanut|chia|flax|olive oil|avocado oil|coconut oil|tahini|protein powder/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function parseFraction(s: string): number {
  const mixedUnicode = s.match(/^(\d+)([¼½¾⅓⅔])$/u);
  if (mixedUnicode) {
    return Number(mixedUnicode[1]) + (FRACTION_MAP[mixedUnicode[2]] ?? 0);
  }
  const mixedAscii = s.match(/^(\d+)\s+(\d+\/\d+)$/);
  if (mixedAscii) {
    return Number(mixedAscii[1]) + parseFraction(mixedAscii[2]);
  }
  if (s in FRACTION_MAP) return FRACTION_MAP[s]!;
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : 0;
  }
  return parseFloat(s) || 0;
}
function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

function stripTrailingDigitJunk(word: string): string {
  return word
    .replace(/^([a-z]+)\d+$/i, "$1")
    .replace(/^([a-z]+)[\d¼½¾⅓⅔]+$/iu, "$1");
}

function canonicalizeGrainBread(name: string): string {
  const parts = name
    .toLowerCase()
    .split(/\s+/)
    .map(stripTrailingDigitJunk)
    .filter((p) => p && p !== "slice" && p !== "slices");
  const s = new Set(parts);
  if (s.has("wheat") && s.has("toast") && parts.every((w) => w === "wheat" || w === "toast")) {
    return "wheat toast";
  }
  if (s.has("wheat") && s.has("bread") && parts.every((w) => w === "wheat" || w === "bread")) {
    return "wheat bread";
  }
  return name;
}

export function normalizeIngredientName(raw: string): string {
  const base = raw
    .replace(/\(.*?\)/g, "")
    .replace(/\bto taste\b|\bas needed\b/gi, "")
    .replace(/[,;]+$/, "")
    .replace(/\s+in\s+(light\s+)?juice\b/gi, "")
    .replace(/\s+in\s+(heavy\s+)?syrup\b/gi, "")
    .trim()
    .toLowerCase();
  const pieces = base
    .split(/\s+/)
    .filter(Boolean)
    .map(stripTrailingDigitJunk)
    .filter((w) => !STRIP_WORDS.has(w));
  if (pieces.length > 0) pieces[pieces.length - 1] = singularize(pieces[pieces.length - 1]!);
  const result = pieces.join(" ");
  const canonical = INGREDIENT_CANONICAL[result] ?? result;
  return canonicalizeGrainBread(canonical);
}

function parseIngredientLine(ing: string): ShoppingItem | null {
  const trimmed = ing.trim().replace(/[,;]+$/, "");
  const leading = trimmed.match(ING_RE);
  if (leading) {
    const qty = parseFraction(leading[1]);
    const rawUnit = (leading[2] ?? "").toLowerCase();
    const unit = UNIT_NORMALISE[rawUnit] ?? rawUnit;
    return { qty, unit, name: normalizeIngredientName(leading[3]), sources: [] };
  }
  // Handle malformed Atlas strings like "fresh pineapple8½ cup".
  const compact = trimmed.replace(/\s+/g, " ");
  const trailing = compact.match(TRAILING_MEASURE_RE);
  if (!trailing) return null;
  const namePart = trailing[1].trim();
  const qty = parseFraction(trailing[2]);
  const rawUnit = (trailing[3] ?? "").toLowerCase();
  const unit = UNIT_NORMALISE[rawUnit] ?? rawUnit;
  return { qty, unit, name: normalizeIngredientName(namePart), sources: [] };
}

function toOuncesForMerge(item: ShoppingItem): number | null {
  const unit = item.unit.toLowerCase();
  if (unit === "oz") return item.qty;
  if (unit === "g") return item.qty / 28.3495;
  if (unit === "cup" && NUT_OIL_RE.test(item.name)) return item.qty * 6;
  if (unit === "tbsp" && NUT_OIL_RE.test(item.name)) return item.qty * 0.375;
  if (unit === "tsp" && NUT_OIL_RE.test(item.name)) return item.qty * 0.125;
  return null;
}

function categorize(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i]!.keywords.some((kw) => lower.includes(kw))) return i;
  }
  return CATEGORIES.length;
}

function mealsObjectFromPlanRoot(root: Record<string, unknown>): Record<string, unknown> | null {
  if (WEEK_DAYS.some((d) => isRecord(root[d]))) return root;
  const inner = root.meals;
  if (isRecord(inner) && WEEK_DAYS.some((d) => isRecord(inner[d]))) return inner;
  return null;
}

function normalizeIngredientLineForStorage(ing: string): string {
  const parsed = parseIngredientLine(ing);
  if (!parsed) {
    const stripped = ing.replace(/^[\d./\s¼½¾⅓⅔-]+/u, "").trim();
    return normalizeIngredientName(stripped || ing);
  }
  const qtyText = parsed.qty > 0 ? String(parsed.qty % 1 === 0 ? parsed.qty : Number(parsed.qty.toFixed(2))) : "";
  return `${qtyText}${parsed.unit ? ` ${parsed.unit}` : ""} ${parsed.name}`.trim();
}

export function normalizeMealPlanMeals(mealsInput: unknown): Record<string, unknown> {
  if (!isRecord(mealsInput)) return {};
  const root = mealsObjectFromPlanRoot(mealsInput);
  if (!root) return mealsInput;
  const out: Record<string, unknown> = {};
  for (const day of WEEK_DAYS) {
    const dayMealsRaw = root[day];
    if (!isRecord(dayMealsRaw)) continue;
    const dayMeals: Record<string, unknown> = {};
    for (const [mealType, mealRaw] of Object.entries(dayMealsRaw)) {
      if (!isRecord(mealRaw) || !Array.isArray(mealRaw.ingredients)) {
        dayMeals[mealType] = mealRaw;
        continue;
      }
      const ingredients = mealRaw.ingredients.filter((i): i is string => typeof i === "string").map(normalizeIngredientLineForStorage);
      dayMeals[mealType] = { ...mealRaw, ingredients };
    }
    out[day] = dayMeals;
  }
  return out;
}

export function buildCanonicalShoppingListFromMealPlanMeals(mealsInput: unknown): ShoppingCategory[] {
  if (!isRecord(mealsInput)) return [];
  const root = mealsObjectFromPlanRoot(mealsInput);
  if (!root) return [];
  const bucket = new Map<string, ShoppingItem>();
  for (const day of WEEK_DAYS) {
    const dayMealsRaw = root[day];
    if (!isRecord(dayMealsRaw)) continue;
    for (const [mealType, mealRaw] of Object.entries(dayMealsRaw)) {
      if (!isRecord(mealRaw) || !Array.isArray(mealRaw.ingredients)) continue;
      for (const ing of mealRaw.ingredients) {
        if (typeof ing !== "string") continue;
        const parsed = parseIngredientLine(ing);
        const normalized = parsed ?? { qty: 0, unit: "", name: normalizeIngredientName(ing), sources: [] };
        const key = `${normalized.name}|${normalized.unit}`;
        if (!bucket.has(key)) bucket.set(key, { ...normalized, sources: [`${day} ${mealType}`] });
        else {
          const existing = bucket.get(key)!;
          existing.qty += normalized.qty;
          existing.sources.push(`${day} ${mealType}`);
        }
      }
    }
  }
  const mergedByName = new Map<string, ShoppingItem[]>();
  for (const item of bucket.values()) {
    const k = item.name.toLowerCase();
    if (!mergedByName.has(k)) mergedByName.set(k, []);
    mergedByName.get(k)!.push(item);
  }
  const items: ShoppingItem[] = [];
  for (const group of mergedByName.values()) {
    if (group.length === 1) {
      items.push(group[0]!);
      continue;
    }
    let ozTotal = 0;
    const leftovers: ShoppingItem[] = [];
    const sources: string[] = [];
    for (const item of group) {
      const oz = toOuncesForMerge(item);
      if (oz == null) leftovers.push(item);
      else {
        ozTotal += oz;
        sources.push(...item.sources);
      }
    }
    if (ozTotal > 0) items.push({ qty: Number(ozTotal.toFixed(1)), unit: "oz", name: group[0]!.name, sources: [...new Set(sources)] });
    items.push(...leftovers);
  }
  const catBuckets = new Map<number, ShoppingItem[]>();
  for (const item of items) {
    const idx = categorize(item.name);
    if (!catBuckets.has(idx)) catBuckets.set(idx, []);
    catBuckets.get(idx)!.push({ ...item, sources: [...new Set(item.sources)] });
  }
  return Array.from(catBuckets.keys())
    .sort((a, b) => a - b)
    .map((idx) => {
      const cat = CATEGORIES[idx] ?? { label: "Other", color: "text-muted-foreground" };
      return { label: cat.label, color: cat.color, items: catBuckets.get(idx)!.sort((a, b) => a.name.localeCompare(b.name)) };
    });
}

export function parsePersistedShoppingList(input: unknown): ShoppingCategory[] | null {
  const raw = typeof input === "string" ? (() => { try { return JSON.parse(input) as unknown; } catch { return null; } })() : input;
  if (!Array.isArray(raw)) return null;
  const out: ShoppingCategory[] = [];
  for (const cat of raw) {
    if (!isRecord(cat) || typeof cat.label !== "string" || !VALID_CATEGORY_LABELS.has(cat.label)) continue;
    if (!Array.isArray(cat.items)) continue;
    const items: ShoppingItem[] = cat.items
      .filter((i): i is Record<string, unknown> => isRecord(i))
      .map((i) => ({
        qty: typeof i.qty === "number" && Number.isFinite(i.qty) ? i.qty : 0,
        unit: typeof i.unit === "string" ? i.unit : "",
        name: typeof i.name === "string" ? i.name : "",
        sources: Array.isArray(i.sources) ? i.sources.filter((s): s is string => typeof s === "string") : [],
      }))
      .filter((i) => i.name.trim().length > 0);
    out.push({ label: cat.label, color: typeof cat.color === "string" ? cat.color : "text-muted-foreground", items });
  }
  return out.length ? out : null;
}

export function shoppingCategoryLabels(): string[] {
  return [...VALID_CATEGORY_LABELS];
}

export function shoppingListTelemetry(input: unknown): ShoppingListTelemetry {
  const parsed = parsePersistedShoppingList(input);
  if (!parsed) {
    return { totalItems: 0, otherItems: 0, otherCategoryPercent: 0 };
  }
  const totalItems = parsed.reduce((sum, cat) => sum + cat.items.length, 0);
  const otherItems = parsed
    .filter((cat) => cat.label === "Other")
    .reduce((sum, cat) => sum + cat.items.length, 0);
  const otherCategoryPercent =
    totalItems > 0 ? Number(((otherItems / totalItems) * 100).toFixed(2)) : 0;
  return { totalItems, otherItems, otherCategoryPercent };
}
