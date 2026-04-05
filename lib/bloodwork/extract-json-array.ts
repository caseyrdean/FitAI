/**
 * Pull a JSON array from model output (may include markdown fences or prose).
 */
export function extractLeadingJsonArray(text: string): unknown[] | null {
  if (!text || typeof text !== "string") return null;
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(s);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  const slice = s.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    try {
      const repaired = slice.replace(/,\s*([\]}])/g, "$1");
      const parsed = JSON.parse(repaired) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
