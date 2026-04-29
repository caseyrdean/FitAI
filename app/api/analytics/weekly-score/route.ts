import { NextRequest, NextResponse } from "next/server";
import { upsertWeeklyScore } from "@/lib/analytics/weekly-score";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function emitWeeklyNotifications(userId: string, score: number, weekStart: Date) {
  const weekKey = localDateKey(weekStart);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "weekly_recap_ready",
      payload: { path: ["weekStart"], equals: weekKey },
    },
  });
  if (!existing) {
    await prisma.notification.create({
      data: {
        userId,
        type: "weekly_recap_ready",
        title: "Weekly recap ready",
        message: `Your weekly score and recap are ready (${weekKey}).`,
        payload: { weekStart: weekKey },
      },
    });
  }
  if (score < 60) {
    const existingLow = await prisma.notification.findFirst({
      where: {
        userId,
        type: "score_drop_alert",
        payload: { path: ["weekStart"], equals: weekKey },
      },
    });
    if (!existingLow) {
      await prisma.notification.create({
        data: {
          userId,
          type: "score_drop_alert",
          title: "Weekly score needs attention",
          message: `This week's score is ${score}. Atlas added action items to help you recover quickly.`,
          payload: { weekStart: weekKey, score },
        },
      });
    }
  }
}

export async function GET(request: NextRequest) {
  const weekStart = request.nextUrl.searchParams.get("weekStart") ?? undefined;
  const row = await upsertWeeklyScore(USER_ID, weekStart);
  await emitWeeklyNotifications(USER_ID, row.overallScore, row.weekStart);
  return NextResponse.json(row);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { weekStart?: string };
  const row = await upsertWeeklyScore(USER_ID, body.weekStart);
  await emitWeeklyNotifications(USER_ID, row.overallScore, row.weekStart);
  return NextResponse.json({ success: true, score: row });
}
