import { NextRequest, NextResponse } from "next/server";
import { residentBreakdownService } from "@/app/server/services/resident-breakdown.service";
import { ResidentFeesQuerySchema } from "@/lib/schema/resident-breakdown.schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = ResidentFeesQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query." },
      { status: 400 },
    );
  }

  const query = parsed.data;
  const result = await residentBreakdownService.getFees({
    bpcode: query.bpcode,
    district: query.district,
    unitNo: query.unit_no || query.bpcode,
    dateFrom: query.date_from,
    dateTo: query.date_to,
    includeElectricity: query.include_electricity,
    balanceOnly: query.balance_only,
    outstandingView: query.outstanding_view,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Failed to fetch outstanding breakdown." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.data });
}
