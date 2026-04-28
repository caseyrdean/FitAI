import { prisma } from "@/lib/db/client";
import {
  endExclusiveLocalWeek,
  localDayInPlanWeek,
  startOfLocalWeekSunday,
  toLocalDateOnly,
} from "@/lib/local-week";

/** Meal plan whose local week contains today; if several, newest by `createdAt`. */
export async function getMealPlanForToday(userId: string) {
  const today = toLocalDateOnly(new Date());
  const rows = await prisma.mealPlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const matches = rows.filter((p) => localDayInPlanWeek(today, p.weekStart));
  // #region agent log
  fetch('http://127.0.0.1:7702/ingest/8b876957-51d4-454d-9a7e-692ba8eff35d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08b46b'},body:JSON.stringify({sessionId:'08b46b',runId:'initial',hypothesisId:'H3',location:'lib/plan-queries.ts:getMealPlanForToday',message:'evaluated meal plans for current week match',data:{today:toLocalDateOnly(today).toISOString(),rowCount:rows.length,matchCount:matches.length,rowWeekStarts:rows.slice(0,5).map((r)=>toLocalDateOnly(r.weekStart).toISOString())},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0];
}

/** Workout plan whose local week contains today; if several, newest by `createdAt`. */
export async function getWorkoutPlanForToday(userId: string) {
  const today = toLocalDateOnly(new Date());
  const rows = await prisma.workoutPlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const matches = rows.filter((p) => localDayInPlanWeek(today, p.weekStart));
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return matches[0];
}

/** Sessions in the current local Sunday-week (even if there is no plan). */
export async function getWorkoutSessionsForCurrentLocalWeek(userId: string) {
  const ws = startOfLocalWeekSunday(new Date());
  const we = endExclusiveLocalWeek(ws);
  return prisma.workoutSession.findMany({
    where: { userId, date: { gte: ws, lt: we } },
    orderBy: { date: "asc" },
  });
}
