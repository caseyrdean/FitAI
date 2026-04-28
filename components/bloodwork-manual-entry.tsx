"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import type { BloodWorkRecord } from "@/components/bloodwork-upload";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";

type DraftRow = {
  id: string;
  category: string;
  name: string;
  value: string;
  unit: string;
  referenceMin: string;
  referenceMax: string;
  labFlag: string;
};

function newRow(): DraftRow {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    category: "",
    name: "",
    value: "",
    unit: "",
    referenceMin: "",
    referenceMax: "",
    labFlag: "",
  };
}

function parseOptionalNumber(s: string): number | null | "invalid" {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "invalid";
}

type BloodworkManualEntryProps = {
  onSaved?: (record: BloodWorkRecord) => void;
};

export function BloodworkManualEntry({ onSaved }: BloodworkManualEntryProps) {
  const initialRows = useMemo(
    () => [newRow(), newRow(), newRow(), newRow(), newRow()],
    [],
  );
  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = useCallback((id: string, patch: Partial<DraftRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const save = useCallback(async () => {
    setError(null);
    const markers: Array<{
      category?: string;
      name: string;
      value: number;
      unit: string;
      referenceMin: number | null;
      referenceMax: number | null;
      labFlag: string | null;
    }> = [];

    const rowErrors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = r.name.trim();
      const unit = r.unit.trim();
      const valueStr = r.value.trim();
      if (!name && !unit && !valueStr && !r.category.trim() && !r.labFlag.trim()) {
        continue;
      }
      if (!name) {
        rowErrors.push(`Row ${i + 1}: analyte name is required.`);
        continue;
      }
      if (!valueStr) {
        rowErrors.push(`Row ${i + 1} (${name}): value is required.`);
        continue;
      }
      const valueNum = Number(valueStr.replace(/,/g, ""));
      if (!Number.isFinite(valueNum)) {
        rowErrors.push(`Row ${i + 1} (${name}): value must be a number.`);
        continue;
      }
      if (!unit) {
        rowErrors.push(`Row ${i + 1} (${name}): unit is required.`);
        continue;
      }

      const refMin = parseOptionalNumber(r.referenceMin);
      const refMax = parseOptionalNumber(r.referenceMax);
      if (refMin === "invalid" || refMax === "invalid") {
        rowErrors.push(
          `Row ${i + 1} (${name}): reference min/max must be numbers or empty.`,
        );
        continue;
      }

      const labFlag = r.labFlag.trim();
      markers.push({
        ...(r.category.trim() ? { category: r.category.trim() } : {}),
        name,
        value: valueNum,
        unit,
        referenceMin: refMin,
        referenceMax: refMax,
        labFlag: labFlag ? labFlag : null,
      });
    }

    if (rowErrors.length > 0) {
      setError(rowErrors.join(" "));
      return;
    }

    if (markers.length === 0) {
      setError("Fill in at least one complete row (panel, analyte, value, unit).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/bloodwork/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markers }),
      });
      const data = (await res.json()) as BloodWorkRecord | { error?: string };
      if (!res.ok) {
        setError(
          "error" in data && data.error
            ? data.error
            : `Save failed (${res.status})`,
        );
        return;
      }
      dispatchFitaiRefresh({ source: "bloodwork", scopes: ["bloodwork", "dashboard"] });
      onSaved?.(data as BloodWorkRecord);
      setRows([newRow(), newRow(), newRow(), newRow(), newRow()]);
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }, [rows, onSaved]);

  return (
    <Card className="border-surface-border bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-white">
          Enter lab results <span className="text-[#00aaff]">manually</span>
        </CardTitle>
        <CardDescription>
          Same schema as PDF extraction:{" "}
          <strong className="text-gray-300">Panel (category)</strong>,{" "}
          <strong className="text-gray-300">Analyte</strong>,{" "}
          <strong className="text-gray-300">Value</strong>,{" "}
          <strong className="text-gray-300">Unit</strong>,{" "}
          <strong className="text-gray-300">Reference min / max</strong> (e.g.
          only max for <span className="font-mono text-xs">&lt;200</span>, only
          min for <span className="font-mono text-xs">≥40</span>),{" "}
          <strong className="text-gray-300">Lab flag</strong> (H, L, HH, LL, or
          leave blank). All rows are saved together as one upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border border-surface-border">
          <Table>
            <TableHeader>
              <TableRow className="border-surface-border hover:bg-transparent">
                <TableHead className="min-w-[120px] text-[#00aaff]">Panel</TableHead>
                <TableHead className="min-w-[160px] text-[#00aaff]">Analyte</TableHead>
                <TableHead className="w-[88px] text-[#00aaff]">Value</TableHead>
                <TableHead className="min-w-[72px] text-[#00aaff]">Unit</TableHead>
                <TableHead className="w-[88px] text-[#00aaff]">Ref min</TableHead>
                <TableHead className="w-[88px] text-[#00aaff]">Ref max</TableHead>
                <TableHead className="w-[72px] text-[#00aaff]">Flag</TableHead>
                <TableHead className="w-[52px] text-[#00aaff]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-surface-border">
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="e.g. Lipid Panel"
                      value={r.category}
                      onChange={(e) =>
                        updateRow(r.id, { category: e.target.value })
                      }
                      aria-label="Panel category"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="Cholesterol, Total"
                      value={r.name}
                      onChange={(e) => updateRow(r.id, { name: e.target.value })}
                      aria-label="Analyte name"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="252"
                      inputMode="decimal"
                      value={r.value}
                      onChange={(e) => updateRow(r.id, { value: e.target.value })}
                      aria-label="Value"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="mg/dL"
                      value={r.unit}
                      onChange={(e) => updateRow(r.id, { unit: e.target.value })}
                      aria-label="Unit"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="—"
                      inputMode="decimal"
                      value={r.referenceMin}
                      onChange={(e) =>
                        updateRow(r.id, { referenceMin: e.target.value })
                      }
                      aria-label="Reference minimum"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="200"
                      inputMode="decimal"
                      value={r.referenceMax}
                      onChange={(e) =>
                        updateRow(r.id, { referenceMax: e.target.value })
                      }
                      aria-label="Reference maximum"
                    />
                  </TableCell>
                  <TableCell className="p-2 align-middle">
                    <Input
                      className="h-8 border-surface-border bg-surface-dark/60 text-xs text-white"
                      placeholder="H"
                      value={r.labFlag}
                      onChange={(e) =>
                        updateRow(r.id, { labFlag: e.target.value })
                      }
                      aria-label="Lab flag"
                    />
                  </TableCell>
                  <TableCell className="p-1 align-middle">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-red-400"
                      onClick={() => removeRow(r.id)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#00aaff]/40 text-[#00aaff] hover:bg-[#00aaff]/10"
            onClick={addRow}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add row
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          className="bg-[#00ff88] text-black hover:bg-[#00ff88]/90"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save as one lab upload"}
        </Button>
      </CardFooter>
    </Card>
  );
}
