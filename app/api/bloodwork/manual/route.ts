import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import { MANUAL_BLOODWORK_FILE_PATH } from "@/lib/bloodwork/constants";
import { persistMarkersForRecord } from "@/lib/bloodwork/persist-markers";

const markerSchema = z.object({
  category: z.string().optional(),
  name: z.string().min(1, "Analyte name is required"),
  value: z.number().finite(),
  unit: z.string().min(1, "Unit is required"),
  referenceMin: z.number().finite().nullable().optional(),
  referenceMax: z.number().finite().nullable().optional(),
  labFlag: z.union([z.string(), z.null()]).optional(),
});

const bodySchema = z.object({
  markers: z.array(markerSchema).min(1, "Add at least one row"),
});

export async function POST(request: NextRequest) {
  try {
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const markersPayload = parsed.data.markers.map((m) => ({
      category: m.category?.trim() ? m.category.trim() : null,
      name: m.name.trim(),
      value: m.value,
      unit: m.unit.trim(),
      referenceMin: m.referenceMin ?? null,
      referenceMax: m.referenceMax ?? null,
      labFlag:
        m.labFlag != null && String(m.labFlag).trim() !== ""
          ? String(m.labFlag).trim()
          : null,
    }));

    const record = await prisma.bloodWorkRecord.create({
      data: {
        userId: USER_ID,
        filePath: MANUAL_BLOODWORK_FILE_PATH,
        rawText: `manual:${JSON.stringify(markersPayload)}`,
      },
    });

    const { persisted } = await persistMarkersForRecord(
      record.id,
      markersPayload,
    );

    if (persisted === 0) {
      await prisma.bloodWorkRecord.delete({ where: { id: record.id } });
      return NextResponse.json(
        {
          error:
            "No rows could be saved. Check that each row has a numeric value and a unit.",
        },
        { status: 422 },
      );
    }

    await prisma.bloodWorkRecord.update({
      where: { id: record.id },
      data: { parsedAt: new Date() },
    });

    const fullRecord = await prisma.bloodWorkRecord.findUnique({
      where: { id: record.id },
      include: { markers: true },
    });

    return NextResponse.json(fullRecord);
  } catch (e) {
    console.error("Manual blood work error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 },
    );
  }
}
