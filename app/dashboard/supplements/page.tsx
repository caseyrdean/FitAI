"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLocalWeekRangeLabel, parseWeekStartToLocalSunday } from "@/lib/local-week";

type SupplementItem = {
  supplementKind: string;
  amount: number;
  unit: string;
  rationale: string;
  frequency?: string;
  timing?: string;
  drivers?: string[];
};

type SupplementPayload = {
  id: string;
  weekStart: string | null;
  items: unknown;
  summary: string;
  updatedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseItems(raw: unknown): SupplementItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SupplementItem[] = [];
  for (const x of raw) {
    if (!isRecord(x)) continue;
    const supplementKind = String(x.supplementKind ?? "").trim();
    const amount = typeof x.amount === "number" ? x.amount : Number(x.amount);
    const unit = String(x.unit ?? "").trim();
    const rationale = String(x.rationale ?? "").trim();
    if (!supplementKind || !Number.isFinite(amount) || !unit || !rationale) continue;
    const frequency =
      x.frequency != null && String(x.frequency).trim()
        ? String(x.frequency).trim()
        : undefined;
    const timing =
      x.timing != null && String(x.timing).trim()
        ? String(x.timing).trim()
        : undefined;
    const drivers = Array.isArray(x.drivers)
      ? x.drivers.filter((d): d is string => typeof d === "string")
      : undefined;
    out.push({
      supplementKind,
      amount,
      unit,
      rationale,
      ...(frequency ? { frequency } : {}),
      ...(timing ? { timing } : {}),
      ...(drivers?.length ? { drivers } : {}),
    });
  }
  return out;
}

function driverBadgeClass(d: string): string {
  const x = d.toLowerCase();
  if (x.includes("blood")) return "border-rose-400/50 text-rose-300";
  if (x.includes("diet") || x.includes("gap")) return "border-sky-400/50 text-sky-300";
  return "border-muted-foreground/40 text-muted-foreground";
}

export default function SupplementsPage() {
  const [data, setData] = useState<SupplementPayload | null | undefined>(undefined);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useAtlasRefresh(
    () => {
      refresh();
    },
    { scopes: ["supplements", "meals", "dashboard"] },
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supplements", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as SupplementPayload | null;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const items = data ? parseItems(data.items) : [];
  const weekLabel =
    data?.weekStart != null
      ? formatLocalWeekRangeLabel(
          parseWeekStartToLocalSunday(data.weekStart, new Date()),
        )
      : null;

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-9 w-64 bg-surface-light" />
        <Skeleton className="h-40 w-full rounded-lg bg-surface-light" />
        <Skeleton className="h-64 w-full rounded-lg bg-surface-light" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Supplements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atlas recommends <span className="text-white/90">generic</span> supplement forms and doses
          to cover what your meal plan and logs may not fully provide.{" "}
          <span className="text-white/90">Flagged blood work</span> is weighted heavily. Each row shows
          the dose for <span className="text-white/90">one intake</span> (one pill, scoop, or serving) —{" "}
          <span className="text-white/90">not a weekly total</span>. Use <strong className="text-white/90">Frequency</strong>{" "}
          to see how often that intake happens; your usual <span className="text-white/90">daily</span> exposure
          is based on that (e.g. twice daily → about two times the amount per day). Nothing here is a
          prescription — discuss changes with your clinician when appropriate.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/dashboard/meals"
            className="font-medium text-neon-green underline-offset-4 hover:underline"
          >
            Log supplements with your meals
          </Link>{" "}
          so micronutrient totals include them everywhere.
        </p>
      </div>

      {!data ? (
        <Card className="border-surface-border bg-card">
          <CardHeader>
            <CardTitle className="text-white">No recommendations yet</CardTitle>
            <CardDescription>
              After Atlas generates or refreshes your meal plan (or you ask about supplements), rows
              appear here. Generic types and amounts only — no brand names.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card className="border-surface-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Overview</CardTitle>
              {weekLabel && (
                <CardDescription>
                  Meal-plan week when this list was last saved ({weekLabel}) — not a dosing period;
                  amounts are still <span className="text-foreground/90">per intake</span>, not weekly
                  totals.
                </CardDescription>
              )}
              <CardDescription className="text-xs">
                Last updated{" "}
                {new Date(data.updatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.summary?.trim() ? (
                <p className="text-sm leading-relaxed text-gray-200">{data.summary.trim()}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No summary text saved.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-surface-border bg-card">
            <CardHeader>
              <CardTitle className="text-white">Recommended items</CardTitle>
              <CardDescription>
                <span className="text-foreground/90">Amount</span> = one intake;{" "}
                <span className="text-foreground/90">Frequency</span> = how often per day or week. Values are{" "}
                <Badge variant="outline" className="border-neon-amber/40 text-neon-amber">~est.</Badge> — not
                individualized medical advice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No structured rows on file. Ask Atlas to refresh your plan or call out labs and diet
                  gaps in chat.
                </p>
              ) : (
                <ul className="space-y-4">
                  {items.map((row, i) => (
                    <li
                      key={`${row.supplementKind}-${i}`}
                      className="rounded-lg border border-surface-border bg-surface/40 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-white">{row.supplementKind}</p>
                        <div className="text-right">
                          <p className="font-mono text-sm text-neon-green">
                            {row.amount} {row.unit}
                          </p>
                          <p className="text-[10px] font-normal text-muted-foreground">per intake</p>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-gray-400">Frequency:</span>{" "}
                        {row.frequency ? (
                          <span className="text-gray-200">{row.frequency}</span>
                        ) : (
                          <span className="italic text-muted-foreground">
                            Not specified — ask Atlas to refresh (needed to interpret daily pattern safely)
                          </span>
                        )}
                      </p>
                      {row.timing && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-gray-400">Timing:</span> {row.timing}
                        </p>
                      )}
                      {row.drivers && row.drivers.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {row.drivers.map((d) => (
                            <Badge
                              key={d}
                              variant="outline"
                              className={`text-[10px] font-normal ${driverBadgeClass(d)}`}
                            >
                              {d}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-sm leading-relaxed text-gray-300">{row.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
