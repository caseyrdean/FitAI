import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getMealPlanForToday } from "@/lib/plan-queries";
import { USER_ID } from "@/lib/user";
import {
  formatBloodWorkForNutrientEstimate,
  getPreferredBloodWorkRecord,
} from "@/lib/bloodwork/context-for-ai";
import {
  buildCanonicalShoppingListFromMealPlanMeals,
  normalizeMealPlanMeals,
  shoppingListTelemetry,
} from "@/lib/shopping/normalize";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { day, mealType } = (await request.json()) as {
      day: string;
      mealType: string;
    };

    const mealPlan = await getMealPlanForToday(USER_ID);

    if (!mealPlan) {
      return NextResponse.json(
        { error: "No meal plan found for this week" },
        { status: 404 }
      );
    }

    const [profile, bloodRec] = await Promise.all([
      prisma.healthProfile.findUnique({
        where: { userId: USER_ID },
      }),
      getPreferredBloodWorkRecord(USER_ID),
    ]);

    const bloodBlock = formatBloodWorkForNutrientEstimate(bloodRec);
    const bloodSection = bloodBlock
      ? `\nLatest blood work (respect flagged analytes when choosing foods):\n${bloodBlock}\n`
      : "";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Generate a replacement meal for ${day} ${mealType}. 
Current meal plan macro targets: ${JSON.stringify(mealPlan.macroTargets)}
Dietary restrictions: ${profile?.dietaryRestrictions?.join(", ") || "none"}
Food preferences: ${profile?.foodPreferences || "none"}
${bloodSection}
Return ONLY a JSON object with: { "name": "...", "ingredients": [...], "calories": N, "protein_g": N, "carbs_g": N, "fat_g": N, "prepTime": "..." }`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Failed to generate replacement" },
        { status: 500 }
      );
    }

    let newMeal;
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      newMeal = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse meal suggestion" },
        { status: 500 }
      );
    }

    const meals = (mealPlan.meals as Record<string, unknown>) ?? {};
    if (typeof meals === "object") {
      const dayMeals = (meals[day] as Record<string, unknown>) ?? {};
      dayMeals[mealType] = newMeal;
      meals[day] = dayMeals;
    }

    const canonicalMeals = normalizeMealPlanMeals(meals as Record<string, unknown>);
    const canonicalShoppingList =
      buildCanonicalShoppingListFromMealPlanMeals(canonicalMeals);

    await prisma.mealPlan.update({
      where: { id: mealPlan.id },
      data: {
        meals: canonicalMeals as object,
        shoppingList: canonicalShoppingList as object,
      },
    });

    return NextResponse.json({
      success: true,
      newMeal,
      planId: mealPlan.id,
      shoppingTelemetry: shoppingListTelemetry(canonicalShoppingList),
    });
  } catch (error) {
    console.error("Meal swap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Swap failed" },
      { status: 500 }
    );
  }
}
