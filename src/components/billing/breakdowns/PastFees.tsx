"use client";

import {
  formatCompactMonthYearRangeLabel,
  formatCurrency,
  formatDateDocnoLabel,
} from "@/lib/utils/breakdown-format-utils";
import type { ResidentBreakdownRow } from "@/lib/schema/resident-breakdown.schema";

type PastFeesProps = {
  dateFrom: string;
  dateTo: string;
  rows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
};

export function PastFees({
  dateFrom,
  dateTo,
  rows,
  isLoading,
  isError,
  error,
  onRetry,
}: PastFeesProps) {
  return (
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-bold">Settled Fees</h3>
        <p className="text-sm font-semibold text-gray-500">
          {formatCompactMonthYearRangeLabel(dateFrom, dateTo)}
        </p>
      </div>

      <LedgerRows
        rows={rows}
        isLoading={isLoading}
        isError={isError}
        error={error}
        emptyLabel="No fees found for this period."
        fallbackError="Could not load past fees."
        onRetry={onRetry}
      />
    </section>
  );
}

type LedgerRowsProps = {
  rows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  emptyLabel: string;
  fallbackError: string;
  onRetry: () => void;
};

function LedgerRows({
  rows,
  isLoading,
  isError,
  error,
  emptyLabel,
  fallbackError,
  onRetry,
}: LedgerRowsProps) {
  if (isLoading) {
    return (
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
    );
  }

  if (isError) {
    return (
      <div className="border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          {error instanceof Error ? error.message : fallbackError}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">{emptyLabel}</p>;
  }

  return (
    <div className="-mx-2 space-y-1">
      {rows.map((row, index) => (
        <div key={`${row.docno}-${index}`} className="px-3 py-3 hover:bg-gray-50">
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
  );
}
