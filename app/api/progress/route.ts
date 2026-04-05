import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const entries = await prisma.progressEntry.findMany({
    where: {
      userId: USER_ID,
      date: { gte: ninetyDaysAgo },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  try {
    const { weight, energyLevel, notes } = (await request.json()) as {
      weight?: number;
      energyLevel?: number;
      notes?: string;
    };

    const entry = await prisma.progressEntry.create({
      data: {
        userId: USER_ID,
        weight,
        energyLevel,
        notes,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Progress entry error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log progress" },
      { status: 500 }
    );
  }
}
