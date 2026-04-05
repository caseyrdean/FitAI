/**
 * Canonical lab table schema (matches common US lab PDFs: Analyte | Value | Reference | Flag).
 * Used for: direct PDF/image → JSON, Atlas system prompt, parse_blood_work tool.
 */

/** Single-shot extraction: model reads the document and emits ONLY a JSON array. */
export const LAB_DIRECT_JSON_EXTRACTION_PROMPT = `You are a laboratory report extractor. Read this document carefully.

## Table schema (map every numeric result row to these fields)
The PDF is organized into **panels** (section headers like "Lipid Panel", "Comprehensive Metabolic Panel", "CBC with Diff/Plt", "Urinalysis", etc.). Under each panel is a **table** whose columns correspond to:

| Column (logical)   | JSON field        | Rules |
|--------------------|-------------------|--------|
| Analyte / Test name| name              | Full text as printed. **Keep commas** — e.g. "Cholesterol, Total", "Bilirubin, Total", "Urea Nitrogen (BUN)". Never split on commas. |
| Result / Value     | value             | Numeric result for that row only. |
| Unit               | unit              | e.g. mg/dL, mmol/L, %, K/uL, pg/mL, mIU/L |
| Reference range    | referenceMin, referenceMax | Parse: "<200" → referenceMax=200, referenceMin=null. ">40" or "≥40" → referenceMin=40, referenceMax=null. "65–139" or "65-139" → both. "0.60–1.26" → both. |
| **Flag**           | **labFlag**       | **Critical.** Copy the lab's flag cell exactly: **"H"** (high), **"L"** (low), **"HH"**, **"LL"**, or **null** / omit if blank. If the PDF shows **H** or **L** in the Flag column for that row, you MUST output it — the app depends on this. |

**category** = the panel / section title printed **above** that table block (apply to every row in that block until the next panel title).

Skip rows with no numeric result (e.g. qualitative urinalysis "Negative" only) OR set value and reference from text if you can represent them — prefer **only rows with a clear numeric value** for this array.

## Output format (strict)
Return **ONLY** a JSON array. **No** markdown code fences, **no** explanation. First character must be **[**, last must be **]**.

Each object shape:
{"category":"string","name":"string","value":number,"unit":"string","referenceMin":number|null,"referenceMax":number|null,"labFlag":"H"|"L"|null}

## Examples (same schema as your output)
{"category":"Lipid Panel","name":"Cholesterol, Total","value":252,"unit":"mg/dL","referenceMin":null,"referenceMax":200,"labFlag":"H"}
{"category":"Lipid Panel","name":"HDL Cholesterol","value":69,"unit":"mg/dL","referenceMin":40,"referenceMax":null,"labFlag":null}
{"category":"Lipid Panel","name":"Triglycerides","value":367,"unit":"mg/dL","referenceMin":null,"referenceMax":150,"labFlag":"H"}
{"category":"Lipid Panel","name":"LDL-Cholesterol (calc)","value":131,"unit":"mg/dL","referenceMin":null,"referenceMax":100,"labFlag":"H"}
{"category":"Comprehensive Metabolic Panel","name":"Glucose","value":102,"unit":"mg/dL","referenceMin":65,"referenceMax":139,"labFlag":null}
{"category":"Comprehensive Metabolic Panel","name":"Creatinine","value":1.53,"unit":"mg/dL","referenceMin":0.6,"referenceMax":1.26,"labFlag":"H"}

## Completeness
Include **every** numeric analyte row in **every** panel. Do not drop the Flag column. Do not attach one row's **H** to the next analyte.`;

/** Injected into Atlas system prompt so chat follows the same schema when calling tools. */
export const ATLAS_LAB_TABLE_SCHEMA_BLOCK = `
## Lab PDF schema (parse_blood_work & uploads)
Clinical lab PDFs use tables: **Analyte | Value | Reference Range | Flag**. Panel titles (e.g. Lipid Panel, Comprehensive Metabolic Panel) are **category**. Each **data row** = one object: **name** = full analyte text including commas (e.g. "Cholesterol, Total"); **value** + **unit**; **referenceMin/Max** parsed from the reference column; **labFlag** = **H** or **L** (or null) from the **Flag** column — never omit H/L when the PDF shows them. When calling **parse_blood_work**, pass **labFlag** on every row that has a flag in the source.`;

/** Appended to buildContext when blood work exists. */
export const ATLAS_LAB_PARSE_REMINDER = `
### Lab parse reminder
If markers are missing or flags are wrong, use **parse_blood_work** with **recordId** from the latest upload. Each marker must include: **category**, **name** (verbatim), **value**, **unit**, **referenceMin**, **referenceMax**, **labFlag** (H/L from the Flag column).`;

export const PARSE_BLOOD_WORK_TOOL_SCHEMA_DETAILS = `
Required per marker: category (panel title), name (full analyte including commas), value, unit, referenceMin/referenceMax when parseable, labFlag (string: "H", "L", or omit if blank).
The source table columns are: Analyte | Value | Reference Range | Flag — labFlag MUST match the PDF Flag column for that row (H=high, L=low).`;
