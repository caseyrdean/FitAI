import { NextResponse } from "next/server";
import { getMealPlanForToday } from "@/lib/plan-queries";
import { USER_ID } from "@/lib/user";

/** Plan for the local week that contains today only (no “next future week” fallback). */
export async function GET() {
  const plan = await getMealPlanForToday(USER_ID);
  return NextResponse.json(plan);
}
