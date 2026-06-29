"use client";

import {
  formatCompactMonthYearRangeLabel,
  formatCurrency,
  formatDateDocnoLabel,
} from "@/lib/utils/breakdown-format-utils";
import type { ResidentBreakdownRow } from "@/lib/schema/resident-breakdown.schema";

type PastPaymentsProps = {
  dateFrom: string;
  dateTo: string;
  rows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
};

export function PastPayments({
  dateFrom,
  dateTo,
  rows,
  isLoading,
  isError,
  error,
  onRetry,
}: PastPaymentsProps) {
  return (
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-bold">Past Payments</h3>
        <p className="text-sm font-semibold text-gray-500">
          {formatCompactMonthYearRangeLabel(dateFrom, dateTo)}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4 py-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index}>
              <div className="mb-2 h-2.5 w-16 animate-pulse bg-gray-100" />
              <div className="flex justify-between gap-4">
                <div className="h-3 w-1/2 animate-pulse bg-gray-100" />
                <div className="h-3 w-16 animate-pulse bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            {error instanceof Error ? error.message : "Could not load past payments."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p className="py-12 text-center text-sm text-gray-500">
          No payments found for this period.
        </p>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="-mx-2 space-y-1">
          {rows.map((row, index) => (
            <div
              key={`${row.docno}-${index}`}
              className="px-3 py-3 hover:bg-gray-50"
            >
              <p className="mb-1 text-xs font-medium text-gray-400">
                {formatDateDocnoLabel(row.docdate, row.docno)}
              </p>
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-[65%] text-xs font-medium leading-relaxed text-gray-600">
                  {row.remarks || "No remarks"}
                </p>
                <p className="shrink-0 text-sm font-bold tabular-nums">
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
