import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import { mergeMemory, normalizeMemory } from "@/lib/memory/merge";

export async function GET() {
  const row = await prisma.personalizationMemory.findUnique({
    where: { userId: USER_ID },
  });
  return NextResponse.json(
    row ?? {
      id: null,
      userId: USER_ID,
      memory: {},
      version: 0,
      updatedBy: "atlas",
      updatedAt: null,
    },
  );
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    memory?: unknown;
    updatedBy?: "atlas" | "user";
    eventType?: string;
  };
  const patch = normalizeMemory(body.memory);
  const updatedBy = body.updatedBy === "atlas" ? "atlas" : "user";
  const existing = await prisma.personalizationMemory.findUnique({
    where: { userId: USER_ID },
  });
  const row = existing
    ? await prisma.personalizationMemory.update({
        where: { userId: USER_ID },
        data: {
          memory: mergeMemory(existing.memory, patch),
          updatedBy,
          version: existing.version + 1,
        },
      })
    : await prisma.personalizationMemory.create({
        data: {
          userId: USER_ID,
          memory: patch,
          updatedBy,
          version: 1,
        },
      });
  await prisma.personalizationMemoryEvent.create({
    data: {
      userId: USER_ID,
      personalizationMemoryId: row.id,
      eventType: body.eventType ?? "manual_update",
      updatedBy,
      payload: patch as object,
    },
  });
  return NextResponse.json(row);
}
