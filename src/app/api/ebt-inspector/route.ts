import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { billingBreakdownRepository } from "@/app/server/repositories/billing-breakdown.repo";
import { DistrictSchema } from "@/lib/schema/resident-breakdown.schema";
import { parseApiDate } from "@/lib/utils/breakdown-date-utils";

export const runtime = "nodejs";

const apiDate = z
  .string()
  .refine((v) => parseApiDate(v) !== null, { message: "Expected MM/DD/YYYY." });

// EBT Inspector: returns RAW upstream rows (no normalization) so the exact
// EBT data can be inspected. balance/electricity_balance come from
// /outstanding; ledger/electricity_ledger need a date range.
const EbtQuerySchema = z
  .object({
    bpcode: z.string().trim().min(1),
    district: DistrictSchema,
    type: z.enum(["balance", "electricity_balance", "ledger", "electricity_ledger"]),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ledger" && v.type !== "electricity_ledger") return;
    for (const key of ["date_from", "date_to"] as const) {
      if (!v[key] || !parseApiDate(v[key]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Valid ${key} is required in MM/DD/YYYY format.`,
          path: [key],
        });
      }
    }
  });

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = EbtQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query." },
      { status: 400 },
    );
  }

  const { bpcode, district, type, date_from, date_to } = parsed.data;

  try {
    let rows: Record<string, unknown>[];
    if (type === "balance" || type === "electricity_balance") {
      const outstanding = await billingBreakdownRepository.fetchOutstanding(
        bpcode,
        district,
      );
      rows = type === "balance" ? outstanding.balance : outstanding.electricity;
    } else if (type === "ledger") {
      const past = await billingBreakdownRepository.fetchPastLedger(
        bpcode,
        district,
        date_from!,
        date_to!,
      );
      rows = past.ledger;
    } else {
      rows = await billingBreakdownRepository.fetchElectricityLedger(
        bpcode,
        district,
        date_from!,
        date_to!,
      );
    }

    return NextResponse.json({ success: true, data: { rows: rows ?? [] } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch EBT data.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
