/**
 * Instructions for Claude vision / PDF document extraction of lab reports.
 * Goal: panel-aware, row-complete tables; full analyte names (including commas).
 */

export const LAB_REPORT_EXTRACTION_PROMPT = `You are extracting data from a clinical lab report (PDF or image). Be systematic and exhaustive.

## 1. Map the document structure first (mentally, then output)
- Scan for **section/panel titles**: boxed headers, bold lines, all-caps blocks, or names like "Lipid Panel", "Lipid Panel, Standard", "COMP. METABOLIC PANEL", "CBC w/ Differential", etc. Each is a **category** for the analytes beneath it.
- Under each category, locate **result tables**. Many reports use columns like **Analyte | Value | Reference Range | Flag** (names may vary: Result, Ref. Interval, F, etc.). Identify the **Flag** column if present: **H** = high (above reference), **L** = low (below reference), sometimes **HH/LL** or **High/Low** text. Copy the flag character(s) for **that row only** — do not attach one row's H to the next analyte.
- Tables may span pages: **continue the same category** until a new panel title appears.

## 2. Extract one record per table DATA row (not header row)
- Each **horizontal data row** under the column headers = **exactly one analyte**. You must list **every** data row — do not skip, merge, or summarize.
- The **analyte name** is the full text in the test-name column for that row only. Copy it **verbatim**, including commas and qualifiers.
  - Examples of correct names: "Cholesterol, Total", "Glucose, Fasting", "HDL Cholesterol", "LDL-C Calculated", "TSH", "WBC".
  - **Never** split names at commas. **Never** drop the second part after a comma.
- On the **same row**, take the **numeric result**, **unit**, **reference interval** (or expected range), and the **Flag** cell exactly (H, L, blank, *, High, Low). If the lab printed **H** or **L** for that analyte, you MUST put that in the Flag field — the app uses it to mark the result.

## 3. Reference ranges
- Copy the reference text from **that analyte's row** (same table row). Examples: "40-100", "<200", "≥60", "Negative", "See Note" — transcribe as shown next to the value.

## 4. Completeness
- If a panel table shows many rows, your output must include **one line per row**. Count rows in the source and match count in your output.
- Include sub-rows, reflex add-ons, and calculated values if they appear as separate lines with their own results.

## 5. Output format (plain text, not JSON)
Use this format so the next step can parse reliably. Repeat for **every** analyte.

=== PANEL: <paste exact panel/section title from the document> ===
Analyte: <full name exactly as printed> | Value: <number or numeric if possible> | Unit: <text> | Reference: <text as printed> | Flag: <H/L/* or none>

Example:
=== PANEL: Lipid Panel, Standard ===
Analyte: Cholesterol, Total | Value: 252 | Unit: mg/dL | Reference: <200 mg/dL | Flag: H

Do not use JSON here. Do not omit panels. If you cannot read a field, write "unknown" for that field but still output the row.`;

export const LAB_REPORT_PARSE_ADDENDUM = `
Additional parsing rules for the structured text above:
- Lines starting with "=== PANEL:" set the category for following rows until the next PANEL line.
- Each "Analyte:" line is one JSON object. The name is everything after "Analyte: " up to " | Value:" — preserve commas (e.g. "Cholesterol, Total").
- Parse Reference: into referenceMin/referenceMax when numeric (e.g. "<200" → referenceMax 200; "40-100" → 40 and 100).
- Parse "Flag: ..." into JSON field "labFlag": use "H", "L", or "" (empty string) / null when none. If Flag is H, L, HH, LL, High, or Low, set "documentFlagsRisk": true as well.
- Output one JSON object per analyte line; include every line from the extraction — do not deduplicate or drop analytes.
`;
