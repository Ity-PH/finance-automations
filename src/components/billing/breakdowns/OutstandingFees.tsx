"use client";

import {
  formatCurrency,
  formatDateDocnoLabel,
} from "@/lib/utils/breakdown-format-utils";
import type { ResidentBreakdownRow } from "@/lib/schema/resident-breakdown.schema";

type OutstandingFeesProps = {
  rows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedRowIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleSelectAll: () => void;
  onSeePast: () => void;
};

export function OutstandingFees({
  rows,
  isLoading,
  isError,
  onRetry,
  selectedRowIds,
  onToggleRow,
  onToggleSelectAll,
  onSeePast,
}: OutstandingFeesProps) {
  const visibleRowIds = rows.map((row) => `${row.source}-${row.docno}`);
  const allVisibleSelected =
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selectedRowIds.has(id));

  return (
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold">Outstanding Fees</h3>
        <div className="flex items-center gap-4">
          {!isLoading && !isError && rows.length > 0 && (
            <button
              type="button"
              onClick={onToggleSelectAll}
              className="text-sm font-semibold text-green-700 hover:text-green-900"
            >
              {allVisibleSelected ? "Unselect All" : "Select All"}
            </button>
          )}
          <button
            type="button"
            onClick={onSeePast}
            className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            See Past Fees
          </button>
        </div>
      </div>

      {isLoading && <LoadingRows count={4} />}

      {isError && !isLoading && (
        <ErrorState label="Could not load fees." onRetry={onRetry} />
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState label="No outstanding fees." />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="-mx-2 space-y-1">
          {rows.map((row) => {
            const id = `${row.source}-${row.docno}`;
            const isSelected = selectedRowIds.has(id);
            const dateLabel = formatDateDocnoLabel(
              row.docdate || row.duedate || "",
              row.docno,
            );

            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggleRow(id)}
                className={`w-full px-3 py-3 text-left transition-colors ${
                  isSelected
                    ? "bg-green-700 text-white"
                    : "hover:bg-gray-50"
                }`}
              >
                <p
                  className={`mb-1 text-xs font-medium ${
                    isSelected ? "text-green-100" : "text-gray-400"
                  }`}
                >
                  {dateLabel}
                </p>
                <div className="flex items-start justify-between gap-4">
                  <p
                    className={`max-w-[70%] text-xs font-medium leading-relaxed ${
                      isSelected ? "text-white" : "text-gray-600"
                    }`}
                  >
                    {row.remarks || "No remarks"}
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {formatCurrency(Math.abs(row.amount))}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="px-3">
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

function ErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium text-red-700">{label}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Try Again
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-12 text-center text-sm text-gray-500">{label}</p>;
}
