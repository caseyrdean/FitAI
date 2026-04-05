import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import {
  LAB_REPORT_EXTRACTION_PROMPT,
  LAB_REPORT_PARSE_ADDENDUM,
} from "@/lib/bloodwork/extraction-prompts";
import { LAB_DIRECT_JSON_EXTRACTION_PROMPT } from "@/lib/bloodwork/lab-table-schema";
import { extractLeadingJsonArray } from "@/lib/bloodwork/extract-json-array";
import { persistMarkersForRecord } from "@/lib/bloodwork/persist-markers";
import Anthropic from "@anthropic-ai/sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function GET() {
  const records = await prisma.bloodWorkRecord.findMany({
    where: { userId: USER_ID },
    include: { markers: true },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    await mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${file.name}`;
    const filePath = join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const record = await prisma.bloodWorkRecord.create({
      data: {
        userId: USER_ID,
        filePath,
      },
    });

    const base64 = Buffer.from(bytes).toString("base64");
    const isImage = file.type.startsWith("image/");
    const mediaType = isImage
      ? (file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
      : "image/png";

    let rawText = "";
    let parsedCount = 0;

    try {
      /** 1) Primary: read PDF/image and emit JSON array in one shot (schema-aligned). */
      if (isImage) {
        const direct = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: base64 },
                },
                { type: "text", text: LAB_DIRECT_JSON_EXTRACTION_PROMPT },
              ],
            },
          ],
        });
        const tb = direct.content.find((b) => b.type === "text");
        const textOut = tb && tb.type === "text" ? tb.text : "";
        const arr = extractLeadingJsonArray(textOut);
        if (arr && arr.length > 0) {
          rawText = textOut.trim();
          parsedCount = (await persistMarkersForRecord(record.id, arr)).persisted;
        }
      } else if (file.type === "application/pdf") {
        const direct = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: base64 },
                },
                { type: "text", text: LAB_DIRECT_JSON_EXTRACTION_PROMPT },
              ],
            },
          ],
        });
        const tb = direct.content.find((b) => b.type === "text");
        const textOut = tb && tb.type === "text" ? tb.text : "";
        const arr = extractLeadingJsonArray(textOut);
        if (arr && arr.length > 0) {
          rawText = textOut.trim();
          parsedCount = (await persistMarkersForRecord(record.id, arr)).persisted;
        }
      }

      /** 2) Fallback: structured plain text → second model pass to JSON. */
      if (parsedCount === 0 && (isImage || file.type === "application/pdf")) {
        let fallbackText = "";
        if (isImage) {
          const visionResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: mediaType, data: base64 },
                  },
                  { type: "text", text: LAB_REPORT_EXTRACTION_PROMPT },
                ],
              },
            ],
          });
          const tb = visionResponse.content.find((b) => b.type === "text");
          fallbackText = tb && tb.type === "text" ? tb.text : "";
        } else {
          const pdfResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "document",
                    source: { type: "base64", media_type: "application/pdf", data: base64 },
                  },
                  { type: "text", text: LAB_REPORT_EXTRACTION_PROMPT },
                ],
              },
            ],
          });
          const tb = pdfResponse.content.find((b) => b.type === "text");
          fallbackText = tb && tb.type === "text" ? tb.text : "";
        }

        rawText = fallbackText;

        if (rawText) {
          const parseResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [
              {
                role: "user",
                content: `Parse these blood work results into structured data. Return ONLY a JSON array of objects with this shape:
[{
  "category": string,
  "name": string,
  "value": number,
  "unit": string,
  "referenceMin": number | null,
  "referenceMax": number | null,
  "labFlag": string | null,
  "documentFlagsRisk": boolean,
  "flagged": boolean
}]

Rules:
- category: PANEL section from "=== PANEL: ... ===" or panel title for each row.
- name: FULL analyte label including commas (e.g. "Cholesterol, Total"). Never split on commas.
- referenceMin/referenceMax: "<200" → max 200; ">=40" → min 40; "65–139" → both.
- labFlag: Flag column only — "H", "L", or null. **Required when PDF shows H or L.**
- documentFlagsRisk: true if labFlag is H/L or line shows abnormal markers.

${LAB_REPORT_PARSE_ADDENDUM}

Blood work text:
${rawText}`,
              },
            ],
          });

          const pt = parseResponse.content.find((b) => b.type === "text");
          if (pt && pt.type === "text") {
            const arr = extractLeadingJsonArray(pt.text);
            if (arr && arr.length > 0) {
              parsedCount = (await persistMarkersForRecord(record.id, arr)).persisted;
            } else {
              const jsonMatch = pt.text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                try {
                  const rawList = JSON.parse(jsonMatch[0]) as unknown[];
                  parsedCount = (
                    await persistMarkersForRecord(record.id, rawList)
                  ).persisted;
                } catch {
                  /* keep parsedCount 0 */
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Blood work extraction error:", err);
    }

    await prisma.bloodWorkRecord.update({
      where: { id: record.id },
      data: { rawText },
    });

    if (parsedCount > 0) {
      await prisma.bloodWorkRecord.update({
        where: { id: record.id },
        data: { parsedAt: new Date() },
      });
    }

    const fullRecord = await prisma.bloodWorkRecord.findUnique({
      where: { id: record.id },
      include: { markers: true },
    });

    return NextResponse.json(fullRecord);
  } catch (error) {
    console.error("Blood work upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
