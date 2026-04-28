import { NextResponse } from "next/server";
import { getMealPlanForToday } from "@/lib/plan-queries";
import { shoppingListTelemetry } from "@/lib/shopping/normalize";
import { USER_ID } from "@/lib/user";

/** Plan for the local week that contains today only (no “next future week” fallback). */
export async function GET() {
  const plan = await getMealPlanForToday(USER_ID);
  // #region agent log
  fetch('http://127.0.0.1:7702/ingest/8b876957-51d4-454d-9a7e-692ba8eff35d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08b46b'},body:JSON.stringify({sessionId:'08b46b',runId:'initial',hypothesisId:'H3',location:'app/api/meals/route.ts:GET',message:'/api/meals returning plan payload',data:{hasPlan:!!plan,planId:plan?.id??null,weekStart:plan?.weekStart??null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!plan) {
    return NextResponse.json(plan);
  }
  return NextResponse.json({
    ...plan,
    shoppingTelemetry: shoppingListTelemetry(plan.shoppingList),
  });
}
