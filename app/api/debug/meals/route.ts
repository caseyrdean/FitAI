import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";

export async function GET() {
  const plans = await prisma.mealPlan.findMany({
    where: { userId: USER_ID },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return NextResponse.json(plans);
}
