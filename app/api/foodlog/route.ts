import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import { extractNutrientJsonFromModelText } from "@/lib/foodlog/extract-nutrient-json";
import {
  formatBloodWorkForNutrientEstimate,
  getPreferredBloodWorkRecord,
} from "@/lib/bloodwork/context-for-ai";
import { buildSupplementNutrients } from "@/lib/supplements/nutrients-from-dose";
import {
  applySupplementMacroOverrides,
  clampSupplementServing,
  hasAnyMacroOverride,
  mergeMappedSupplementMicronutrients,
  type SupplementMacroOverrides,
} from "@/lib/supplements/merge-for-log";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const NUTRIENT_ESTIMATE_PROMPT = `Return ONLY a JSON object with these fields:
{
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "vitamins": { "A_mcg": number, "C_mg": number, "D_mcg": number, "E_mg": number, "K_mcg": number, "B1_mg": number, "B2_mg": number, "B3_mg": number, "B5_mg": number, "B6_mg": number, "B12_mcg": number, "biotin_mcg": number, "folate_mcg": number },
  "minerals": { "calcium_mg": number, "iron_mg": number, "magnesium_mg": number, "zinc_mg": number, "potassium_mg": number, "sodium_mg": number, "selenium_mcg": number, "phosphorus_mg": number, "creatine_g": number }
}

All values are approximate estimates.`;

async function runNutrientModelEstimate(
  userMessage: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const bloodRec = await getPreferredBloodWorkRecord(userId);
  const bloodBlock = formatBloodWorkForNutrientEstimate(bloodRec);
  const bloodPrefix = bloodBlock
    ? `\n\n---\n${bloodBlock}\n---\n\n`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${userMessage}${bloodPrefix}\n${NUTRIENT_ESTIMATE_PROMPT}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  let nutrients: Record<string, unknown> = {};
  if (textBlock && textBlock.type === "text") {
    nutrients = extractNutrientJsonFromModelText(textBlock.text) ?? {};
  }
  return nutrients;
}

async function estimateNutrientsFromDescription(
  description: string,
  userId: string,
): Promise<Record<string, unknown>> {
  return runNutrientModelEstimate(
    `Estimate the nutritional content of: "${description}"`,
    userId,
  );
}

/** Full macros + micros for one supplement dose (oil softgels, powders, gummies, etc.). */
async function estimateSupplementNutrientsFull(
  description: string,
  userId: string,
): Promise<Record<string, unknown>> {
  return runNutrientModelEstimate(
    `Dietary supplement — estimate for ONE serving/dose as described. Include meaningful calories, protein_g, carbs_g, fat_g, and fiber_g when the form includes oil (e.g. fish oil softgel), protein powder, gummy carriers, meal-replacement powder, etc. Pure vitamin/mineral tablets may be very low kcal. All values ~est.\n\n"${description}"`,
    userId,
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Accept client nutrients (meal-plan quick add); drop unknown keys and bound numeric values. */
function sanitizeClientNutrients(
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };
  const cals = num(raw.calories);
  if (cals == null || cals < 0 || cals > 20000) return null;
  const p = num(raw.protein_g);
  const carb = num(raw.carbs_g);
  const f = num(raw.fat_g);
  if (p == null || p < 0 || p > 2000) return null;
  if (carb == null || carb < 0 || carb > 2000) return null;
  if (f == null || f < 0 || f > 2000) return null;

  const out: Record<string, unknown> = {
    calories: cals,
    protein_g: p,
    carbs_g: carb,
    fat_g: f,
  };

  const fib = num(raw.fiber_g);
  if (fib != null && fib >= 0 && fib < 500) out.fiber_g = fib;

  if (isPlainObject(raw.vitamins)) {
    const vit: Record<string, number> = {};
    for (const [k, val] of Object.entries(raw.vitamins)) {
      if (typeof val === "number" && Number.isFinite(val) && val >= 0 && val < 1e8) {
        vit[k] = val;
      }
    }
    if (Object.keys(vit).length > 0) out.vitamins = vit;
  }
  if (isPlainObject(raw.minerals)) {
    const min: Record<string, number> = {};
    for (const [k, val] of Object.entries(raw.minerals)) {
      if (typeof val === "number" && Number.isFinite(val) && val >= 0 && val < 1e9) {
        min[k] = val;
      }
    }
    if (Object.keys(min).length > 0) out.minerals = min;
  }

  return out;
}

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days");
  let days = 7;
  if (daysParam) {
    const n = parseInt(daysParam, 10);
    if (Number.isFinite(n)) days = Math.min(90, Math.max(1, n));
  }

  // Rolling window in ms (not setDate), plus buffer so client local-calendar bucketing
  // (Nutrients: last N local days) still receives rows near window edges / TZ offsets.
  const sinceMs = Date.now() - (days + 3) * 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs);

  const entries = await prisma.foodLogEntry.findMany({
    where: {
      userId: USER_ID,
      loggedAt: { gte: since },
    },
    orderBy: { loggedAt: "desc" },
  });

  const payload = entries.map((e) => ({
    id: e.id,
    userId: e.userId,
    description: e.description,
    mealType: e.mealType,
    entryKind: e.entryKind ?? "food",
    loggedAt: e.loggedAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
    nutrients: e.nutrients === null ? {} : e.nutrients,
  }));

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      description: string;
      mealType: string;
      nutrients?: unknown;
      entryKind?: string;
      supplement?: { kind?: string; amount?: number; unit?: string };
      supplementMacros?: SupplementMacroOverrides;
    };
    const {
      description,
      mealType,
      nutrients: clientNutrients,
      entryKind,
      supplement,
      supplementMacros: rawMacroOver,
    } = body;

    const kind = entryKind === "supplement" ? "supplement" : "food";

    let trimmed = description?.trim() ?? "";
    let nutrients: Record<string, unknown>;

    if (kind === "supplement") {
      const macroOver: SupplementMacroOverrides = isPlainObject(rawMacroOver)
        ? {
            calories:
              typeof rawMacroOver.calories === "number"
                ? rawMacroOver.calories
                : undefined,
            protein_g:
              typeof rawMacroOver.protein_g === "number"
                ? rawMacroOver.protein_g
                : undefined,
            carbs_g:
              typeof rawMacroOver.carbs_g === "number"
                ? rawMacroOver.carbs_g
                : undefined,
            fat_g:
              typeof rawMacroOver.fat_g === "number" ? rawMacroOver.fat_g : undefined,
          }
        : {};
      const hasOver = hasAnyMacroOverride(macroOver);

      let computed: Record<string, unknown> | undefined;

      if (isPlainObject(clientNutrients)) {
        const sanitized = sanitizeClientNutrients(clientNutrients);
        if (sanitized) computed = sanitized;
      }

      if (!computed) {
        if (isPlainObject(supplement)) {
          const k = String(supplement.kind ?? "").trim();
          const amt =
            typeof supplement.amount === "number"
              ? supplement.amount
              : parseFloat(String(supplement.amount ?? ""));
          const u = String(supplement.unit ?? "").trim();
          if (!k || !Number.isFinite(amt) || amt <= 0 || !u) {
            return NextResponse.json(
              {
                error:
                  "Supplement log requires supplement.kind, supplement.amount, and supplement.unit (or a full nutrients object)",
              },
              { status: 400 },
            );
          }
          if (!trimmed) trimmed = `${k} — ${amt} ${u} (supplement)`;
          const mapped = buildSupplementNutrients(k, amt, u);
          let base = await estimateSupplementNutrientsFull(trimmed, USER_ID);
          if (mapped) base = mergeMappedSupplementMicronutrients(base, mapped);
          computed = base;
        } else if (!trimmed) {
          return NextResponse.json(
            { error: "Description or supplement details are required" },
            { status: 400 },
          );
        } else {
          computed = await estimateSupplementNutrientsFull(trimmed, USER_ID);
        }
      }

      if (hasOver) computed = applySupplementMacroOverrides(computed, macroOver);
      nutrients = clampSupplementServing(computed);
    } else {
      if (!trimmed) {
        return NextResponse.json(
          { error: "Description is required" },
          { status: 400 },
        );
      }

      if (isPlainObject(clientNutrients)) {
        const sanitized = sanitizeClientNutrients(clientNutrients);
        if (sanitized) {
          nutrients = sanitized;
        } else {
          nutrients = await estimateNutrientsFromDescription(trimmed, USER_ID);
        }
      } else {
        nutrients = await estimateNutrientsFromDescription(trimmed, USER_ID);
      }
    }

    const entry = await prisma.foodLogEntry.create({
      data: {
        userId: USER_ID,
        description: trimmed,
        mealType: mealType || "Snack",
        entryKind: kind,
        nutrients: nutrients as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Food log error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log food" },
      { status: 500 },
    );
  }
}
