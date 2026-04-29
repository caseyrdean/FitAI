import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET() {
  const rows = await prisma.notification.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(rows);
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; dismissed?: boolean };
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const row = await prisma.notification.update({
    where: { id: body.id },
    data: { dismissed: body.dismissed !== false },
  });
  return NextResponse.json(row);
}
