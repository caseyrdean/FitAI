import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET(request: NextRequest) {
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const take = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 20;
  const rows = await prisma.personalizationMemoryEvent.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: "desc" },
    take,
  });
  return NextResponse.json(rows);
}
