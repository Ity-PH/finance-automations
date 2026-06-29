import { NextRequest, NextResponse } from "next/server";
import { residentBreakdownService } from "@/app/server/services/resident-breakdown.service";
import { ResidentLedgerQuerySchema } from "@/lib/schema/resident-breakdown.schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = ResidentLedgerQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query." },
      { status: 400 },
    );
  }

  const query = parsed.data;
  const credentials = {
    bpcode: query.bpcode,
    district: query.district,
    unitNo: query.unit_no || query.bpcode,
  };

  const result =
    query.kind === "fee"
      ? await residentBreakdownService.getHistoricalFees(
          credentials,
          query.date_from,
          query.date_to,
        )
      : await residentBreakdownService.getHistoricalPayments(
          credentials,
          query.date_from,
          query.date_to,
        );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Failed to fetch ledger breakdown." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.data });
}
