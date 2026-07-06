const ADJUSTMENT_REMARKS_RE = /\badjustments?\b/i;

export function isAdjustmentArinvoiceRemarks(remarks: string): boolean {
  return ADJUSTMENT_REMARKS_RE.test(remarks);
}
