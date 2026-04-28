import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET() {
  const row = await prisma.supplementAdvice.findUnique({
    where: { userId: USER_ID },
  });

  if (!row) {
    return NextResponse.json(null, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  return NextResponse.json(
    {
      id: row.id,
      userId: row.userId,
      weekStart: row.weekStart?.toISOString() ?? null,
      items: row.items,
      summary: row.summary,
      updatedAt: row.updatedAt.toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
