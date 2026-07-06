import { describe, expect, it } from "vitest";
import type {
  BalanceApiRow,
  ElectricityApiRow,
  LedgerApiRow,
} from "@/app/server/repositories/billing-breakdown.repo";
import {
  buildDownpaymentCandidates,
  computePastLedgerDateRange,
  deriveTotalCredit,
  enrichCandidateFromLedger,
  getLedgerFinalBalance,
  indexLedgerRows,
  reconcileDownpaymentCandidates,
  reconcileLane,
  splitCsv,
  sumOutstandingFees,
} from "@/lib/billing/floating-balance";

const unit3506BalanceRows: BalanceApiRow[] = [
  {
    type: "arinvoice",
    docno: "EC-26-03-05280",
    dueamount: "269.27",
  },
  {
    type: "arinvoice",
    docno: "AD-26-04-08252",
    dueamount: "15,187.50",
  },
  {
    type: "arinvoice",
    docno: "EC-26-04-07620",
    dueamount: "1,215.00",
  },
  {
    type: "arinvoice",
    docno: "AD-26-05-10494",
    dueamount: "15,187.50",
  },
  {
    type: "arinvoice",
    docno: "EC-26-05-09861",
    dueamount: "1,215.00",
  },
  {
    type: "arinvoice",
    docno: "AD-26-06-12727",
    dueamount: "15,187.50",
  },
  {
    type: "arinvoice",
    docno: "EC-26-06-12093",
    dueamount: "1,215.00",
  },
  {
    type: "downpayment",
    docno: "ACR650504-2S",
    docdate: "11/05/2025",
    amount: "-10,000.00",
    dueamount: "-6,525.59",
    remarks: "Water September 2025",
  },
  {
    type: "downpayment",
    docno: "ACR673518-2S",
    docdate: "02/04/2026",
    amount: "-10,000.00",
    dueamount: "-10,000.00",
    remarks: "WATER ADVANCE PAYMENT",
  },
  {
    type: "downpayment",
    docno: "ACR692044-2S",
    docdate: "04/30/2026",
    amount: "-1,000.00",
    dueamount: "-1,000.00",
    remarks: "WATER ADVANCE PAYMENT",
  },
  {
    type: "downpayment",
    docno: "ACR700858-2S",
    docdate: "06/04/2026",
    amount: "-15,548.68",
    dueamount: "-15,548.68",
    remarks: "05/2026 Association Dues partial",
  },
];

const unit3506LedgerTail: LedgerApiRow[] = [
  {
    docdate: "06/20/2026",
    docno: "EC-26-06-12093",
    doctype: "ARINVOICE",
    debit: "1,215.00",
    balance: "16,402.50",
  },
];

const unit517FBalanceRows: BalanceApiRow[] = [
  {
    type: "arinvoice",
    docno: "AD-26-05-09749",
    dueamount: "5,250.00",
  },
  {
    type: "arinvoice",
    docno: "AD-26-06-11982",
    dueamount: "5,250.00",
  },
  {
    type: "arinvoice",
    docno: "EC-26-06-11348",
    dueamount: "420.00",
  },
  {
    type: "downpayment",
    docno: "ACR0543409",
    docdate: "11/28/2023",
    amount: "-9,369.98",
    dueamount: "-9,324.00",
    remarks: "ASSOCIATION DUES",
  },
  {
    type: "downpayment",
    docno: "ACR683649-2S",
    docdate: "03/14/2026",
    amount: "-6,203.68",
    dueamount: "-3,956.43",
    remarks: "Water Jan 2026",
  },
  {
    type: "downpayment",
    docno: "ACR701642-2S",
    docdate: "06/09/2026",
    amount: "-5,231.29",
    dueamount: "-1,293.57",
    remarks: "05/2026 Bal partial",
  },
];

const unit517FLedgerRows: LedgerApiRow[] = [
  {
    docdate: "11/28/2023",
    docno: "ACR0543409",
    doctype: "INCOMINGPAYMENT",
    credit: "9,369.98",
    balance: "-16,130.95",
    refdocs: "CM-23-11-09663, CM-24-04-08400",
  },
  {
    docdate: "11/28/2023",
    docno: "CM-23-11-09663",
    doctype: "CREDITMEMO",
    credit: "9,324.00",
  },
  {
    docdate: "04/30/2024",
    docno: "CM-24-04-08400",
    doctype: "CREDITMEMO",
    credit: "161.98",
  },
  {
    docdate: "03/14/2026",
    docno: "ACR683649-2S",
    doctype: "INCOMINGPAYMENT",
    credit: "6,203.68",
    refdocs: "CM-26-03-10016, CM-26-03-10024, CM-26-05-16192",
  },
  {
    docdate: "03/20/2026",
    docno: "CM-26-03-10016",
    doctype: "CREDITMEMO",
    credit: "1,117.96",
  },
  {
    docdate: "03/20/2026",
    docno: "CM-26-03-10024",
    doctype: "CREDITMEMO",
    credit: "107.01",
  },
  {
    docdate: "05/20/2026",
    docno: "CM-26-05-16192",
    doctype: "CREDITMEMO",
    credit: "1,022.28",
  },
  {
    docdate: "06/09/2026",
    docno: "ACR701642-2S",
    doctype: "INCOMINGPAYMENT",
    credit: "5,231.29",
    refdocs: "CM-26-06-17472",
  },
  {
    docdate: "06/09/2026",
    docno: "CM-26-06-17472",
    doctype: "CREDITMEMO",
    credit: "3,937.72",
  },
  {
    docdate: "06/20/2026",
    docno: "EC-26-06-11348",
    doctype: "ARINVOICE",
    debit: "420.00",
    balance: "5,670.00",
  },
];

describe("floating-balance", () => {
  it("3506 dues lane — healthy tower shows all candidates", () => {
    const feeRows = unit3506BalanceRows.filter((row) => row.type === "arinvoice");
    const paymentRows = unit3506BalanceRows.filter(
      (row) => row.type === "downpayment",
    );

    const outstandingFees = sumOutstandingFees(feeRows);
    expect(outstandingFees).toBeCloseTo(49476.77, 2);

    const ledgerFinalBalance = getLedgerFinalBalance(unit3506LedgerTail);
    expect(ledgerFinalBalance).toBeCloseTo(16402.5, 2);

    const derivedCredit = deriveTotalCredit(outstandingFees, ledgerFinalBalance);
    expect(derivedCredit).toBeCloseTo(33074.27, 2);

    const candidates = buildDownpaymentCandidates(paymentRows, "ledger");
    const candidateSum = candidates.reduce(
      (sum, candidate) => sum + candidate.candidateRemaining,
      0,
    );
    expect(candidateSum).toBeCloseTo(33074.27, 2);

    const indexes = indexLedgerRows(unit3506LedgerTail);
    const enriched = candidates.map((candidate) =>
      enrichCandidateFromLedger(candidate, indexes),
    );
    const result = reconcileDownpaymentCandidates(enriched, derivedCredit);

    expect(result.mode).toBe("all");
    expect(result.hidden).toHaveLength(0);
    expect(result.displayed).toHaveLength(4);
  });

  it("517F dues lane — hides stale ACR0543409 and keeps reconciled subset", () => {
    const feeRows = unit517FBalanceRows.filter((row) => row.type === "arinvoice");
    const paymentRows = unit517FBalanceRows.filter(
      (row) => row.type === "downpayment",
    );

    const result = reconcileLane({
      feeRows,
      paymentCandidateRows: paymentRows,
      ledgerRows: unit517FLedgerRows,
      source: "ledger",
    });

    expect(result.derivedCredit).toBeCloseTo(5250, 2);
    expect(result.mode).toBe("subset");
    expect(result.displayed.map((row) => row.docno).sort()).toEqual([
      "ACR683649-2S",
      "ACR701642-2S",
    ]);
    expect(result.hidden.map((row) => row.docno)).toContain("ACR0543409");

    const displayedSum = result.displayed.reduce(
      (sum, row) => sum + row.candidateRemaining,
      0,
    );
    expect(displayedSum).toBeCloseTo(5250, 2);
  });

  it("electricity lane — exact match shows all candidates", () => {
    const electricityFeeRows: ElectricityApiRow[] = [
      { type: "arinvoice", dueamount: "1,500.00" },
      { type: "arinvoice", dueamount: "500.00" },
    ];
    const electricityPaymentRows: ElectricityApiRow[] = [
      {
        type: "downpayment",
        docno: "ACR-EL-1",
        docdate: "04/01/2026",
        amount: "-500.00",
        dueamount: "-500.00",
        remarks: "Electricity advance",
      },
      {
        type: "downpayment",
        docno: "ACR-EL-2",
        docdate: "05/01/2026",
        amount: "-300.00",
        dueamount: "-300.00",
        remarks: "Electricity advance",
      },
    ];
    const electricityLedgerRows: LedgerApiRow[] = [
      {
        docdate: "05/01/2026",
        docno: "EL-INV-1",
        doctype: "ARINVOICE",
        debit: "800.00",
        balance: "1,200.00",
      },
    ];

    const result = reconcileLane({
      feeRows: electricityFeeRows,
      paymentCandidateRows: electricityPaymentRows,
      ledgerRows: electricityLedgerRows,
      source: "electricity",
    });

    expect(result.derivedCredit).toBeCloseTo(800, 2);
    expect(result.mode).toBe("all");
    expect(result.displayed).toHaveLength(2);
  });

  it("electricity lane — zero derived credit hides all downpayments", () => {
    const electricityFeeRows: ElectricityApiRow[] = [
      { type: "arinvoice", dueamount: "1,000.00" },
    ];
    const electricityPaymentRows: ElectricityApiRow[] = [
      {
        type: "downpayment",
        docno: "ACR-EL-3",
        docdate: "04/01/2026",
        amount: "-500.00",
        dueamount: "-500.00",
      },
    ];
    const electricityLedgerRows: LedgerApiRow[] = [
      {
        docdate: "05/01/2026",
        docno: "EL-INV-2",
        doctype: "ARINVOICE",
        debit: "500.00",
        balance: "1,000.00",
      },
    ];

    const result = reconcileLane({
      feeRows: electricityFeeRows,
      paymentCandidateRows: electricityPaymentRows,
      ledgerRows: electricityLedgerRows,
      source: "electricity",
    });

    expect(result.derivedCredit).toBe(0);
    expect(result.mode).toBe("none");
    expect(result.displayed).toHaveLength(0);
  });

  it("splitCsv handles array refdocs from API", () => {
    expect(splitCsv(["CM-23-11-09663", "CM-24-04-08400"])).toEqual([
      "CM-23-11-09663",
      "CM-24-04-08400",
    ]);
  });

  it("computePastLedgerDateRange uses oldest candidate month start", () => {
    const range = computePastLedgerDateRange(
      [{ docdate: "11/28/2023" }, { docdate: "03/14/2026" }],
      undefined,
      new Date(2026, 5, 29),
    );

    expect(range.dateFrom).toBe("11/01/2023");
    expect(range.dateTo).toBe("06/29/2026");
  });

  it("391 dues lane — arcreditmemo counts in fees so advance still shows", () => {
    // UO-00391: hidden arcreditmemo (-1,000 Pet ID reversal) is baked into the
    // ledger balance. If sumOutstandingFees ignored it, derivedCredit would be
    // overstated by 1,000, exceed candidateSum, and fall to "aggregate_only"
    // (hiding the 76,545 advance). Counting it nets derivedCredit == candidateSum.
    const balanceRows: BalanceApiRow[] = [
      { type: "arinvoice", docno: "AD-26-06-06516", dueamount: "11,812.50" },
      { type: "arinvoice", docno: "WA-26-06-04613", dueamount: "3,021.30" },
      { type: "arcreditmemo", docno: "ARCM-26-07-00178", dueamount: "-1,000.00" },
      {
        type: "downpayment",
        docno: "ACR647020-2S",
        docdate: "01/07/2026",
        amount: "-153,090.00",
        dueamount: "-76,545.00",
        remarks: "01/2026 - 12/2026 Association Dues & Equity Contribution",
      },
      {
        type: "downpayment",
        docno: "ACR698475-2S",
        docdate: "06/01/2026",
        amount: "-439.00",
        dueamount: "-0.94",
        remarks: "Water Apr 2026 with over",
      },
    ];
    const ledgerRows: LedgerApiRow[] = [
      {
        docdate: "07/02/2026",
        docno: "ARCM-26-07-00178",
        doctype: "ARCREDITMEMO",
        credit: "1,000.00",
        balance: "-62,712.14",
        refdocs: "SU-26-06-01773",
      },
    ];

    const feeRows = balanceRows.filter(
      (row) => row.type === "arinvoice" || row.type === "arcreditmemo",
    );
    expect(sumOutstandingFees(feeRows)).toBeCloseTo(13833.8, 2);

    const result = reconcileLane({
      feeRows: balanceRows.filter(
        (row) => row.type === "arinvoice" || row.type === "arcreditmemo",
      ),
      paymentCandidateRows: balanceRows.filter(
        (row) => row.type === "downpayment",
      ),
      ledgerRows,
      source: "ledger",
    });

    expect(result.derivedCredit).toBeCloseTo(76545.94, 2);
    expect(result.candidateSum).toBeCloseTo(76545.94, 2);
    expect(result.mode).toBe("all");
    expect(result.displayed.map((row) => row.docno).sort()).toEqual([
      "ACR647020-2S",
      "ACR698475-2S",
    ]);
  });
});
