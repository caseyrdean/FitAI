import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalShoppingListFromMealPlanMeals,
  normalizeIngredientName,
  normalizeMealPlanMeals,
} from "@/lib/shopping/normalize";

test("normalizes ingredient variants to same canonical name", () => {
  assert.equal(normalizeIngredientName("Scallions"), "green onion");
  assert.equal(normalizeIngredientName("spring onion"), "green onion");
});

test("deduplicates near-duplicate shopping items from normalized meals", () => {
  const meals = normalizeMealPlanMeals({
    Sunday: {
      Breakfast: { ingredients: ["2 slice wheat toast1", "1 tbsp mayo"] },
      Lunch: { ingredients: ["2 slices wheat toast", "1 tbsp mayonnaise"] },
    },
  });
  const shopping = buildCanonicalShoppingListFromMealPlanMeals(meals);
  const all = shopping.flatMap((c) => c.items);
  const toastRows = all.filter((i) => i.name.includes("wheat toast"));
  assert.equal(toastRows.length, 1);
});

test("places core ingredients into canonical categories", () => {
  const meals = normalizeMealPlanMeals({
    Sunday: {
      Breakfast: {
        ingredients: ["6 oz chicken breast", "1 cup spinach", "1 tbsp olive oil"],
      },
    },
  });
  const shopping = buildCanonicalShoppingListFromMealPlanMeals(meals);
  const labels = shopping.map((c) => c.label);
  assert.ok(labels.includes("Protein"));
  assert.ok(labels.includes("Vegetables"));
  assert.ok(labels.includes("Nuts, Seeds & Oils"));
});

test("collapses malformed pineapple variants into one merged line", () => {
  const meals = normalizeMealPlanMeals({
    Sunday: {
      Breakfast: {
        ingredients: [
          "fresh pineapple8½ cup",
          "fresh pineapple chunk½ cup",
          "fresh pineapple, diced½ cup",
        ],
      },
    },
  });
  const shopping = buildCanonicalShoppingListFromMealPlanMeals(meals);
  const all = shopping.flatMap((c) => c.items);
  const pineapple = all.filter((i) => i.name === "pineapple");
  assert.equal(pineapple.length, 1);
  assert.equal(pineapple[0]?.unit, "cup");
  assert.equal(pineapple[0]?.qty, 9.5);
});

test("classifies common shopping items from sample list away from Other", () => {
  const meals = normalizeMealPlanMeals({
    Sunday: {
      Dinner: {
        ingredients: [
          "ahi tuna fillet8 oz",
          "asparagus3 cup",
          "baking powder1 tsp",
          "buckwheat flour1/2 cup",
          "cooked couscous3/4 cup",
          "coconut water1 cup",
          "papaya3/2 cup",
          "sesame oil4 tbsp",
          "low-sodium soy sauce3 tbsp",
          "brussels sprout3/2 cup",
          "zucchini3 cup",
          "salmon fillet8 oz",
        ],
      },
    },
  });
  const shopping = buildCanonicalShoppingListFromMealPlanMeals(meals);
  const other = shopping.find((c) => c.label === "Other");
  const otherNames = new Set((other?.items ?? []).map((i) => i.name));
  assert.equal(otherNames.has("ahi tuna"), false);
  assert.equal(otherNames.has("salmon"), false);
  assert.equal(otherNames.has("asparagus"), false);
  assert.equal(otherNames.has("baking powder"), false);
  assert.equal(otherNames.has("buckwheat flour"), false);
  assert.equal(otherNames.has("couscous"), false);
  assert.equal(otherNames.has("coconut water"), false);
  assert.equal(otherNames.has("papaya"), false);
  assert.equal(otherNames.has("sesame oil"), false);
  assert.equal(otherNames.has("soy sauce"), false);
});
