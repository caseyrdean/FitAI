"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatLocalWeekRangeLabel,
  localDayInPlanWeek,
} from "@/lib/local-week";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MEAL_TYPE_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

export type PlanMeal = {
  name?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  ingredients?: string[];
  prepTime?: string;
  /** Estimated micronutrients for this meal (~est.) — shown in the plan; food log entries get separate estimates from description text. */
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
};

export type MealPlanApi = {
  id: string;
  weekStart: string;
  meals: Record<string, Record<string, PlanMeal | unknown>>;
  macroTargets?: unknown;
  shoppingList?: unknown;
  prepGuide?: unknown;
  createdAt?: string;
};

// ─── shopping list helpers ────────────────────────────────────────────────────

const FRACTION_MAP: Record<string, number> = {
  "1/8": 0.125, "1/4": 0.25, "1/3": 1 / 3, "3/8": 0.375, "1/2": 0.5,
  "5/8": 0.625, "2/3": 2 / 3, "3/4": 0.75, "7/8": 0.875,
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const UNIT_NORMALISE: Record<string, string> = {
  cups: "cup", tablespoon: "tbsp", tablespoons: "tbsp", tbsps: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsps: "tsp",
  ounce: "oz", ounces: "oz", gram: "g", grams: "g",
  kilogram: "kg", kilograms: "kg", milliliter: "ml", milliliters: "ml",
  liter: "l", liters: "l", pound: "lb", pounds: "lb",
  pieces: "piece", slices: "slice", cloves: "clove", cans: "can",
  servings: "serving", scoops: "scoop",
};

function parseFraction(s: string): number {
  if (s in FRACTION_MAP) return FRACTION_MAP[s];
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : 0;
  }
  return parseFloat(s) || 0;
}

// Parse "1/2 cup rolled oats" → { qty: 0.5, unit: "cup", name: "rolled oats" }
const ING_RE =
  /^([\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:\/\d+)?(?:\.\d+)?)(?:\s+(cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|lbs?|pounds?|pieces?|slices?|cloves?|cans?|servings?|handfuls?|pinch(?:es)?|scoops?|sprigs?|heads?|bunches?|sheets?))?\s+(.+)$/i;

type ParsedIng = { qty: number; unit: string; name: string; raw: string };

// Words that describe prep, cooking, packaging, or style — not the base ingredient
const STRIP_WORDS = new Set([
  "fresh", "dried", "large", "medium", "small", "extra-large", "xl", "whole",
  "raw", "cooked", "sliced", "diced", "chopped", "minced", "frozen", "canned",
  "ground", "boneless", "skinless", "unsalted", "salted", "organic", "baby",
  "ripe", "firm", "softened", "melted", "extra", "virgin", "lean", "fat-free",
  "low-fat", "full-fat", "reduced-fat", "plain", "uncooked", "dry", "crushed",
  "peeled", "seeded", "halved", "quartered", "thinly", "finely", "russet",
  "yellow", "red", "white", "black", "purple", "sweet", "roma",
  "cherry", "grape", "vine", "heirloom", "beefsteak",
  "roasted", "grilled", "baked", "steamed", "fried", "sautéed", "sauteed", "broiled",
  "boiled", "blanched", "braised", "smoked", "poached", "seared", "caramelized",
  "charred", "blackened", "marinated", "pickled", "stuffed", "shredded", "julienned",
  "spiralized", "mashed", "whipped", "creamed", "pureed", "rinsed", "drained",
  "patted", "trimmed", "deveined", "thawed", "style", "light", "dark",
  "sticks", "wedges", "chunks", "cubed", "coins", "matchstick", "packed", "undrained",
  "crinkle-cut", "crinkle", "cut",
]);

/** Trailing unit tokens left fused on unparseable lines (e.g. "mayo2 tbsp" → "mayo tbsp" → "mayo"). */
const DANGLING_MEASURE_TOKENS = new Set([
  "cup", "cups", "tbsp", "tbsps", "tablespoon", "tablespoons", "tsp", "tsps", "teaspoon", "teaspoons",
  "oz", "ounce", "ounces", "g", "gram", "grams", "ml", "l", "lb", "lbs", "pound", "pounds",
]);

function singularize(word: string): string {
  if (word.length < 3) return word;
  const low = word.toLowerCase();
  if (low === "greens") return "greens"; // salad greens, not "green"
  // peaches → peach, dishes → dish (before generic -s strip which made "peache")
  if (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes"))
    return word.slice(0, -2);
  if (word.endsWith("oes")) return word.slice(0, -2); // tomatoes → tomato
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ves")) return word.slice(0, -3) + "f";
  if (word.endsWith("sses")) return word.slice(0, -2); // classes → class (not glasses→glass)
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us"))
    return word.slice(0, -1);
  return word;
}

/** Rare bad outputs from plural rules — fix to real singular. */
function fixSingularTypo(s: string): string {
  const fixes: Record<string, string> = { peache: "peach" };
  return fixes[s] ?? s;
}

/** LLM noise: "toast1", "berry2¼" fused to quantity/fraction. */
function stripTrailingDigitJunk(word: string): string {
  let w = word.replace(/^([a-z]+)\d+$/i, "$1");
  w = w.replace(/^([a-z]+)[\d¼½¾⅓⅔⅛⅜⅝⅞]+$/iu, "$1");
  return w;
}

/** Same grocery item: "wheat slice toast1" vs "wheat toast2 slice" → one line. */
function canonicalizeGrainBread(name: string): string {
  const parts = name
    .toLowerCase()
    .split(/\s+/)
    .map(stripTrailingDigitJunk)
    .filter((p) => p && p !== "slice" && p !== "slices");
  if (parts.length === 0) return name;
  const s = new Set(parts);
  if (s.has("wheat") && s.has("toast") && parts.every((w) => w === "wheat" || w === "toast"))
    return "wheat toast";
  if (s.has("wheat") && s.has("bread") && parts.every((w) => w === "wheat" || w === "bread"))
    return "wheat bread";
  return name;
}

/** Map normalized tokens to a single grocery label (dedupe + display). */
const INGREDIENT_CANONICAL: Record<string, string> = {
  mayo: "mayonnaise",
  "mixed green": "mixed greens",
  "mixed greens": "mixed greens",
  "brussels sprout": "brussels sprouts",
  "brussel sprout": "brussels sprouts",
  scallion: "green onion",
  shallot: "shallot",
  "green onion": "green onion",
  "spring onion": "green onion",
  "whey protein": "protein powder",
  "whey protein powder": "protein powder",
  "casein protein": "protein powder",
  "plant protein": "protein powder",
  "pea protein": "protein powder",
  "soy protein": "protein powder",
  "hemp protein": "protein powder",
  "vegan protein": "protein powder",
  "protein isolate": "protein powder",
  "whey isolate": "protein powder",
};

/** Collapse any *protein powder / *protein variant to one shopping line. */
function canonicalizeSupplements(name: string): string {
  const n = name.toLowerCase().trim();
  if (n === "whey" || n === "casein") return "protein powder";
  if (/protein\s+powder/.test(n)) return "protein powder";
  if (/^(whey|casein|plant|pea|soy|hemp|brown\s+rice)\s+protein$/.test(n)) return "protein powder";
  if (n.endsWith(" protein") && !n.includes("chicken") && !n.includes("beef")) {
    const base = n.replace(/\s+protein$/, "");
    if (/^(whey|casein|plant|pea|soy|hemp|vegan|rice)$/.test(base)) return "protein powder";
  }
  return name;
}

function normalizeIngredientName(raw: string): string {
  let name = raw.replace(/\(.*?\)/g, "").trim();
  name = name.replace(/\bto taste\b|\bas needed\b/gi, "").trim();
  name = name.replace(/[,;]+$/, "").trim();

  // Drop carrier / medium phrases: "peaches in juice" → "peaches"
  name = name
    .replace(/\s+in\s+its\s+own\s+juice\b/gi, "")
    .replace(/\s+in\s+(light\s+)?juice\b/gi, "")
    .replace(/\s+in\s+(heavy\s+)?syrup\b/gi, "")
    .replace(/\s+in\s+water\b/gi, "")
    .replace(/\s+in\s+oil\b/gi, "")
    .replace(/\s+in\s+cream\b/gi, "")
    .replace(/\s+in\s+(tomato\s+)?sauce\b/gi, "")
    .replace(/\s+in\s+stock\b/gi, "")
    .replace(/\s+in\s+broth\b/gi, "")
    .replace(/\s+packed\s+in\s+.+$/i, "")
    .trim();

  const words = name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(stripTrailingDigitJunk);
  const kept = words.filter((w) => !STRIP_WORDS.has(w));
  let result = (kept.length > 0 ? kept : words).join(" ").trim();
  if (!result) result = words.join(" ").trim();

  const parts = result.split(/\s+/).filter(Boolean);
  while (parts.length > 0 && DANGLING_MEASURE_TOKENS.has(parts[parts.length - 1]!.toLowerCase())) {
    parts.pop();
  }
  if (parts.length > 0) {
    parts[parts.length - 1] = fixSingularTypo(singularize(parts[parts.length - 1]!));
    result = parts.join(" ").trim();
  } else {
    result = (kept.length > 0 ? kept : words).join(" ").trim();
  }

  let canon = INGREDIENT_CANONICAL[result];
  if (!canon) canon = INGREDIENT_CANONICAL[result.toLowerCase()];
  result = canon ?? result;
  result = canonicalizeGrainBread(result);
  return canonicalizeSupplements(result);
}

// Convert everything to a common unit within a family so tsp+tbsp combine
function normalizeUnit(qty: number, unit: string): { qty: number; unit: string } {
  if (unit === "tsp") return { qty: qty / 3, unit: "tbsp" };        // 3 tsp = 1 tbsp
  if (unit === "tbsp" && qty >= 4) return { qty: qty / 16, unit: "cup" }; // 16 tbsp = 1 cup
  return { qty, unit };
}

/** Units that mean "count" for bread/bakery lines — merge with empty unit. */
const SLICE_COUNTABLE_UNITS = new Set(["", "slice", "slices", "piece", "pieces"]);

function isSliceCountableGrainBread(nameLower: string): boolean {
  if (/\btoast\b/.test(nameLower)) return true;
  if (/\bsourdough\b/.test(nameLower)) return true;
  if (/\b(bagel|croissant|pita|naan)\b/.test(nameLower)) return true;
  if (/\benglish muffin\b/.test(nameLower)) return true;
  if (/\bmuffin\b/.test(nameLower)) return true;
  if (/\b(bun|roll)\b/.test(nameLower)) return true;
  if (/\bbread\b/.test(nameLower)) {
    if (/\b(bread\s+crumb|breadcrumb|bread\s+flour)\b/.test(nameLower)) return false;
    return true;
  }
  return false;
}

function defaultBreadCountUnit(nameLower: string): "slice" | "piece" {
  if (/\b(bagel|muffin|bun|roll|croissant|pita|naan)\b/.test(nameLower)) return "piece";
  return "slice";
}

function parseIngredient(ing: string): ParsedIng | null {
  const m = ing.trim().match(ING_RE);
  if (!m) return null;
  const rawQty = parseFraction(m[1]);
  const rawUnit = (m[2] ?? "").toLowerCase();
  const baseUnit = UNIT_NORMALISE[rawUnit] ?? rawUnit;
  const { qty, unit: initUnit } = normalizeUnit(rawQty, baseUnit);
  let unit = initUnit;
  const name = normalizeIngredientName(m[3]);
  const nl = name.toLowerCase();
  if (isSliceCountableGrainBread(nl) && SLICE_COUNTABLE_UNITS.has(unit.toLowerCase())) {
    if (!unit) unit = defaultBreadCountUnit(nl);
  }
  return { qty, unit, name, raw: ing };
}

function formatQty(qty: number): string {
  const FRACS: [number, string][] = [
    [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"], [0.5, "½"],
    [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"],
  ];
  const whole = Math.floor(qty);
  const dec = qty - whole;
  const frac = FRACS.find(([v]) => Math.abs(dec - v) < 0.02)?.[1];
  if (Math.abs(dec) < 0.02) return String(whole);
  if (whole === 0 && frac) return frac;
  if (frac) return `${whole}${frac}`;
  return qty.toFixed(1).replace(/\.0$/, "");
}

type ShoppingItem = { qty: number; unit: string; name: string; sources: string[] };
type ShoppingCategory = { label: string; color: string; items: ShoppingItem[] };

const CATEGORIES: { label: string; color: string; keywords: string[] }[] = [
  {
    label: "Protein",
    color: "text-neon-green",
    keywords: [
      "chicken", "salmon", "beef", "tuna", "turkey", "shrimp", "fish", "pork", "egg",
      "tofu", "tempeh", "cod", "tilapia", "steak", "lamb", "venison", "protein powder", "whey",
      "bacon", "sausage", "ham", "duck", "anchov", "halibut", "trout", "haddock", "mackerel",
      "sardine", "herring", "catfish", "bass", "perch", "snapper", "grouper", "sole", "flounder",
      "scallop", "mussel", "clam", "oyster", "crab", "lobster", "octopus", "squid", "calamari",
      "bison", "elk", "rabbit", "quail", "pheasant", "chorizo", "brisket", "ribs",
    ],
  },
  {
    label: "Dairy & Alternatives",
    color: "text-neon-blue",
    keywords: ["milk", "cheese", "yogurt", "butter", "cream", "cottage", "ricotta", "mozzarella",
      "cheddar", "parmesan", "greek yogurt", "almond milk", "oat milk", "soy milk", "feta"],
  },
  {
    label: "Grains & Bread",
    color: "text-neon-amber",
    keywords: [
      "oat", "rice", "bread", "toast", "pasta", "quinoa", "flour", "tortilla", "wrap", "cereal",
      "granola", "barley", "farro", "couscous", "noodle", "bagel", "cracker", "bulgur", "wheat",
      "sourdough", "pita", "naan", "bun", "roll", "muffin", "english muffin", "croissant",
    ],
  },
  {
    label: "Vegetables",
    color: "text-emerald-400",
    keywords: [
      "broccoli", "spinach", "carrot", "pepper", "onion", "garlic", "tomato", "cucumber",
      "lettuce", "kale", "cabbage", "cauliflower", "zucchini", "asparagus", "celery", "beet",
      "sweet potato", "potato", "mushroom", "corn", "lentil", "edamame",
      "artichoke", "brussels", "leek", "radish", "turnip", "parsnip", "fennel", "okra",
      "arugula", "chard", "collard", "squash", "jalapeno", "bok choy", "sprout", "scallion",
      "green onion", "shallot", "ginger root", "ginger", "pea", "bean",
      "mixed greens", "mixed green", "spring mix", "mesclun", "romaine", "iceberg",
    ],
  },
  {
    label: "Fruit",
    color: "text-pink-400",
    keywords: [
      "apple", "banana", "berries", "berry", "blueberry", "strawberry", "raspberry", "blackberry",
      "orange", "lemon", "lime", "mango", "pineapple", "grape", "peach", "pear", "apricot",
      "plum", "nectarine", "watermelon", "cherry", "avocado", "date", "fig", "kiwi",
      "cantaloupe", "honeydew", "pomegranate", "clementine", "mandarin", "cranberry", "currant",
      "coconut", "raisin", "raisins", "dried cranberry",
    ],
  },
  {
    label: "Nuts, Seeds & Oils",
    color: "text-yellow-400",
    keywords: ["almond", "walnut", "cashew", "peanut", "pecan", "chia", "flax", "hemp",
      "sunflower", "pumpkin seed", "sesame", "tahini", "olive oil", "coconut oil",
      "avocado oil", "nut butter", "peanut butter"],
  },
  {
    label: "Condiments & Spices",
    color: "text-gray-300",
    keywords: ["salt", "pepper", "garlic powder", "onion powder", "cinnamon", "cumin",
      "paprika", "turmeric", "oregano", "basil", "thyme", "rosemary", "dill", "parsley",
      "soy sauce", "hot sauce", "mustard", "vinegar", "honey", "maple syrup",
      "ketchup", "mayonnaise", "mayo", "sriracha", "worcestershire"],
  },
];

/** Substring matches that cause false positives (e.g. "peache" matching "pea"). */
const KEYWORD_WORD_BOUNDARY = new Set([
  "pea",
  "bean",
  "nut",
  "ham",
  "oil",
  "rye",
  "corn",
  "wheat",
  "bun",
  "roll",
  "mayo",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(nameLower: string, kwRaw: string): boolean {
  const kw = kwRaw.toLowerCase();
  if (kw.includes(" ")) return nameLower.includes(kw);
  if (KEYWORD_WORD_BOUNDARY.has(kw)) {
    return new RegExp(`(^|[^a-z])${escapeRe(kw)}s?([^a-z]|$)`, "i").test(nameLower);
  }
  return nameLower.includes(kw);
}

function categorise(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].keywords.some((k) => keywordMatches(lower, k))) return i;
  }
  return CATEGORIES.length; // "Other"
}

const NUT_OIL_MERGE_NAMES =
  /walnut|almond|cashew|pecan|pistach|macadamia|hazelnut|pine nut|peanut|sunflower seed|pumpkin seed|chia seed|chia\b|flax|hemp seed|sesame seed|tahini|olive oil|coconut oil|avocado oil|sesame oil|vegetable oil|canola oil|grapeseed oil/;

function shouldStandardizeUnits(nameLower: string): boolean {
  return NUT_OIL_MERGE_NAMES.test(nameLower) || nameLower.includes("protein powder");
}

/** Convert to oz for merging nut / oil / protein-powder adjunct lines (~est.). */
function toOuncesForMerge(qty: number, unit: string, nameLower: string): number | null {
  const u = unit.toLowerCase();
  if (u === "oz" || u === "ounce" || u === "ounces") return qty;
  if (u === "g" || u === "gram" || u === "grams") return qty / 28.3495;
  const nut = /walnut|almond|cashew|pecan|pistach|macadamia|hazelnut|pine nut|peanut|sunflower seed|pumpkin seed|chia|flax|hemp seed|sesame|tahini/.test(
    nameLower,
  );
  const oil = /olive oil|coconut oil|avocado oil|sesame oil|vegetable oil|canola oil|grapeseed oil/.test(
    nameLower,
  );
  if (u === "cup") {
    if (nut) return qty * 4.2;
    if (oil) return qty * 7.6;
  }
  if (u === "tbsp") {
    if (nut) return qty * (4.2 / 16);
    if (oil) return qty * (7.6 / 16);
  }
  if (u === "tsp") {
    if (nut) return qty * (4.2 / 48);
    if (oil) return qty * (7.6 / 48);
  }
  if (nameLower.includes("protein powder") && (u === "scoop" || u === "servings" || u === "serving"))
    return qty * 1.1; // ~1 oz equiv per scoop (~est.)
  return null;
}

function dedupeSources(sources: string[]): string[] {
  return [...new Set(sources)];
}

/** Merge same ingredient with different volume units into one oz line where possible. */
function mergeItemsWithStandardizedUnits(items: ShoppingItem[]): ShoppingItem[] {
  const byName = new Map<string, ShoppingItem[]>();
  for (const it of items) {
    const k = it.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(it);
  }
  const out: ShoppingItem[] = [];
  for (const group of byName.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const nameLower = group[0].name.toLowerCase();
    if (!shouldStandardizeUnits(nameLower)) {
      out.push(...group);
      continue;
    }
    let totalOz = 0;
    const sources: string[] = [];
    const leftovers: ShoppingItem[] = [];
    for (const g of group) {
      if (!g.unit) {
        leftovers.push(g);
        continue;
      }
      const oz = toOuncesForMerge(g.qty, g.unit, nameLower);
      if (oz != null && oz > 0) {
        totalOz += oz;
        sources.push(...g.sources);
      } else {
        leftovers.push(g);
      }
    }
    if (totalOz > 0) {
      out.push({
        qty: Math.round(totalOz * 10) / 10,
        unit: "oz",
        name: group[0].name,
        sources: dedupeSources(sources),
      });
    }
    out.push(...leftovers);
  }
  return out;
}

/** Same ingredient as "2 wheat toast" vs "2 slice wheat toast" — bucket keys differ; merge here. */
function mergeGrainBreadCountItems(items: ShoppingItem[]): ShoppingItem[] {
  const mergeable: ShoppingItem[] = [];
  const rest: ShoppingItem[] = [];
  for (const it of items) {
    const u = it.unit.toLowerCase();
    const nl = it.name.toLowerCase();
    if (isSliceCountableGrainBread(nl) && SLICE_COUNTABLE_UNITS.has(u)) {
      mergeable.push(it);
    } else {
      rest.push(it);
    }
  }
  const byName = new Map<string, ShoppingItem>();
  for (const it of mergeable) {
    const k = it.name.toLowerCase();
    const prev = byName.get(k);
    if (!prev) {
      byName.set(k, {
        qty: it.qty,
        unit: it.unit || defaultBreadCountUnit(k),
        name: it.name,
        sources: [...it.sources],
      });
    } else {
      prev.qty += it.qty;
      prev.sources.push(...it.sources);
    }
  }
  for (const it of byName.values()) {
    it.sources = dedupeSources(it.sources);
    it.unit = defaultBreadCountUnit(it.name.toLowerCase());
  }
  return [...rest, ...byName.values()];
}

function buildShoppingList(
  mealsRoot: Record<string, unknown> | undefined,
): ShoppingCategory[] {
  if (!mealsRoot || !isRecord(mealsRoot)) return [];
  const resolved = mealsObjectFromPlanRoot(mealsRoot);
  if (!resolved) return [];

  // bucket: key = "name|unit" — only this plan's 7 days (no other weeks / no stale JSON branches)
  const bucket = new Map<string, ShoppingItem>();

  for (const day of WEEK_DAYS) {
    const dayMeals = resolveDayMeals(resolved, day);
    for (const [mealType, rawMeal] of Object.entries(dayMeals)) {
      const meal = parseMeal(rawMeal);
      for (const ingStr of meal.ingredients ?? []) {
        const parsed = parseIngredient(ingStr);
        if (!parsed) {
          // Unparseable line — still normalize name so duplicates merge where possible
          const stripped = ingStr.replace(/^[\d./\s¼½¾⅓⅔⅛⅜⅝⅞-]+/u, "").trim();
          const norm = normalizeIngredientName(stripped || ingStr);
          const key = `${norm}|`;
          if (!bucket.has(key)) {
            bucket.set(key, { qty: 0, unit: "", name: norm, sources: [] });
          }
          bucket.get(key)!.sources.push(`${day} ${mealType}`);
          continue;
        }
        const key = `${parsed.name}|${parsed.unit}`;
        if (bucket.has(key)) {
          const existing = bucket.get(key)!;
          existing.qty += parsed.qty;
          existing.sources.push(`${day} ${mealType}`);
        } else {
          bucket.set(key, {
            qty: parsed.qty,
            unit: parsed.unit,
            name: parsed.name,
            sources: [`${day} ${mealType}`],
          });
        }
      }
    }
  }

  const mergedItems = mergeGrainBreadCountItems(
    mergeItemsWithStandardizedUnits(Array.from(bucket.values())),
  );

  // Group into categories
  const catBuckets: Map<number, ShoppingItem[]> = new Map();
  for (const item of mergedItems) {
    const catIdx = categorise(item.name);
    if (!catBuckets.has(catIdx)) catBuckets.set(catIdx, []);
    catBuckets.get(catIdx)!.push(item);
  }

  const result: ShoppingCategory[] = [];
  const sortedCatIdxs = Array.from(catBuckets.keys()).sort((a, b) => a - b);
  for (const idx of sortedCatIdxs) {
    const items = catBuckets.get(idx)!.sort((a, b) => a.name.localeCompare(b.name));
    const cat = CATEGORIES[idx] ?? { label: "Other", color: "text-muted-foreground" };
    result.push({ label: cat.label, color: cat.color, items });
  }
  return result;
}

// ─── shared helpers ───────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseNumericRecordField(raw: unknown): Record<string, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function coalesceMicronutrientsFromMealRaw(raw: Record<string, unknown>): {
  fiber_g?: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
} {
  let vitamins = parseNumericRecordField(raw.vitamins);
  let minerals = parseNumericRecordField(raw.minerals);
  let fiber_g =
    typeof raw.fiber_g === "number" && Number.isFinite(raw.fiber_g) ? raw.fiber_g : undefined;

  const fromWrap = (w: unknown) => {
    if (!isRecord(w)) return;
    vitamins = vitamins ?? parseNumericRecordField(w.vitamins);
    minerals = minerals ?? parseNumericRecordField(w.minerals);
    if (fiber_g == null && typeof w.fiber_g === "number" && Number.isFinite(w.fiber_g)) {
      fiber_g = w.fiber_g;
    }
  };

  fromWrap(raw.nutrition);
  fromWrap(raw.micronutrients);
  fromWrap(raw.micros);

  return {
    ...(fiber_g != null ? { fiber_g } : {}),
    ...(vitamins ? { vitamins } : {}),
    ...(minerals ? { minerals } : {}),
  };
}

function parseMeal(raw: unknown): PlanMeal {
  if (typeof raw === "string") return { name: raw };
  if (!isRecord(raw)) return {};
  const micro = coalesceMicronutrientsFromMealRaw(raw);
  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    calories: typeof raw.calories === "number" ? raw.calories : undefined,
    protein_g: typeof raw.protein_g === "number" ? raw.protein_g : undefined,
    carbs_g: typeof raw.carbs_g === "number" ? raw.carbs_g : undefined,
    fat_g: typeof raw.fat_g === "number" ? raw.fat_g : undefined,
    fiber_g: micro.fiber_g,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.filter((i): i is string => typeof i === "string")
      : undefined,
    prepTime: typeof raw.prepTime === "string" ? raw.prepTime : undefined,
    vitamins: micro.vitamins,
    minerals: micro.minerals,
  };
}

function normaliseDayMeals(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()] = v;
  }
  return out;
}

function orderedMealTypes(dayMeals: Record<string, unknown>): string[] {
  const keys = Object.keys(dayMeals);
  const primary = MEAL_TYPE_ORDER.filter((k) => keys.includes(k));
  const primarySet = new Set<string>(primary);
  const rest = keys.filter((k) => !primarySet.has(k)).sort();
  return [...primary, ...rest];
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

/** Plan JSON may be `{ Monday: … }` or `{ meals: { Monday: … } }`. */
function mealsObjectFromPlanRoot(root: Record<string, unknown>): Record<string, unknown> | null {
  if (WEEK_DAYS.some((d) => isRecord(root[d]))) return root;
  const inner = root.meals;
  if (isRecord(inner) && WEEK_DAYS.some((d) => isRecord(inner[d]))) return inner;
  return null;
}

export type PlannedMealsQuickAdd = {
  dayName: string;
  slots: { mealType: string; meal: PlanMeal }[];
  /** True when today (reference date) is not inside [weekStart, weekStart+7) in the local calendar. */
  outsidePlanWeek: boolean;
};

/** Meals for a calendar day; `outsidePlanWeek` set when the plan exists but today isn’t in that week. */
export function getPlannedMealsForLocalDate(
  plan: MealPlanApi | null | undefined,
  referenceDate: Date = new Date(),
): PlannedMealsQuickAdd | null {
  if (!plan?.meals) return null;
  let root: unknown = plan.meals;
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
  const dayName = WEEK_DAYS[referenceDate.getDay()];
  const outsidePlanWeek = !localDayInPlanWeek(referenceDate, plan.weekStart);
  if (outsidePlanWeek) {
    return { dayName, slots: [], outsidePlanWeek: true };
  }
  const dayMeals = resolveDayMeals(mealsRoot, dayName);
  const keys = orderedMealTypes(dayMeals);
  const slots = keys
    .map((mealType) => ({
      mealType,
      meal: parseMeal(dayMeals[mealType]),
      raw: dayMeals[mealType],
    }))
    .filter(({ raw }) => raw !== undefined && raw !== null)
    .map(({ mealType, meal }) => ({ mealType, meal }));
  return { dayName, slots, outsidePlanWeek: false };
}

function EstLabel() {
  return (
    <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      ~est.
    </span>
  );
}

function WeekLabel({ plan }: { plan: MealPlanApi }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-white/90">{formatLocalWeekRangeLabel(plan.weekStart)}</span>
      {" · "}
      all macros <span className="text-neon-green">~est.</span>
    </p>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

type MealPlanProps = { onAfterSwap?: () => void };

export function MealPlan({ onAfterSwap }: MealPlanProps) {
  const [plan, setPlan] = useState<MealPlanApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meals");
      if (!res.ok) { setError("Could not load meal plan"); setPlan(null); return; }
      setPlan((await res.json()) as MealPlanApi | null);
    } catch {
      setError("Could not load meal plan");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSwap = async (day: string, mealType: string) => {
    const key = `${day}:${mealType}`;
    setSwapKey(key);
    try {
      const res = await fetch("/api/meals/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, mealType }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Swap failed");
        return;
      }
      await load();
      onAfterSwap?.();
    } catch {
      setError("Swap failed");
    } finally {
      setSwapKey(null);
    }
  };

  const mealsRoot = plan?.meals;

  const dayBlocks = useMemo(
    () =>
      WEEK_DAYS.map((day) => ({
        day,
        dayMeals: isRecord(mealsRoot) ? resolveDayMeals(mealsRoot, day) : {},
      })),
    [mealsRoot],
  );

  const shoppingCategories = useMemo(
    () => buildShoppingList(mealsRoot as Record<string, unknown> | undefined),
    [mealsRoot],
  );

  const totalItems = useMemo(
    () => shoppingCategories.reduce((s, c) => s + c.items.length, 0),
    [shoppingCategories],
  );

  if (loading && !plan) {
    return (
      <Card className="border-surface-border bg-surface-light/80 text-card-foreground">
        <CardHeader><CardTitle className="text-lg text-white">Weekly meal plan</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading plan…</p></CardContent>
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card className="border-surface-border bg-surface-light/80 text-card-foreground">
        <CardHeader><CardTitle className="text-lg text-white">Weekly meal plan</CardTitle></CardHeader>
        <CardContent>
          {error
            ? <p className="text-sm text-destructive">{error}</p>
            : <p className="text-sm font-medium text-neon-amber">No meal plan available. Plan with Atlas now.</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-surface-border bg-surface-light/80 text-card-foreground">
      <CardHeader className="border-b border-surface-border pb-4">
        <CardTitle className="text-lg text-white">Weekly meal plan</CardTitle>
        <WeekLabel plan={plan} />
      </CardHeader>

      <CardContent className="pt-4">
        {error && (
          <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>
        )}

        <Tabs defaultValue="plan">
          <TabsList className="mb-4 bg-surface-dark">
            <TabsTrigger
              value="plan"
              className="data-[state=active]:bg-surface-light data-[state=active]:text-white"
            >
              Meal Plan
            </TabsTrigger>
            <TabsTrigger
              value="shopping"
              className="data-[state=active]:bg-surface-light data-[state=active]:text-white"
            >
              Shopping List
              {totalItems > 0 && (
                <span className="ml-1.5 rounded-full bg-neon-green/20 px-1.5 py-0.5 text-[10px] font-semibold text-neon-green">
                  {totalItems}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Meal Plan tab ── */}
          <TabsContent value="plan">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {dayBlocks.map(({ day, dayMeals }) => {
                const types = orderedMealTypes(dayMeals);
                return (
                  <Card key={day} className="border-surface-border bg-surface/90 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold text-neon-blue">{day}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {types.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No meals</p>
                      ) : (
                        types.map((mealType) => {
                          const m = parseMeal(dayMeals[mealType]);
                          const busy = swapKey === `${day}:${mealType}`;
                          return (
                            <div
                              key={mealType}
                              className="rounded-md border border-surface-border bg-surface-dark/80 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {mealType}
                                  </p>
                                  <p className="mt-1 font-medium text-white">{m.name ?? "—"}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 border-neon-green/40 text-neon-green hover:bg-neon-green/10"
                                  disabled={busy}
                                  onClick={() => void handleSwap(day, mealType)}
                                >
                                  {busy ? "…" : "Swap"}
                                </Button>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-sm text-gray-300">
                                  {m.calories != null ? Math.round(m.calories) : "—"} kcal
                                  <EstLabel />
                                </span>
                                {m.prepTime && (
                                  <span className="text-xs text-muted-foreground">· {m.prepTime}</span>
                                )}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge variant="outline" className="border-neon-green/50 text-neon-green">
                                  P {m.protein_g != null ? `${Math.round(m.protein_g)}g` : "—"}
                                </Badge>
                                <Badge variant="outline" className="border-neon-blue/50 text-neon-blue">
                                  C {m.carbs_g != null ? `${Math.round(m.carbs_g)}g` : "—"}
                                </Badge>
                                <Badge variant="outline" className="border-neon-amber/60 text-neon-amber">
                                  F {m.fat_g != null ? `${Math.round(m.fat_g)}g` : "—"}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">~est.</span>
                              </div>
                              {m.ingredients && m.ingredients.length > 0 && (
                                <ul className="mt-3 space-y-0.5 border-t border-surface-border pt-3">
                                  {m.ingredients.map((ing, i) => (
                                    <li
                                      key={i}
                                      className="flex items-baseline gap-1.5 text-xs text-muted-foreground"
                                    >
                                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                                      {ing}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Shopping List tab ── */}
          <TabsContent value="shopping">
            {shoppingCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ingredients found — ensure the meal plan includes ingredient lists.
              </p>
            ) : (
              <>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-white/90">
                    {formatLocalWeekRangeLabel(plan.weekStart)}
                  </span>
                  {" · "}
                  This list is built only from this plan week (Sun–Sat). It does not carry over items
                  from other weeks. Regenerating or replacing the plan refreshes it.
                </p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {shoppingCategories.map((cat) => (
                    <div key={cat.label}>
                      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-widest ${cat.color}`}>
                        {cat.label}
                      </h3>
                      <ul className="space-y-1.5">
                        {cat.items.map((item) => {
                          const qtyStr =
                            item.qty > 0
                              ? `${formatQty(item.qty)}${item.unit ? " " + item.unit : ""}`
                              : "";
                          const sourceTitle =
                            item.sources.length > 0 ? item.sources.join("\n") : undefined;
                          return (
                            <li
                              key={`${item.name}|${item.unit}`}
                              className="flex items-start gap-2 rounded-md border border-surface-border bg-surface-dark/60 px-3 py-2"
                              title={sourceTitle}
                            >
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
                              <div className="min-w-0 flex-1">
                                <span className="text-sm capitalize text-white">{item.name}</span>
                                {qtyStr && (
                                  <span className="ml-1.5 text-xs font-medium text-neon-green">
                                    {qtyStr}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
