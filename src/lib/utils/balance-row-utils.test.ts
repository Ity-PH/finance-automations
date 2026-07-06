import { describe, expect, it } from "vitest";
import { isAdjustmentArinvoiceRemarks } from "@/lib/utils/balance-row-utils";

describe("isAdjustmentArinvoiceRemarks", () => {
  it("matches adjustment remarks case-insensitively", () => {
    expect(isAdjustmentArinvoiceRemarks("Adjustment")).toBe(true);
    expect(isAdjustmentArinvoiceRemarks("ADJUSTMENT JUN 2025 SOA")).toBe(true);
    expect(isAdjustmentArinvoiceRemarks("Adjustments for prior period")).toBe(
      true,
    );
  });

  it("does not match unrelated fee remarks", () => {
    expect(
      isAdjustmentArinvoiceRemarks(
        "Parking Slot Renewal 2S-002 & 2S-003 - Feb 2026",
      ),
    ).toBe(false);
    expect(
      isAdjustmentArinvoiceRemarks("07/2026 Association Dues 82.50sqm @ 125.00/sqm"),
    ).toBe(false);
  });
});
