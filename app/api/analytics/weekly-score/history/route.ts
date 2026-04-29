import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET(request: NextRequest) {
  const weeksRaw = Number(request.nextUrl.searchParams.get("weeks") ?? "12");
  const weeks = Number.isFinite(weeksRaw) ? Math.min(52, Math.max(1, Math.floor(weeksRaw))) : 12;
  const rows = await prisma.weeklyScore.findMany({
    where: { userId: USER_ID },
    orderBy: { weekStart: "desc" },
    take: weeks,
  });
  return NextResponse.json(rows);
}
