import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toolCallsContainCheckinSave(toolCalls: unknown): boolean {
  if (!toolCalls) return false;
  const text = JSON.stringify(toolCalls).toLowerCase();
  return (
    text.includes("generate_meal_plan") ||
    text.includes("generate_workout_plan")
  );
}

export async function GET() {
  const latestCheckinMessage = await prisma.atlasMessage.findFirst({
    where: {
      conversation: {
        userId: USER_ID,
        type: "checkin",
      },
      role: "assistant",
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      toolCalls: true,
    },
  });

  if (!latestCheckinMessage) {
    return NextResponse.json({
      status: "required",
      label: "Check-in required",
      lastCheckInAt: null,
      daysSinceLastCheckIn: null,
      daysUntilDue: null,
    });
  }

  const hasSavedPlans = toolCallsContainCheckinSave(latestCheckinMessage.toolCalls);
  const lastCheckInAt = latestCheckinMessage.createdAt;
  const today = startOfLocalDay(new Date());
  const lastDay = startOfLocalDay(new Date(lastCheckInAt));
  const daysSinceLastCheckIn = Math.max(
    0,
    Math.floor((today.getTime() - lastDay.getTime()) / DAY_MS),
  );
  const daysUntilDue = 7 - daysSinceLastCheckIn;

  const status = !hasSavedPlans
    ? "required"
    : daysSinceLastCheckIn >= 7
      ? "overdue"
      : daysSinceLastCheckIn === 0
        ? "done_today"
        : "scheduled";

  let label = "Check-in required";
  if (status === "done_today") label = "Check-in done today";
  else if (status === "scheduled") {
    label = daysUntilDue === 1 ? "Due in 1 day" : `Due in ${daysUntilDue} days`;
  } else if (status === "overdue") {
    label =
      daysSinceLastCheckIn === 7
        ? "Check-in overdue by 1 day"
        : `Check-in overdue by ${daysSinceLastCheckIn - 6} days`;
  }

  if (status === "overdue") {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: USER_ID,
        type: "checkin_overdue",
        dismissed: false,
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: USER_ID,
          type: "checkin_overdue",
          title: "Weekly check-in overdue",
          message: label,
          payload: {
            daysSinceLastCheckIn,
            lastCheckInAt: lastCheckInAt.toISOString(),
          },
        },
      });
    }
  }

  return NextResponse.json({
    status,
    label,
    lastCheckInAt,
    daysSinceLastCheckIn,
    daysUntilDue: status === "overdue" ? 0 : Math.max(daysUntilDue, 0),
  });
}
