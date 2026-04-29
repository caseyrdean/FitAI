import { NextRequest, NextResponse } from "next/server";
import { upsertWeeklyScore } from "@/lib/analytics/weekly-score";
import { USER_ID } from "@/lib/user";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { weekStart?: string };
  const row = await upsertWeeklyScore(USER_ID, body.weekStart);
  return NextResponse.json({ success: true, score: row });
}
