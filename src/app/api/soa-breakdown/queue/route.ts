import { NextResponse } from "next/server";
import { billingBreakdownRepository } from "@/app/server/repositories/billing-breakdown.repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const depth = await billingBreakdownRepository.fetchQueueDepth();
    return NextResponse.json({ depth });
  } catch {
    return NextResponse.json({ depth: 0 });
  }
}
