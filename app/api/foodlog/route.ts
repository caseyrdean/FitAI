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
  "minerals": { "calcium_mg": number, "iron_mg": number, "magnesium_mg": number, "zinc_mg": number, "potassium_mg": number, "sodium_mg": number, "selenium_mcg": number, "phosphorus_mg": number }
}

All values are approximate estimates.`;

async function estimateNutrientsFromDescription(
  description: string,
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
        content: `Estimate the nutritional content of: "${description}"${bloodPrefix}\n${NUTRIENT_ESTIMATE_PROMPT}`,
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
    };
    const { description, mealType } = body;

    if (!description?.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 },
      );
    }

    const trimmed = description.trim();
    const nutrients = await estimateNutrientsFromDescription(trimmed, USER_ID);

    const entry = await prisma.foodLogEntry.create({
      data: {
        userId: USER_ID,
        description: trimmed,
        mealType: mealType || "Snack",
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
