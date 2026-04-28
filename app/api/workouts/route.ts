import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  getWorkoutPlanForToday,
  getWorkoutSessionsForCurrentLocalWeek,
} from "@/lib/plan-queries";
import { USER_ID } from "@/lib/user";

export async function GET() {
  const [plan, sessions] = await Promise.all([
    getWorkoutPlanForToday(USER_ID),
    getWorkoutSessionsForCurrentLocalWeek(USER_ID),
  ]);

  return NextResponse.json({ plan, sessions });
}

export async function POST(request: NextRequest) {
  try {
    const { date, planDayRef, completed, notes } = (await request.json()) as {
      date: string;
      planDayRef: string;
      completed: boolean;
      notes?: string;
    };

    const dayDate = new Date(date);
    const existing = await prisma.workoutSession.findFirst({
      where: {
        userId: USER_ID,
        date: dayDate,
        planDayRef,
      },
      orderBy: { createdAt: "desc" },
    });

    const session = existing
      ? await prisma.workoutSession.update({
          where: { id: existing.id },
          data: {
            completed,
            ...(notes !== undefined ? { notes } : {}),
          },
        })
      : await prisma.workoutSession.create({
          data: {
            userId: USER_ID,
            date: dayDate,
            planDayRef,
            completed,
            notes,
          },
        });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Workout session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log workout" },
      { status: 500 },
    );
  }
}
