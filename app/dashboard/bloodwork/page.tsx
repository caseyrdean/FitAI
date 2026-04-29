"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { launchAtlas } from "@/lib/atlas-launch";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import {
  BloodworkUpload,
  type BloodWorkRecord,
  type BloodWorkMarker,
} from "@/components/bloodwork-upload";
import { BloodworkManualEntry } from "@/components/bloodwork-manual-entry";
import { buildAnalyteSeries } from "@/lib/bloodwork/series";
import { MANUAL_BLOODWORK_FILE_PATH } from "@/lib/bloodwork/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} – ${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return "—";
}

function formatUploadDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatUploadColumnLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function flaggedMarkersList(markers: BloodWorkMarker[]): BloodWorkMarker[] {
  return markers.filter((m) => m.flagged);
}

export default function BloodworkPage() {
  const [records, setRecords] = useState<BloodWorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setFetchError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bloodwork", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load (${res.status})`);
      }
      const data = (await res.json()) as BloodWorkRecord[];
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useAtlasRefresh(
    () => {
      void loadRecords();
    },
    { scopes: ["bloodwork"] },
  );

  const uploadsChronological = useMemo(() => {
    return [...records].sort(
      (a, b) =>
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    );
  }, [records]);

  const analyteSeries = useMemo(() => buildAnalyteSeries(records), [records]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Blood <span className="text-[#00ff88]">work</span>
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Add lab records, review flagged markers first, then inspect analyte trends over time.
        </p>
      </div>

      <Card className="border-surface-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Primary action</CardTitle>
          <CardDescription>
            Upload or enter your latest panel, then review flagged summary in upload history.
          </CardDescription>
          <Link href="/dashboard/supplements" className="text-xs text-neon-green hover:underline">
            Go to Supplements
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-fit border-surface-border text-xs"
            onClick={() =>
              launchAtlas({
                mode: "chat",
                prompt: "Review my flagged bloodwork markers and suggest next steps.",
              })
            }
          >
            Ask Atlas about flagged labs
          </Button>
        </CardHeader>
      </Card>

      <BloodworkUpload
        onUploadComplete={() => {
          void loadRecords();
        }}
      />

      <BloodworkManualEntry
        onSaved={() => {
          void loadRecords();
        }}
      />

      <Card className="border-surface-border bg-card/80">
        <CardHeader>
          <CardTitle className="text-white">Analyte trends</CardTitle>
          <CardDescription>
            One row per analyte (under its lab panel). Each column is one upload, oldest to newest.
            Values use the reference range captured on that report; flagged cells are highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
          {!loading && analyteSeries.length === 0 && (
            <p className="text-sm text-gray-400">
              Upload a lab file to build time series. Each new upload adds a column for every analyte.
            </p>
          )}
          {!loading && analyteSeries.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-surface-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-surface-border hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 min-w-[200px] bg-card text-[#00aaff]">
                      Panel / analyte
                    </TableHead>
                    {uploadsChronological.map((u) => (
                      <TableHead
                        key={u.id}
                        className="min-w-[108px] whitespace-nowrap text-center text-[#00aaff]"
                      >
                        {formatUploadColumnLabel(u.uploadedAt)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyteSeries.map((row) => (
                    <TableRow
                      key={row.seriesKey}
                      className="border-surface-border"
                    >
                      <TableCell className="sticky left-0 z-10 bg-card align-top">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {row.category}
                        </p>
                        <p className="font-medium text-white">{row.displayName}</p>
                        <p className="text-[10px] text-gray-500">{row.unit}</p>
                      </TableCell>
                      {uploadsChronological.map((u) => {
                        const p = row.points.find((x) => x.recordId === u.id);
                        if (!p) {
                          return (
                            <TableCell
                              key={u.id}
                              className="border-l border-surface-border/60 text-center text-gray-600"
                            >
                              —
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={u.id}
                            className={`border-l border-surface-border/60 align-top text-center text-sm ${
                              p.flagged ? "bg-red-950/25" : ""
                            }`}
                          >
                            <span
                              className={
                                p.flagged
                                  ? "font-semibold text-red-300"
                                  : "font-mono text-white"
                              }
                            >
                              {p.value}
                              {p.labFlag && (
                                <span className="ml-1 font-mono text-[10px] text-amber-400/90">
                                  {p.labFlag}
                                </span>
                              )}
                            </span>
                            <p className="mt-0.5 text-[10px] leading-tight text-gray-500">
                              ref {formatRange(p.referenceMin, p.referenceMax)}
                            </p>
                            {p.flagged && (
                              <Badge
                                variant="outline"
                                className="mt-1 border-red-500/40 text-[9px] text-red-300"
                              >
                                Flagged
                              </Badge>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-surface-border bg-card/80">
        <CardHeader>
          <CardTitle className="text-white">Upload history</CardTitle>
          <CardDescription>Per-upload flagged summary and full marker tables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <p className="text-sm text-gray-400">Loading records…</p>
          )}
          {fetchError && (
            <p className="text-sm text-red-400">{fetchError}</p>
          )}
          {!loading && !fetchError && records.length === 0 && (
            <p className="text-sm text-gray-400">No blood work records yet.</p>
          )}
          {!loading &&
            records.map((record) => {
              const markers = record.markers ?? [];
              const flagged = flaggedMarkersList(markers);
              const isOpen = expandedId === record.id;

              return (
                <Card
                  key={record.id}
                  className="border-surface-border bg-surface-dark/40"
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base text-white">
                          {formatUploadDate(record.uploadedAt)}
                        </CardTitle>
                        <CardDescription className="flex flex-wrap gap-2">
                          {record.filePath === MANUAL_BLOODWORK_FILE_PATH && (
                            <Badge
                              variant="outline"
                              className="border-[#00ff88]/40 text-[#00ff88]"
                            >
                              Manual entry
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="border-[#00aaff]/40 text-[#00aaff]"
                          >
                            {markers.length} analytes
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              flagged.length > 0
                                ? "border-amber-500/50 text-amber-400"
                                : "border-[#00ff88]/30 text-[#00ff88]"
                            }
                          >
                            {flagged.length} flagged
                          </Badge>
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-300 hover:text-[#00ff88]"
                        onClick={() => toggleExpand(record.id)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronRight className="mr-1 h-4 w-4" />
                        )}
                        {isOpen ? "Hide" : "Details"}
                      </Button>
                    </div>
                  </CardHeader>
                  {isOpen && (
                    <CardContent className="space-y-4 pt-0">
                      <Separator className="bg-surface-border" />
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#ffaa00]">
                          Flagged summary
                        </p>
                        {flagged.length === 0 ? (
                          <p className="text-sm text-[#00ff88]">
                            No flagged analytes on this report (or none parsed).
                          </p>
                        ) : (
                          <ul className="list-inside list-disc text-sm text-amber-400/90">
                            {flagged.map((m) => (
                              <li key={m.id}>
                                <span className="text-gray-500">
                                  [{m.category || "—"}]
                                </span>{" "}
                                {m.name}: {m.value} {m.unit} (ref{" "}
                                {formatRange(m.referenceMin, m.referenceMax)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Separator className="bg-surface-border" />
                      <div className="rounded-md border border-surface-border">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-surface-border hover:bg-transparent">
                              <TableHead className="text-[#00aaff]">
                                Panel
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Analyte
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Value
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Unit
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Reference
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Lab flag
                              </TableHead>
                              <TableHead className="text-[#00aaff]">
                                Status
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {markers.map((m) => (
                              <TableRow
                                key={m.id}
                                className="border-surface-border"
                              >
                                <TableCell className="max-w-[160px] truncate text-xs text-gray-400">
                                  {m.category?.trim() || "—"}
                                </TableCell>
                                <TableCell
                                  className={
                                    m.flagged
                                      ? "font-medium text-amber-400"
                                      : "text-gray-200"
                                  }
                                >
                                  {m.name}
                                </TableCell>
                                <TableCell
                                  className={
                                    m.flagged
                                      ? "font-semibold text-red-400"
                                      : "text-white"
                                  }
                                >
                                  {m.value}
                                </TableCell>
                                <TableCell className="text-gray-400">
                                  {m.unit}
                                </TableCell>
                                <TableCell className="text-gray-400">
                                  {formatRange(
                                    m.referenceMin,
                                    m.referenceMax
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-gray-300">
                                  {m.labFlag?.trim() ? m.labFlag.trim() : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      m.flagged ? "destructive" : "secondary"
                                    }
                                    className={
                                      m.flagged
                                        ? "border-red-500/50 bg-red-950/40 text-red-300"
                                        : "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]"
                                    }
                                  >
                                    {m.flagged ? "Flagged" : "OK"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
