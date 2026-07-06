import type {
  BalanceApiRow,
  ElectricityApiRow,
  LedgerApiRow,
} from "@/app/server/repositories/billing-breakdown.repo";
import type { ResidentBreakdownRow } from "@/lib/schema/resident-breakdown.schema";
import { formatApiDate, parseApiDate } from "@/lib/utils/breakdown-date-utils";
import { parseMoney } from "@/lib/utils/breakdown-format-utils";
import { codeFromDocNo, resolveInterestCode } from "@/lib/utils/code-utils";

export type FloatingCreditReconciliationMode =
  | "all"
  | "subset"
  | "aggregate_only"
  | "none";

export type DownpaymentCandidate = {
  docno: string;
  docdate: string;
  remarks: string;
  originalAmount: number;
  candidateRemaining: number;
  source: "ledger" | "electricity";
};

export type EnrichedDownpaymentCandidate = DownpaymentCandidate & {
  paymentNet: number;
  refdocs: string[];
  referencedCmTotal: number;
  ledgerImpliedRemaining: number;
  isLedgerExhausted: boolean;
};

export type ReconcileLaneResult = {
  displayed: EnrichedDownpaymentCandidate[];
  hidden: EnrichedDownpaymentCandidate[];
  mode: FloatingCreditReconciliationMode;
  derivedCredit: number;
  candidateSum: number;
  needsPastLedger: boolean;
};

type BalanceLikeRow = BalanceApiRow | ElectricityApiRow;

const DEFAULT_TOLERANCE = 0.01;

function isArinvoice(row: { type?: string }): boolean {
  return (row.type ?? "").toLowerCase() === "arinvoice";
}

function isDownpayment(row: { type?: string }): boolean {
  return (row.type ?? "").toLowerCase() === "downpayment";
}

function isArcreditmemo(row: { type?: string }): boolean {
  return (row.type ?? "").toLowerCase() === "arcreditmemo";
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function splitCsv(value: string | string[] | undefined | null): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.map((part) => normalizeText(part)).filter(Boolean);
  }

  const text = normalizeText(value);
  if (!text) return [];

  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function sumOutstandingFees(rows: BalanceLikeRow[]): number {
  // arcreditmemo carries a negative dueamount and reduces net fees. It is
  // hidden from the resident's fee list (normalizeBalanceRows shows arinvoice
  // only) but MUST count here, else derivedCredit is overstated by its amount
  // and reconcileDownpaymentCandidates wrongly falls to "aggregate_only".
  return rows
    .filter((row) => isArinvoice(row) || isArcreditmemo(row))
    .reduce((sum, row) => sum + parseMoney(row.dueamount), 0);
}

export function getLedgerFinalBalance(ledgerRows: LedgerApiRow[]): number {
  const lastRow = [...ledgerRows].reverse().find((row) => row.balance);
  return parseMoney(lastRow?.balance);
}

export function deriveTotalCredit(
  totalOutstandingFees: number,
  ledgerFinalBalance: number,
): number {
  return Math.max(0, totalOutstandingFees - ledgerFinalBalance);
}

export function buildDownpaymentCandidates(
  rows: BalanceLikeRow[],
  source: "ledger" | "electricity",
): DownpaymentCandidate[] {
  return rows.filter(isDownpayment).map((row) => ({
    docno: normalizeText(row.docno),
    docdate: normalizeText(row.docdate),
    remarks: normalizeText(row.remarks),
    originalAmount: Math.abs(parseMoney(row.amount)),
    candidateRemaining: Math.abs(parseMoney(row.dueamount)),
    source,
  }));
}

export function indexLedgerRows(ledgerRows: LedgerApiRow[]): {
  byDocno: Map<string, LedgerApiRow>;
  cmByDocno: Map<string, LedgerApiRow>;
} {
  const byDocno = new Map<string, LedgerApiRow>();
  const cmByDocno = new Map<string, LedgerApiRow>();

  for (const row of ledgerRows) {
    const docno = normalizeText(row.docno);
    if (!docno) continue;

    byDocno.set(docno, row);

    if ((row.doctype ?? "").toLowerCase() === "creditmemo") {
      cmByDocno.set(docno, row);
    }
  }

  return { byDocno, cmByDocno };
}

export function ledgerHasRefdocs(ledgerRows: LedgerApiRow[]): boolean {
  return ledgerRows.some((row) => splitCsv(row.refdocs).length > 0);
}

export function enrichCandidateFromLedger(
  candidate: DownpaymentCandidate,
  indexes: ReturnType<typeof indexLedgerRows>,
): EnrichedDownpaymentCandidate {
  const ledgerRow = indexes.byDocno.get(candidate.docno);
  const paymentNet =
    parseMoney(ledgerRow?.credit) - parseMoney(ledgerRow?.debit);
  const refdocs = splitCsv(ledgerRow?.refdocs);

  let referencedCmTotal = 0;
  for (const refDocno of refdocs) {
    const cmRow = indexes.cmByDocno.get(refDocno);
    if (cmRow) {
      referencedCmTotal += parseMoney(cmRow.credit);
    }
  }

  const ledgerImpliedRemaining = Math.max(0, paymentNet - referencedCmTotal);
  const isLedgerExhausted =
    paymentNet > 0 && referencedCmTotal >= paymentNet - DEFAULT_TOLERANCE;

  return {
    ...candidate,
    paymentNet,
    refdocs,
    referencedCmTotal,
    ledgerImpliedRemaining,
    isLedgerExhausted,
  };
}

function parseDocdateTime(docdate: string): number {
  return parseApiDate(docdate)?.getTime() ?? 0;
}

function staleMismatch(candidate: EnrichedDownpaymentCandidate): number {
  return Math.max(0, candidate.candidateRemaining - candidate.ledgerImpliedRemaining);
}

function subsetSum(
  candidates: EnrichedDownpaymentCandidate[],
  target: number,
  tolerance: number,
): EnrichedDownpaymentCandidate[] | null {
  const n = candidates.length;
  if (n === 0) return null;

  let bestSubset: EnrichedDownpaymentCandidate[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const totalMasks = 1 << n;
  for (let mask = 1; mask < totalMasks; mask++) {
    const subset: EnrichedDownpaymentCandidate[] = [];
    let sum = 0;

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        subset.push(candidates[i]);
        sum += candidates[i].candidateRemaining;
      }
    }

    if (Math.abs(sum - target) > tolerance) continue;

    const score = subset.reduce((total, candidate) => {
      const refdocsBonus = candidate.refdocs.length === 0 ? 1000 : 0;
      const dateScore = parseDocdateTime(candidate.docdate);
      const impliedCloseness = -Math.abs(
        candidate.candidateRemaining - candidate.ledgerImpliedRemaining,
      );
      return (
        total +
        refdocsBonus +
        dateScore / 1_000_000_000 +
        impliedCloseness / 1000
      );
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSubset = subset;
    }
  }

  return bestSubset;
}

function greedyRemoveOverstatement(
  candidates: EnrichedDownpaymentCandidate[],
  derivedTotalCredit: number,
  tolerance: number,
): EnrichedDownpaymentCandidate[] {
  let remaining = [...candidates];
  let sum = remaining.reduce(
    (total, candidate) => total + candidate.candidateRemaining,
    0,
  );

  while (sum > derivedTotalCredit + tolerance && remaining.length > 0) {
    remaining.sort((a, b) => {
      const mismatchDiff = staleMismatch(b) - staleMismatch(a);
      if (Math.abs(mismatchDiff) > tolerance) return mismatchDiff;
      return parseDocdateTime(a.docdate) - parseDocdateTime(b.docdate);
    });

    const removed = remaining.shift();
    if (!removed) break;
    sum -= removed.candidateRemaining;
  }

  return remaining;
}

export function reconcileDownpaymentCandidates(
  candidates: EnrichedDownpaymentCandidate[],
  derivedTotalCredit: number,
  options?: { tolerance?: number },
): {
  displayed: EnrichedDownpaymentCandidate[];
  hidden: EnrichedDownpaymentCandidate[];
  mode: FloatingCreditReconciliationMode;
} {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;

  if (derivedTotalCredit <= tolerance) {
    return { displayed: [], hidden: candidates, mode: "none" };
  }

  const candidateSum = candidates.reduce(
    (sum, candidate) => sum + candidate.candidateRemaining,
    0,
  );

  if (Math.abs(candidateSum - derivedTotalCredit) <= tolerance) {
    return { displayed: candidates, hidden: [], mode: "all" };
  }

  if (candidateSum < derivedTotalCredit - tolerance) {
    return { displayed: [], hidden: candidates, mode: "aggregate_only" };
  }

  const exhausted = candidates.filter((candidate) => candidate.isLedgerExhausted);
  const active = candidates.filter((candidate) => !candidate.isLedgerExhausted);
  const activeSum = active.reduce(
    (sum, candidate) => sum + candidate.candidateRemaining,
    0,
  );

  if (Math.abs(activeSum - derivedTotalCredit) <= tolerance) {
    return { displayed: active, hidden: exhausted, mode: "subset" };
  }

  if (active.length <= 12) {
    const exactSubset = subsetSum(active, derivedTotalCredit, tolerance);
    if (exactSubset) {
      const displayedDocnos = new Set(exactSubset.map((row) => row.docno));
      const hidden = candidates.filter((row) => !displayedDocnos.has(row.docno));
      return { displayed: exactSubset, hidden, mode: "subset" };
    }
  }

  const greedyRemaining = greedyRemoveOverstatement(
    active,
    derivedTotalCredit,
    tolerance,
  );
  const greedySum = greedyRemaining.reduce(
    (sum, candidate) => sum + candidate.candidateRemaining,
    0,
  );

  if (
    greedyRemaining.length > 0 &&
    Math.abs(greedySum - derivedTotalCredit) <= tolerance
  ) {
    const displayedDocnos = new Set(greedyRemaining.map((row) => row.docno));
    const hidden = candidates.filter((row) => !displayedDocnos.has(row.docno));
    return { displayed: greedyRemaining, hidden, mode: "subset" };
  }

  if (active.length <= 12) {
    return { displayed: [], hidden: candidates, mode: "aggregate_only" };
  }

  return { displayed: [], hidden: candidates, mode: "aggregate_only" };
}

export function computePastLedgerDateRange(
  candidates: Array<{ docdate?: string }>,
  feeRows?: Array<{ docdate?: string }>,
  today = new Date(),
): { dateFrom: string; dateTo: string } {
  const dates: Date[] = [];

  for (const row of [...candidates, ...(feeRows ?? [])]) {
    const parsed = parseApiDate(row.docdate ?? "");
    if (parsed) dates.push(parsed);
  }

  const dateTo = formatApiDate(today);

  if (dates.length === 0) {
    const fallback = new Date(today);
    fallback.setFullYear(today.getFullYear() - 5);
    console.warn(
      "[floating-balance] Could not parse candidate/fee dates; falling back to 5-year window.",
    );
    return {
      dateFrom: formatApiDate(
        new Date(fallback.getFullYear(), fallback.getMonth(), 1),
      ),
      dateTo,
    };
  }

  const oldest = dates.reduce((min, date) => (date < min ? date : min), dates[0]);
  const dateFrom = formatApiDate(
    new Date(oldest.getFullYear(), oldest.getMonth(), 1),
  );

  return { dateFrom, dateTo };
}

export function toUncreditedPaymentRows(
  displayed: EnrichedDownpaymentCandidate[],
): ResidentBreakdownRow[] {
  return displayed.map((candidate) => {
    const code =
      candidate.source === "electricity"
        ? "EL"
        : codeFromDocNo(candidate.docno);
    const remarks = candidate.remarks;

    return {
      source: candidate.source,
      docdate: candidate.docdate,
      duedate: candidate.docdate,
      docno: candidate.docno,
      doctype: "downpayment",
      code,
      resolvedCode:
        candidate.source === "electricity"
          ? "EL"
          : resolveInterestCode(code, remarks, candidate.source),
      kind: "payment" as const,
      amount: -candidate.candidateRemaining,
      amountLabel: `-${candidate.candidateRemaining.toFixed(2)}`,
      paidAmount: candidate.originalAmount,
      remarks,
    };
  });
}

export function reconcileLane(input: {
  feeRows: BalanceLikeRow[];
  paymentCandidateRows: BalanceLikeRow[];
  ledgerRows: LedgerApiRow[];
  pastLedgerRows?: LedgerApiRow[];
  source: "ledger" | "electricity";
  tolerance?: number;
}): ReconcileLaneResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const outstandingFees = sumOutstandingFees(input.feeRows);
  const ledgerFinalBalance = getLedgerFinalBalance(input.ledgerRows);
  const derivedCredit = deriveTotalCredit(outstandingFees, ledgerFinalBalance);
  const candidates = buildDownpaymentCandidates(
    input.paymentCandidateRows,
    input.source,
  );
  const candidateSum = candidates.reduce(
    (sum, candidate) => sum + candidate.candidateRemaining,
    0,
  );

  const combinedLedgerRows = input.pastLedgerRows
    ? [...input.ledgerRows, ...input.pastLedgerRows]
    : input.ledgerRows;
  const indexes = indexLedgerRows(combinedLedgerRows);
  const enriched = candidates.map((candidate) =>
    enrichCandidateFromLedger(candidate, indexes),
  );

  const hasRefdocs = ledgerHasRefdocs(input.ledgerRows);
  const needsPastLedger =
    !input.pastLedgerRows &&
    Math.abs(candidateSum - derivedCredit) > tolerance &&
    !hasRefdocs;

  if (needsPastLedger) {
    return {
      displayed: [],
      hidden: enriched,
      mode: "none",
      derivedCredit,
      candidateSum,
      needsPastLedger: true,
    };
  }

  const reconciliation = reconcileDownpaymentCandidates(
    enriched,
    derivedCredit,
    { tolerance },
  );

  return {
    displayed: reconciliation.displayed,
    hidden: reconciliation.hidden,
    mode: reconciliation.mode,
    derivedCredit,
    candidateSum,
    needsPastLedger: false,
  };
}
