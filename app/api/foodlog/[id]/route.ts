import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import { extractNutrientJsonFromModelText } from "@/lib/foodlog/extract-nutrient-json";
import {
  formatBloodWorkForNutrientEstimate,
  getPreferredBloodWorkRecord,
} from "@/lib/bloodwork/context-for-ai";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = params;
  const body = (await request.json()) as {
    description?: string;
    mealType?: string;
    loggedAt?: string;
    // When provided, use these directly — no re-estimation
    calories?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  };

  const existing = await prisma.foodLogEntry.findFirst({
    where: { id, userId: USER_ID },
  });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const newDescription = body.description?.trim() ?? existing.description;
  const newMealType = body.mealType ?? existing.mealType;
  const newLoggedAt = body.loggedAt ? new Date(body.loggedAt) : existing.loggedAt;

  const manualMacros =
    body.calories != null ||
    body.protein_g != null ||
    body.carbs_g != null ||
    body.fat_g != null;

  const existingNutrients =
    typeof existing.nutrients === "object" && existing.nutrients !== null
      ? (existing.nutrients as Record<string, unknown>)
      : {};

  let nutrients: Record<string, unknown> = { ...existingNutrients };

  if (manualMacros) {
    // Merge manual macro overrides directly into nutrients
    if (body.calories != null) nutrients.calories = body.calories;
    if (body.protein_g != null) nutrients.protein_g = body.protein_g;
    if (body.carbs_g != null) nutrients.carbs_g = body.carbs_g;
    if (body.fat_g != null) nutrients.fat_g = body.fat_g;
  } else if (body.description && body.description.trim() !== existing.description) {
    // Description changed and no manual macros — re-estimate
    try {
      const bloodRec = await getPreferredBloodWorkRecord(USER_ID);
      const bloodBlock = formatBloodWorkForNutrientEstimate(bloodRec);
      const bloodPrefix = bloodBlock
        ? `\n\n---\n${bloodBlock}\n---\n\n`
        : "";

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Estimate the nutritional content of: "${newDescription}"${bloodPrefix}

Return ONLY a JSON object with these fields:
{
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "vitamins": { "A_mcg": number, "C_mg": number, "D_mcg": number, "E_mg": number, "K_mcg": number, "B1_mg": number, "B2_mg": number, "B3_mg": number, "B5_mg": number, "B6_mg": number, "B12_mcg": number, "biotin_mcg": number, "folate_mcg": number },
  "minerals": { "calcium_mg": number, "iron_mg": number, "magnesium_mg": number, "zinc_mg": number, "potassium_mg": number, "sodium_mg": number, "selenium_mcg": number, "phosphorus_mg": number }
}

All values are approximate estimates.`,
          },
        ],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock?.type === "text") {
        const parsed = extractNutrientJsonFromModelText(textBlock.text);
        if (parsed) nutrients = parsed;
      }
    } catch {
      // keep existing nutrients on failure
    }
  }

  const updated = await prisma.foodLogEntry.update({
    where: { id },
    data: {
      description: newDescription,
      mealType: newMealType,
      loggedAt: newLoggedAt,
      nutrients: nutrients as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = params;

  const existing = await prisma.foodLogEntry.findFirst({
    where: { id, userId: USER_ID },
  });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await prisma.foodLogEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
