"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WorkoutPlan,
  type WorkoutPlanPayload,
  type WorkoutSession,
} from "@/components/workout-plan";
import { useAtlasRefresh } from "@/hooks/use-atlas-refresh";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WorkoutsApiResponse = {
  plan: WorkoutPlanPayload | null;
  sessions: WorkoutSession[];
};

export default function WorkoutsPage() {
  const [plan, setPlan] = useState<WorkoutPlanPayload | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkouts = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/workouts", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load (${res.status})`);
      }
      const data = (await res.json()) as WorkoutsApiResponse;
      setPlan(data.plan ?? null);
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workouts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkouts();
  }, [loadWorkouts]);

  useAtlasRefresh(
    () => {
      void loadWorkouts();
    },
    { scopes: ["workouts"] },
  );

  const planDayCount = useMemo(() => {
    if (!plan?.days || !Array.isArray(plan.days)) return 0;
    return plan.days.length;
  }, [plan]);

  const completedThisWeek = useMemo(
    () => sessions.filter((s) => s.completed).length,
    [sessions]
  );

  const completionRate = useMemo(() => {
    if (planDayCount <= 0) return null;
    const doneRefs = new Set(
      sessions.filter((s) => s.completed).map((s) => s.planDayRef)
    );
    const uniqueCompletedDays = Math.min(doneRefs.size, planDayCount);
    return Math.round((uniqueCompletedDays / planDayCount) * 100);
  }, [sessions, planDayCount]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Work<span className="text-[#00ff88]">outs</span>
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Follow your Atlas-generated plan and log sessions as you go.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-surface-border bg-card/80">
          <CardHeader className="pb-2">
            <CardDescription>Completed this week</CardDescription>
            <CardTitle className="text-3xl font-bold text-[#00ff88]">
              {loading ? "—" : completedThisWeek}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">
              Total logged sessions marked complete (current week window).
            </p>
          </CardContent>
        </Card>
        <Card className="border-surface-border bg-card/80">
          <CardHeader className="pb-2">
            <CardDescription>Completion rate</CardDescription>
            <CardTitle className="text-3xl font-bold text-[#00aaff]">
              {loading
                ? "—"
                : completionRate == null
                  ? "N/A"
                  : `${completionRate}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500">
              Unique plan days completed vs. days in your current plan.
            </p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {!loading && !plan && (
        <Card className="border-dashed border-[#ffaa00]/40 bg-surface-dark/40">
          <CardHeader>
            <CardTitle className="text-lg text-[#ffaa00]">
              No workout plan yet
            </CardTitle>
            <CardDescription className="text-gray-400">
              Ask <span className="text-[#00ff88]">Atlas</span> in chat to
              generate a weekly workout plan tailored to your goals. Once it is
              saved, your sessions will show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {plan && (
        <WorkoutPlan
          plan={plan}
          sessions={sessions}
          onSessionLogged={() => {
            void loadWorkouts();
          }}
        />
      )}
    </div>
  );
}
