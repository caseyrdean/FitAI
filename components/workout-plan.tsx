"use client";

import { useMemo, useState } from "react";
import { formatLocalWeekRangeLabel, localPlanDayNoonIso } from "@/lib/local-week";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type WorkoutExercise = {
  name?: string;
  exercise?: string;
  movement?: string;
  sets?: number;
  reps?: number | string;
  rest?: string;
  restPeriod?: string;
  restSeconds?: number;
};

export type WorkoutDay = {
  id?: string;
  dayRef?: string;
  label?: string;
  name?: string;
  day?: string;
  title?: string;
  focus?: string;
  exercises?: WorkoutExercise[];
};

export type WorkoutPlanPayload = {
  id: string;
  userId: string;
  weekStart: string;
  days: unknown;
  createdAt: string;
};

export type WorkoutSession = {
  id: string;
  userId: string;
  date: string;
  planDayRef: string;
  completed: boolean;
  notes: string | null;
  createdAt: string;
};

type WorkoutPlanProps = {
  plan: WorkoutPlanPayload;
  sessions: WorkoutSession[];
  onSessionLogged?: () => void;
};

function normalizeDays(raw: unknown): WorkoutDay[] {
  if (!Array.isArray(raw)) return [];
  return raw as WorkoutDay[];
}

function dayRef(day: WorkoutDay, index: number): string {
  if (day.id != null && String(day.id).length > 0) return String(day.id);
  if (day.dayRef != null && String(day.dayRef).length > 0)
    return String(day.dayRef);
  return `day-${index}`;
}

function dayTitle(day: WorkoutDay, index: number): string {
  return (
    day.label ??
    day.title ??
    day.name ??
    day.day ??
    `Day ${index + 1}`
  );
}

function exerciseName(ex: WorkoutExercise): string {
  return ex.name ?? ex.exercise ?? ex.movement ?? "Exercise";
}

function formatRest(ex: WorkoutExercise): string | null {
  if (ex.restSeconds != null) return `${ex.restSeconds}s`;
  if (ex.rest) return String(ex.rest);
  if (ex.restPeriod) return String(ex.restPeriod);
  return null;
}

function dateForPlanDay(weekStartIso: string, dayIndex: number): string {
  return localPlanDayNoonIso(weekStartIso, dayIndex);
}

function weekdayForPlanDay(weekStartIso: string, dayIndex: number): string {
  const d = new Date(dateForPlanDay(weekStartIso, dayIndex));
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function isDayCompleted(
  sessions: WorkoutSession[],
  ref: string
): boolean {
  const latest = sessions
    .filter((s) => s.planDayRef === ref)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  return latest?.completed ?? false;
}

export function WorkoutPlan({
  plan,
  sessions,
  onSessionLogged,
}: WorkoutPlanProps) {
  const days = useMemo(() => normalizeDays(plan.days), [plan.days]);
  const [loggingRef, setLoggingRef] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const completedCount = useMemo(() => {
    return days.filter((d, i) =>
      isDayCompleted(sessions, dayRef(d, i))
    ).length;
  }, [days, sessions]);

  const totalDays = days.length;
  const progressPercent =
    totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;

  const setSessionCompletion = async (dayIndex: number, completed: boolean) => {
    const d = days[dayIndex];
    const ref = dayRef(d, dayIndex);
    setLogError(null);
    setLoggingRef(ref);
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateForPlanDay(plan.weekStart, dayIndex),
          planDayRef: ref,
          completed,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      dispatchFitaiRefresh({ source: "workouts", scopes: ["workouts", "dashboard"] });
      onSessionLogged?.();
    } catch (e) {
      setLogError(e instanceof Error ? e.message : "Failed to update session");
    } finally {
      setLoggingRef(null);
    }
  };

  if (totalDays === 0) {
    return (
      <Card className="border-surface-border bg-card/80">
        <CardHeader>
          <CardTitle className="text-white">Weekly plan</CardTitle>
          <CardDescription>
            This plan has no days defined yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-surface-border bg-card/80">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle className="text-white">
                Weekly <span className="text-[#00ff88]">training</span>
              </CardTitle>
              <CardDescription>{formatLocalWeekRangeLabel(plan.weekStart)}</CardDescription>
            </div>
            <Badge
              variant="outline"
              className="border-[#00aaff]/40 text-[#00aaff]"
            >
              {completedCount} / {totalDays} days
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Weekly progress</span>
              <span className="text-[#00ff88]">{progressPercent}%</span>
            </div>
            <Progress
              value={progressPercent}
              className="h-2 bg-surface-dark [&>div]:bg-[#00ff88]"
            />
          </div>
        </CardHeader>
      </Card>

      {logError && (
        <p className="text-sm text-red-400" role="alert">
          {logError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day, index) => {
          const ref = dayRef(day, index);
          const done = isDayCompleted(sessions, ref);
          const exercises = day.exercises ?? [];

          return (
            <Card
              key={ref}
              className={`border-surface-border bg-surface-dark/40 ${
                done ? "ring-1 ring-[#00ff88]/30" : ""
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[#00aaff]">
                      {weekdayForPlanDay(plan.weekStart, index)}
                    </p>
                    <CardTitle className="text-lg text-white">
                      {dayTitle(day, index)}
                    </CardTitle>
                  </div>
                  {done && (
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00ff88]/15 text-[#00ff88] hover:bg-[#00ff88]/25"
                      aria-label="Mark incomplete"
                      title="Mark incomplete"
                      disabled={loggingRef === ref}
                      onClick={() => void setSessionCompletion(index, false)}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {day.focus && (
                  <CardDescription className="text-[#ffaa00]/90">
                    {day.focus}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-sm">
                  {exercises.length === 0 ? (
                    <li className="text-gray-500">Rest or mobility</li>
                  ) : (
                    exercises.map((ex, j) => {
                      const rest = formatRest(ex);
                      return (
                        <li
                          key={`${ref}-ex-${j}`}
                          className="rounded-md border border-surface-border bg-black/20 px-3 py-2"
                        >
                          <span className="font-medium text-gray-100">
                            {exerciseName(ex)}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
                            {ex.sets != null && (
                              <Badge
                                variant="secondary"
                                className="bg-surface-dark text-gray-300"
                              >
                                {ex.sets} sets
                              </Badge>
                            )}
                            {ex.reps != null && (
                              <Badge
                                variant="secondary"
                                className="bg-surface-dark text-gray-300"
                              >
                                {ex.reps} reps
                              </Badge>
                            )}
                            {rest && (
                              <Badge
                                variant="outline"
                                className="border-[#00aaff]/30 text-[#00aaff]"
                              >
                                Rest {rest}
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
                <Button
                  className="w-full bg-[#00ff88] text-black hover:bg-[#00ff88]/90"
                  disabled={loggingRef === ref}
                  onClick={() => void setSessionCompletion(index, !done)}
                >
                  {loggingRef === ref ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating…
                    </>
                  ) : done ? (
                    "Mark incomplete"
                  ) : (
                    "Log session"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
