"use client";

import { useMemo } from "react";
import { parseApiDate } from "@/lib/utils/breakdown-date-utils";
import {
  formatCurrency,
  formatDateDocnoLabel,
} from "@/lib/utils/breakdown-format-utils";
import type { ResidentBreakdownRow } from "@/lib/schema/resident-breakdown.schema";

type UncreditedPaymentsProps = {
  rows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSeePast: () => void;
};

export function UncreditedPayments({
  rows,
  isLoading,
  isError,
  onRetry,
  onSeePast,
}: UncreditedPaymentsProps) {
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const dateA = parseApiDate(a.docdate || a.duedate || "")?.getTime() ?? 0;
        const dateB = parseApiDate(b.docdate || b.duedate || "")?.getTime() ?? 0;
        return dateA - dateB;
      }),
    [rows],
  );

  return (
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Uncredited Payments</h3>
          <p className="mt-1 text-xs font-semibold text-gray-400">
            Advance payments and payments not yet applied in full.
          </p>
        </div>
        <button
          type="button"
          onClick={onSeePast}
          className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          See Past Payments
        </button>
      </div>

      {isLoading && <LoadingRows />}

      {isError && !isLoading && (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-red-700">
            Could not load payments.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Try Again
          </button>
        </div>
      )}

      {!isLoading && !isError && sortedRows.length === 0 && (
        <p className="py-12 text-center text-sm text-gray-500">
          No uncredited payments.
        </p>
      )}

      {!isLoading && !isError && sortedRows.length > 0 && (
        <div className="-mx-2">
          <div className="grid grid-cols-[1fr_96px_96px] gap-2 px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            <span>Payment</span>
            <span className="text-right">Original</span>
            <span className="text-right">Remaining</span>
          </div>
          {sortedRows.map((row, index) => (
            <div
              key={`${row.source}-${row.docno}-${index}`}
              className="px-3 py-3 hover:bg-gray-50"
            >
              <p className="mb-1 text-xs font-medium text-gray-400">
                {formatDateDocnoLabel(row.docdate, row.docno)}
              </p>
              <div className="grid grid-cols-[1fr_96px_96px] items-start gap-2">
                <p className="text-xs font-medium leading-relaxed text-gray-600">
                  {row.remarks || "No remarks"}
                </p>
                <p className="text-right text-xs font-bold tabular-nums">
                  {row.paidAmount != null
                    ? formatCurrency(row.paidAmount)
                    : "-"}
                </p>
                <p className="text-right text-xs font-bold tabular-nums">
                  {formatCurrency(Math.abs(row.amount))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index}>
          <div className="mb-2 h-2.5 w-16 animate-pulse bg-gray-100" />
          <div className="flex justify-between gap-4">
            <div className="h-3 w-1/2 animate-pulse bg-gray-100" />
            <div className="h-3 w-16 animate-pulse bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
