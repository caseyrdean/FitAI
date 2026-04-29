import { prisma } from "@/lib/db/client";
import { getPreferredBloodWorkRecord } from "@/lib/bloodwork/context-for-ai";
import { PARSE_BLOOD_WORK_TOOL_SCHEMA_DETAILS } from "@/lib/bloodwork/lab-table-schema";
import { persistMarkersForRecord } from "@/lib/bloodwork/persist-markers";
import { formatLocalWeekRangeLabel, parseWeekStartToLocalSunday } from "@/lib/local-week";
import {
  buildCanonicalShoppingListFromMealPlanMeals,
  normalizeMealPlanMeals,
  shoppingCategoryLabels,
} from "@/lib/shopping/normalize";
import { sanitizeSupplementAdviceItems } from "@/lib/supplements/sanitize-advice";
import { mergeMemory, normalizeMemory } from "@/lib/memory/merge";
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolResult {
  content: string;
  isError?: boolean;
  shouldStop?: boolean;
  refreshTarget?:
    | "meals"
    | "workouts"
    | "bloodwork"
    | "progress"
    | "supplements"
    | "profile"
    | "analytics"
    | "notifications"
    | "dashboard";
  /** When set, all listed targets are refreshed (overrides `refreshTarget`). */
  refreshTargets?: (
    | "meals"
    | "workouts"
    | "bloodwork"
    | "progress"
    | "supplements"
    | "profile"
    | "analytics"
    | "notifications"
    | "dashboard"
  )[];
}

export type AtlasTool = {
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>, userId: string) => Promise<ToolResult>;
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const estimateNutrition: AtlasTool = {
  definition: {
    name: "estimate_nutrition",
    description:
      "Estimate the nutritional content of a food item based on its description. Returns approximate macronutrients, vitamins, and minerals. All values are estimates (~est.), not lab-certified.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "Description of the food item (e.g., '2 scrambled eggs with toast')",
        },
        servingSize: {
          type: "string",
          description: "Optional serving size specification (e.g., '1 cup', '200g')",
        },
      },
      required: ["description"],
    },
  },
  async execute(input) {
    // Atlas itself generates the nutrition estimate via the LLM — this tool is a
    // structured way for the model to declare its estimate. The model fills in the
    // values; we simply return them formatted for storage.
    return {
      content: JSON.stringify({
        note: "Please provide your nutritional estimate for this food in your response. Include calories, protein_g, carbs_g, fat_g, fiber_g, and a vitamins/minerals breakdown. Mark all values as approximate (~est.).",
        description: input.description,
        servingSize: input.servingSize || "standard serving",
      }),
    };
  },
};

const generateMealPlan: AtlasTool = {
  definition: {
    name: "generate_meal_plan",
    description:
      "Generate a complete weekly meal plan and save it to the database. " +
      "Use after weekly check-ins and whenever the user needs a new week: **shoppingList** and **prepGuide** must match the new **meals** (regenerate both; do not reuse an old list). " +
      "BLOOD WORK + USER UPDATES: Before setting macroTargets and meals, read **Latest blood panels** in context and fold in anything the user just said in this conversation (check-in, preferences, adherence). Prioritize **flagged** analytes and follow the 'How to use these labs' guidance (lipids, glucose, sodium, etc.). " +
      "CRITICAL CALORIE RULE: macroTargets contains the TOTAL daily budget. " +
      "The calories/macros for each individual meal (Breakfast, Lunch, Dinner, Snack) must be a PORTION of that daily total — " +
      "they must sum to approximately the daily target, NOT each equal it. " +
      "MACRO PRIORITY: Per day, stay **at or under fat_g** in macroTargets whenever possible—do not pad missing calories with extra fat. " +
      "If calories are still short, add **protein first** (lean), then carbs; increase fat only as a last resort and still prefer staying under the fat cap. " +
      "For example if the daily target is 2000 kcal, a reasonable split is: Breakfast 450, Lunch 600, Dinner 700, Snack 250. " +
      "NEVER assign the full day's calorie target to a single meal. " +
      "IMPORTANT: meals must be keyed by full day name (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday) " +
      "and each day must contain meal type keys (Breakfast, Lunch, Dinner, Snack) with object values — NOT plain strings. " +
      "Every meal's ingredients array must include quantities and units (e.g. '1/2 cup rolled oats', '150g chicken breast', '1 tbsp olive oil'). Never list an ingredient without a measurement. " +
      "Ingredient text must use the BASE food name only: '1 cup carrots' not 'roasted carrots', '1/2 cup peaches' not 'peaches in juice', '2 tbsp olive oil' not 'extra virgin olive oil'. Omit cooking method and packing medium from the ingredient line. " +
      "DUPLICATE-AUDIT RULE: Before finalizing output, scan the full week's ingredients and shopping list, merge near-duplicates caused by wording/style differences, and normalize each line to canonical base names + stable units. Always deduplicate to the best of your ability. " +
      "SUPPLEMENTS: After planning meals, include **supplementRecommendations** (and **supplementSummary**) whenever diet gaps or labs warrant supplementation. **Weight flagged blood work heavily** (e.g. low vitamin D, iron, B12, ferritin trends). **Dosing for the Supplements tab:** **amount** = quantity for **one intake** (one capsule, one scoop) — **never** a weekly or multi-day total; **frequency** states how often (daily, twice daily, 3×/week). This avoids users misreading a dose as daily when it was weekly (overdose risk). Each row must include **frequency** when possible. Use **generic forms and doses only** — never retail brand names. " +
      "weekStart: YYYY-MM-DD for any day in the target week (Sunday–Saturday). It is normalized to that week's Sunday in the user's local calendar. Use the correct year (e.g. 2026-03-29 for the week containing March 29).",
    input_schema: {
      type: "object" as const,
      properties: {
        weekStart: {
          type: "string",
          description:
            "Start date of the week in ISO 8601 format YYYY-MM-DD. Must use the correct 4-digit year.",
        },
        meals: {
          type: "object",
          description:
            'Object keyed by day name (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday), ' +
            'each containing meal types (Breakfast, Lunch, Dinner, Snack) as objects with: ' +
            'name (string), calories (number), protein_g (number), carbs_g (number), fat_g (number), fiber_g (number, ~est.), ' +
            'vitamins (object, ~est. for THIS meal only — same keys as food log: A_mcg, C_mg, D_mcg, E_mcg, K_mcg, B1_mg, B2_mg, B3_mg, B5_mg, B6_mg, B12_mcg, biotin_mcg, folate_mcg), ' +
            'minerals (object, ~est.: calcium_mg, iron_mg, magnesium_mg, zinc_mg, potassium_mg, sodium_mg, selenium_mcg, phosphorus_mg), ' +
            'ingredients (array — each string MUST include quantity+unit; use base ingredient names only e.g. "6 oz salmon", "1 cup carrot", "1/2 cup peach", "1 tbsp olive oil" — no "roasted", "in juice", "extra virgin" in the ingredient text), ' +
            'prepTime (string). ' +
            'Every meal MUST include fiber_g, vitamins, and minerals so each planned meal is nutritionally complete in the plan. ' +
            'Before returning, run a duplicate audit over all ingredient strings and normalize near-duplicate wording to canonical grocery names. ' +
            'Example: {"Sunday":{"Breakfast":{"name":"Oatmeal","calories":380,"protein_g":14,"carbs_g":65,"fat_g":8,"fiber_g":6,"vitamins":{"A_mcg":0,"C_mg":8,"D_mcg":0,"E_mg":2,"K_mcg":2,"B1_mg":0.3,"B2_mg":0.2,"B3_mg":2,"B5_mg":0.5,"B6_mg":0.1,"B12_mcg":0,"biotin_mcg":8,"folate_mcg":35},"minerals":{"calcium_mg":180,"iron_mg":2,"magnesium_mg":80,"zinc_mg":1.5,"potassium_mg":350,"sodium_mg":120,"selenium_mcg":12,"phosphorus_mg":180},"ingredients":["1/2 cup rolled oats","1 cup blueberries","1 tbsp honey"],"prepTime":"5 min"}}}',
        },
        shoppingList: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: shoppingCategoryLabels() },
              items: { type: "array", items: { type: "string" } },
            },
          },
          description:
            "Shopping list organized by canonical categories only: Protein, Dairy & Alternatives, Grains & Bread, Vegetables, Fruit, Nuts, Seeds & Oils, Condiments & Spices, Other. Items must be deduplicated and normalized.",
        },
        macroTargets: {
          type: "object",
          description: "Daily macro targets",
          properties: {
            calories: { type: "number" },
            protein_g: { type: "number" },
            carbs_g: { type: "number" },
            fat_g: { type: "number" },
          },
          required: ["calories", "protein_g", "carbs_g", "fat_g"],
        },
        prepGuide: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task: { type: "string" },
              time: { type: "string" },
            },
          },
          description: "Meal prep instructions with time estimates",
        },
        supplementRecommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              supplementKind: {
                type: "string",
                description:
                  "Generic form only, e.g. Cholecalciferol (vitamin D3), ferrous bisglycinate — never a retail brand",
              },
              amount: {
                type: "number",
                description:
                  "Dose for **one intake** (one pill/scoop/serving). NOT a weekly total, NOT 7× daily — use frequency for cadence.",
              },
              unit: {
                type: "string",
                description: "IU, mg, mcg, or g — applies to the single **amount** above (one intake)",
              },
              frequency: {
                type: "string",
                description:
                  "How often that **amount** is taken: e.g. once daily, twice daily, 3× per week. Required for safe interpretation (daily vs weekly regimens).",
              },
              timing: {
                type: "string",
                description: "Optional, e.g. with largest meal, morning, split doses",
              },
              rationale: {
                type: "string",
                description: "Why — reference diet gaps and/or specific lab markers (~est.)",
              },
              drivers: {
                type: "array",
                items: { type: "string" },
                description: "Optional tags: diet_gap, bloodwork, both",
              },
            },
            required: ["supplementKind", "amount", "unit", "rationale"],
          },
          description:
            "Recommended supplements to close gaps the meal plan does not fully cover. **Prioritize flagged blood panels.** **amount** = per single intake; **frequency** = how often — never weekly aggregate in amount. Generic types only — no brand names.",
        },
        supplementSummary: {
          type: "string",
          description:
            "Short paragraph: how these fit the plan and labs. Remind that listed **amount**s are **per intake** with **frequency** (not weekly totals) (~est., not medical prescription).",
        },
        notes: {
          type: "string",
          description: "Optional notes about the plan",
        },
      },
      required: ["weekStart", "meals", "shoppingList", "macroTargets", "prepGuide"],
    },
  },
  async execute(input, userId) {
    // Validate that every ingredient has a measurement before saving.
    // A measurement must contain a digit, fraction, or common unit word.
    const MEASUREMENT_RE =
      /\d|¼|½|¾|⅓|⅔|⅛|⅜|⅝|⅞|\b(cup|tbsp|tsp|oz|g|kg|ml|l|lb|piece|slice|handful|pinch|scoop|serving|portion|medium|large|small|whole|can|pack|sheet|sprig|clove|head|bunch)/i;

    // Auto-fix any ingredients missing a measurement rather than rejecting.
    // This avoids retry loops while still ensuring every ingredient shows a quantity.
    const mealsObj = input.meals as Record<string, Record<string, unknown>>;
    const autoFixed: string[] = [];

    for (const [day, dayMeals] of Object.entries(mealsObj)) {
      if (typeof dayMeals !== "object" || dayMeals === null) continue;
      for (const [mealType, meal] of Object.entries(dayMeals)) {
        if (typeof meal !== "object" || meal === null) continue;
        const mealObj = meal as Record<string, unknown>;
        const ingredients = mealObj.ingredients;
        if (!Array.isArray(ingredients)) continue;
        mealObj.ingredients = ingredients.map((ing) => {
          if (typeof ing === "string" && !MEASUREMENT_RE.test(ing)) {
            autoFixed.push(`${day} ${mealType}: "${ing}"`);
            return `1 serving ${ing}`;
          }
          return ing;
        });
      }
    }

    const canonicalMeals = normalizeMealPlanMeals(mealsObj);
    const canonicalShoppingList =
      buildCanonicalShoppingListFromMealPlanMeals(canonicalMeals);
    const now = new Date();
    let weekStartDate = parseWeekStartToLocalSunday(String(input.weekStart), now);
    // #region agent log
    fetch('http://127.0.0.1:7702/ingest/8b876957-51d4-454d-9a7e-692ba8eff35d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08b46b'},body:JSON.stringify({sessionId:'08b46b',runId:'initial',hypothesisId:'H1',location:'lib/atlas/tools.ts:generateMealPlan:week-normalize',message:'generate_meal_plan normalized weekStart',data:{requestedWeekStart:input.weekStart,normalizedWeekStart:localDateKey(weekStartDate),currentWeekStart:localDateKey(parseWeekStartToLocalSunday(localDateKey(now), now))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (now.getFullYear() - weekStartDate.getFullYear() > 1) {
      const bumped = new Date(weekStartDate);
      bumped.setFullYear(now.getFullYear());
      weekStartDate = parseWeekStartToLocalSunday(
        `${bumped.getFullYear()}-${String(bumped.getMonth() + 1).padStart(2, "0")}-${String(bumped.getDate()).padStart(2, "0")}`,
        now,
      );
    }

    const rangeEnd = new Date(weekStartDate);
    rangeEnd.setDate(weekStartDate.getDate() + 7);

    const existing = await prisma.mealPlan.findFirst({
      where: {
        userId,
        weekStart: { gte: weekStartDate, lt: rangeEnd },
      },
    });

    let plan;
    if (existing) {
      plan = await prisma.mealPlan.update({
        where: { id: existing.id },
        data: {
          weekStart: weekStartDate,
          meals: canonicalMeals as object,
          shoppingList: canonicalShoppingList as object,
          macroTargets: input.macroTargets as object,
          prepGuide: input.prepGuide as object,
        },
      });
    } else {
      plan = await prisma.mealPlan.create({
        data: {
          userId,
          weekStart: weekStartDate,
          meals: canonicalMeals as object,
          shoppingList: canonicalShoppingList as object,
          macroTargets: input.macroTargets as object,
          prepGuide: input.prepGuide as object,
        },
      });
    }
    // #region agent log
    fetch('http://127.0.0.1:7702/ingest/8b876957-51d4-454d-9a7e-692ba8eff35d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08b46b'},body:JSON.stringify({sessionId:'08b46b',runId:'initial',hypothesisId:'H2',location:'lib/atlas/tools.ts:generateMealPlan:saved',message:'generate_meal_plan persisted plan',data:{planId:plan.id,savedWeekStart:localDateKey(weekStartDate),usedExisting:!!existing,userId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const bloodRec = await getPreferredBloodWorkRecord(userId);
    const flaggedLabs = (bloodRec?.markers ?? []).filter((m) => m.flagged);
    const bloodWorkEcho =
      flaggedLabs.length > 0
        ? `User's latest structured labs include ${flaggedLabs.length} flagged analyte(s) (e.g. ${flaggedLabs
            .slice(0, 4)
            .map((m) => `${m.name} ${m.value} ${m.unit}`)
            .join("; ")}). Confirm in your reply that the saved plan aligns with those markers (fiber, fat quality, sodium, carbs, etc.).`
        : undefined;

    let supplementRefreshed = false;
    if (input.supplementRecommendations !== undefined) {
      const { items, valid } = sanitizeSupplementAdviceItems(
        input.supplementRecommendations,
      );
      if (valid) {
        const summary =
          typeof input.supplementSummary === "string"
            ? input.supplementSummary.slice(0, 4000)
            : "";
        await prisma.supplementAdvice.upsert({
          where: { userId },
          create: {
            userId,
            weekStart: weekStartDate,
            items,
            summary,
          },
          update: {
            weekStart: weekStartDate,
            items,
            summary,
          },
        });
        supplementRefreshed = true;
      }
    }

    return {
      content: JSON.stringify({
        success: true,
        planId: plan.id,
        message: `Meal plan saved for ${formatLocalWeekRangeLabel(weekStartDate)}`,
        normalizedWeekStartLocal: localDateKey(weekStartDate),
        ...(bloodWorkEcho && { bloodWorkEcho }),
        ...(autoFixed.length > 0 && {
          warning: `${autoFixed.length} ingredient(s) were missing measurements and defaulted to "1 serving". Ingredients and shopping list were canonicalized before saving.`,
          autoFixed,
        }),
        ...(supplementRefreshed && {
          supplementsNote: "Supplement recommendations were saved to the Supplements tab.",
        }),
      }),
      refreshTargets: supplementRefreshed
        ? ["meals", "supplements", "dashboard"]
        : ["meals", "dashboard"],
    };
  },
};

const saveSupplementPlan: AtlasTool = {
  definition: {
    name: "save_supplement_plan",
    description:
      "Save the user's supplement recommendation list. Use when nutrition gaps or labs call for supplementation without a full meal-plan regen, or when the user focuses on supplements. " +
      "**Strongly weight flagged blood markers** from Latest blood panels. Tie recommendations to meal-plan and log gaps. " +
      "**Generic supplement forms and amounts only** — never retail brand or product names. " +
      "**amount** must be **per single intake** (one dose); **never** weekly or multi-day totals. Include **frequency** on each item (e.g. once daily, twice daily, 3×/week) so daily exposure is unambiguous and overdose risk is reduced. " +
      "The user can log supplements on the meal log; those entries roll into micronutrient totals.",
    input_schema: {
      type: "object" as const,
      properties: {
        weekStart: {
          type: "string",
          description: "Optional YYYY-MM-DD for the plan week (normalized to Sunday); stored for reference",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              supplementKind: { type: "string" },
              amount: {
                type: "number",
                description: "Per **one** intake — not a weekly total",
              },
              unit: { type: "string", description: "Unit for that single intake amount" },
              frequency: {
                type: "string",
                description: "e.g. once daily, twice daily, 3× per week — include whenever possible",
              },
              timing: { type: "string" },
              rationale: { type: "string" },
              drivers: { type: "array", items: { type: "string" } },
            },
            required: ["supplementKind", "amount", "unit", "rationale"],
          },
          description:
            "Each row: generic kind, **amount per intake**, unit, rationale; **frequency** for cadence (not weekly totals). Optional timing and drivers.",
        },
        summary: {
          type: "string",
          description:
            "Short overview for the Supplements tab; state that amounts are **per intake** with **frequency** (not weekly aggregates)",
        },
      },
      required: ["items"],
    },
  },
  async execute(input, userId) {
    const { items, valid } = sanitizeSupplementAdviceItems(input.items);
    if (!valid) {
      return {
        content: JSON.stringify({
          success: false,
          message:
            "No valid rows. Each item needs supplementKind, a positive amount, unit, and rationale (generic forms only, no brands).",
        }),
        isError: true,
      };
    }

    let weekStartDate: Date | null = null;
    if (input.weekStart) {
      weekStartDate = parseWeekStartToLocalSunday(String(input.weekStart), new Date());
    }
    const summary =
      typeof input.summary === "string" ? input.summary.slice(0, 4000) : "";

    await prisma.supplementAdvice.upsert({
      where: { userId },
      create: {
        userId,
        weekStart: weekStartDate,
        items,
        summary,
      },
      update: {
        ...(weekStartDate ? { weekStart: weekStartDate } : {}),
        items,
        summary,
      },
    });

    return {
      content: JSON.stringify({
        success: true,
        message: `Saved ${items.length} supplement recommendation(s).`,
      }),
      refreshTargets: ["supplements", "dashboard"],
    };
  },
};

const parseBloodWork: AtlasTool = {
  definition: {
    name: "parse_blood_work",
    description:
      "Parse lab PDF/table into markers. Source layout: Analyte | Value | Reference Range | Flag columns under panel headers (category). " +
      PARSE_BLOOD_WORK_TOOL_SCHEMA_DETAILS +
      " Each table DATA row = one marker; include all rows with numeric values. " +
      "Server sets flagged from labFlag (H/L), reference range, and borderline rules.",
    input_schema: {
      type: "object" as const,
      properties: {
        recordId: {
          type: "string",
          description: "The BloodWorkRecord ID to attach markers to",
        },
        markers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: 'Panel/section title from the lab PDF, e.g. "Lipid Panel, Standard"',
              },
              name: {
                type: "string",
                description:
                  'Full test name from that table row only, verbatim (e.g. "Cholesterol, Total", "Glucose, Fasting")',
              },
              value: { type: "number" },
              unit: { type: "string" },
              referenceMin: { type: "number", description: "Lower ref bound; omit if open upward" },
              referenceMax: { type: "number", description: "Upper ref bound; omit if open downward" },
              labFlag: {
                type: "string",
                description:
                  'Lab Flag column for this row only: "H", "L", "HH", "LL", High, Low, or empty if none',
              },
              documentFlagsRisk: {
                type: "boolean",
                description:
                  "True if labFlag is H/L or line shows *, abnormal, critical (server also flags from labFlag)",
              },
              flagged: {
                type: "boolean",
                description: "Optional; server recomputes from reference + 10% borderline rules",
              },
            },
            required: ["category", "name", "value", "unit"],
          },
          description: "Array of parsed blood work markers",
        },
      },
      required: ["recordId", "markers"],
    },
  },
  async execute(input) {
    const markers = input.markers as unknown[];

    const { persisted, flaggedCount } = await persistMarkersForRecord(
      input.recordId as string,
      markers,
    );

    if (persisted === 0) {
      return {
        content: JSON.stringify({
          success: false,
          message:
            "No markers were saved — check category, name, numeric value, and unit on each row.",
        }),
        isError: true,
      };
    }

    await prisma.bloodWorkRecord.update({
      where: { id: input.recordId as string },
      data: { parsedAt: new Date() },
    });

    return {
      content: JSON.stringify({
        success: true,
        totalMarkers: persisted,
        flaggedMarkers: flaggedCount,
        message: `Parsed ${persisted} markers, ${flaggedCount} flagged`,
      }),
      refreshTargets: ["bloodwork", "dashboard"],
    };
  },
};

const generateWorkoutPlan: AtlasTool = {
  definition: {
    name: "generate_workout_plan",
    description:
      "Generate a complete weekly workout plan with exercises for each day. Saves directly to the database. " +
      "After weekly check-ins, call this for the **current** local week alongside an updated meal plan. " +
      "Read **Latest blood panels** in user context (recovery, energy, flagged markers) and the user's check-in message; adjust volume, intensity, and focus accordingly (general fitness only — not medical clearance).",
    input_schema: {
      type: "object" as const,
      properties: {
        weekStart: {
          type: "string",
          description:
            "YYYY-MM-DD for any day in the target week; normalized to that week's Sunday (local). Same convention as meal plans.",
        },
        days: {
          type: "array",
          items: { type: "object" },
          description: "Array of workout day objects with exercises, sets, reps, rest periods",
        },
        notes: {
          type: "string",
          description: "Optional notes about the plan",
        },
      },
      required: ["weekStart", "days"],
    },
  },
  async execute(input, userId) {
    const weekStart = parseWeekStartToLocalSunday(String(input.weekStart), new Date());
    // #region agent log
    fetch('http://127.0.0.1:7702/ingest/8b876957-51d4-454d-9a7e-692ba8eff35d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08b46b'},body:JSON.stringify({sessionId:'08b46b',runId:'initial',hypothesisId:'H2',location:'lib/atlas/tools.ts:generateWorkoutPlan:week-normalize',message:'generate_workout_plan normalized weekStart',data:{requestedWeekStart:input.weekStart,normalizedWeekStart:localDateKey(weekStart)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const plan = await prisma.workoutPlan.create({
      data: {
        userId,
        weekStart,
        days: input.days as object,
      },
    });
    return {
      content: JSON.stringify({
        success: true,
        planId: plan.id,
        message: `Workout plan created for ${formatLocalWeekRangeLabel(weekStart)}`,
        normalizedWeekStartLocal: localDateKey(weekStart),
      }),
      refreshTargets: ["workouts", "dashboard"],
    };
  },
};

const webSearch: AtlasTool = {
  definition: {
    name: "web_search",
    description:
      "Search the web for recent nutrition, health, or fitness research. Only use when you need up-to-date information not in your training data.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query for nutrition/health research",
        },
      },
      required: ["query"],
    },
  },
  async execute(input) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content: JSON.stringify({
          note: "Web search is currently unavailable (no Tavily API key configured). Please proceed with your existing knowledge.",
        }),
      };
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: 5,
          include_answer: true,
          search_depth: "advanced",
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API returned ${response.status}`);
      }

      const data = await response.json();
      return {
        content: JSON.stringify({
          answer: data.answer,
          results: data.results?.map(
            (r: { title: string; url: string; content: string }) => ({
              title: r.title,
              url: r.url,
              snippet: r.content?.slice(0, 300),
            })
          ),
        }),
      };
    } catch (error) {
      return {
        content: JSON.stringify({
          note: `Web search failed: ${error instanceof Error ? error.message : "unknown error"}. Please proceed with your existing knowledge.`,
        }),
      };
    }
  },
};

const updateHealthProfile: AtlasTool = {
  definition: {
    name: "update_health_profile",
    description:
      "Update the user's health profile. Used during onboarding and check-ins to save preferences, goals, conditions, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        goals: { type: "string", description: "Health and fitness goals" },
        fitnessLevel: {
          type: "string",
          description: "Current fitness level (beginner, intermediate, advanced)",
        },
        conditions: {
          type: "array",
          items: { type: "string" },
          description: "Medical conditions",
        },
        injuries: {
          type: "array",
          items: { type: "string" },
          description: "Current injuries",
        },
        dietaryRestrictions: {
          type: "array",
          items: { type: "string" },
          description: "Dietary restrictions and allergies",
        },
        foodPreferences: {
          type: "string",
          description: "Food likes, dislikes, cuisine preferences",
        },
        onboardingComplete: {
          type: "boolean",
          description: "Set to true after onboarding is finished",
        },
      },
    },
  },
  async execute(input, userId) {
    const data: Record<string, unknown> = {};
    if (input.goals !== undefined) data.goals = input.goals;
    if (input.fitnessLevel !== undefined) data.fitnessLevel = input.fitnessLevel;
    if (input.conditions !== undefined) data.conditions = input.conditions;
    if (input.injuries !== undefined) data.injuries = input.injuries;
    if (input.dietaryRestrictions !== undefined)
      data.dietaryRestrictions = input.dietaryRestrictions;
    if (input.foodPreferences !== undefined)
      data.foodPreferences = input.foodPreferences;
    if (input.onboardingComplete !== undefined)
      data.onboardingComplete = input.onboardingComplete;

    await prisma.healthProfile.update({
      where: { userId },
      data,
    });

    return {
      content: JSON.stringify({
        success: true,
        message: "Health profile updated",
        updatedFields: Object.keys(data),
      }),
      refreshTargets: ["profile", "dashboard", "meals", "workouts", "supplements", "progress"],
    };
  },
};

const updatePersonalizationMemory: AtlasTool = {
  definition: {
    name: "update_personalization_memory",
    description:
      "Store long-lived personalization memory Atlas should remember across sessions (likes/dislikes, schedule constraints, prep limits, workout preferences, communication style). Use when confidence is high and the preference is stable.",
    input_schema: {
      type: "object" as const,
      properties: {
        memory: {
          type: "object",
          description:
            "Full normalized memory object. Buckets: foodLikes, foodDislikes, scheduleConstraints, prepBudgetTime, workoutPreferences, adherenceFriction, communicationStyle. Each item shape: { value, confidence?, source? }",
        },
        eventType: {
          type: "string",
          description: "Optional event label, e.g. atlas_inferred_preference",
        },
      },
      required: ["memory"],
    },
  },
  async execute(input, userId) {
    const patch = normalizeMemory(input.memory);
    const existing = await prisma.personalizationMemory.findUnique({
      where: { userId },
    });
    const row = existing
      ? await prisma.personalizationMemory.update({
          where: { userId },
          data: {
            memory: mergeMemory(existing.memory, patch) as object,
            updatedBy: "atlas",
            version: existing.version + 1,
          },
        })
      : await prisma.personalizationMemory.create({
          data: {
            userId,
            memory: patch as object,
            updatedBy: "atlas",
            version: 1,
          },
        });
    await prisma.personalizationMemoryEvent.create({
      data: {
        userId,
        personalizationMemoryId: row.id,
        updatedBy: "atlas",
        eventType:
          typeof input.eventType === "string" && input.eventType.trim().length > 0
            ? input.eventType
            : "atlas_memory_update",
        payload: patch as object,
      },
    });
    return {
      content: JSON.stringify({
        success: true,
        message: "Personalization memory updated",
        version: row.version,
      }),
      refreshTargets: ["profile", "dashboard"],
    };
  },
};

const flagUnsafeCondition: AtlasTool = {
  definition: {
    name: "flag_unsafe_condition",
    description:
      "Flag an unsafe medical condition that Atlas cannot safely advise on. Stops the current conversation flow and redirects to professional help. MUST be called for: Type 1 diabetes, active eating disorders, renal disease.",
    input_schema: {
      type: "object" as const,
      properties: {
        condition: {
          type: "string",
          description: "The medical condition detected",
        },
        message: {
          type: "string",
          description: "A compassionate message redirecting to professional help",
        },
      },
      required: ["condition", "message"],
    },
  },
  async execute(input) {
    return {
      content: JSON.stringify({
        flagged: true,
        condition: input.condition,
        message: input.message,
        action:
          "This condition requires guidance from a licensed healthcare professional. Atlas cannot safely provide nutrition or exercise advice for this condition.",
      }),
      shouldStop: true,
    };
  },
};

export const ATLAS_TOOLS: AtlasTool[] = [
  estimateNutrition,
  generateMealPlan,
  saveSupplementPlan,
  parseBloodWork,
  generateWorkoutPlan,
  webSearch,
  updateHealthProfile,
  updatePersonalizationMemory,
  flagUnsafeCondition,
];

export const TOOL_DEFINITIONS = ATLAS_TOOLS.map((t) => t.definition);

export function getToolByName(name: string): AtlasTool | undefined {
  return ATLAS_TOOLS.find((t) => t.definition.name === name);
}
