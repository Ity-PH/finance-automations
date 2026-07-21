"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LuChevronDown } from "react-icons/lu";
import { useQueueDepth } from "@/hooks/useQueueDepth";
import { useSlowLoadingMessage } from "@/hooks/useSlowLoadingMessage";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";
import {
  filterRowsByCategories,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";
import { InspectedUnitLabel } from "@/components/billing/breakdowns/InspectedUnitLabel";
import { OutstandingFees } from "@/components/billing/breakdowns/OutstandingFees";
import {
  formatCompactDate,
  formatCurrency,
} from "@/lib/utils/breakdown-format-utils";
import { parseApiDate } from "@/lib/utils/breakdown-date-utils";
import type { ResidentLedgerResponse } from "@/lib/schema/resident-breakdown.schema";

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

async function fetchOutstandingView(bpcode: string, district: "LR" | "HR") {
  const params = new URLSearchParams({
    bpcode,
    district,
    outstanding_view: "true",
  });
  const response = await fetch(`/api/soa-breakdown/outstanding?${params}`);
  const body = (await response.json()) as ApiResponse<ResidentLedgerResponse>;

  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? "Failed to fetch outstanding view.");
  }
  return body.data;
}

function formatBalanceDisplay(raw?: string): string {
  if (!raw) return "0.00";
  const value = Number(raw.replace(/,/g, ""));
  if (value === 0) return "0.00";
  if (value < 0) return `(${raw.replace("-", "")})`;
  return raw;
}

export function ResidentBreakdownRequest() {
  const { credentials, hasCredentials, reconciliationBlocked, setReconciliationBlocked } = useSoaBreakdownCredentials();
  const [selectedCategories, setSelectedCategories] = useState<
    Set<FeeCategoryId>
  >(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState(true);

  const outstandingQuery = useQuery({
    queryKey: [
      "resident-outstanding-view",
      credentials.bpcode,
      credentials.district,
    ],
    queryFn: () =>
      fetchOutstandingView(credentials.bpcode, credentials.district),
    enabled: hasCredentials,
  });

  const slowMessage = useSlowLoadingMessage(outstandingQuery.isLoading);
  const queueDepth = useQueueDepth(outstandingQuery.isLoading);
  const meta = outstandingQuery.data?.meta;

  useEffect(() => {
    if (!meta) return;
    const blocked =
      meta.duesFloatingCreditReconciliation === "aggregate_only" ||
      meta.electricityFloatingCreditReconciliation === "aggregate_only";
    setReconciliationBlocked(blocked);
  }, [meta, setReconciliationBlocked]);

  const loadingMessage = (() => {
    if (queueDepth !== null && queueDepth >= 2)
      return `~${queueDepth} requests in queue`;
    if (queueDepth === 1) return "Almost there...";
    return slowMessage;
  })();

  const uncreditedPaymentRows = useMemo(() => {
    const allRows = outstandingQuery.data?.rows ?? [];
    return allRows.filter((row) => row.kind === "payment");
  }, [outstandingQuery.data?.rows]);

  const filteredRows = useMemo(() => {
    const allRows = (outstandingQuery.data?.rows ?? []).filter(
      (row) => row.kind === "fee",
    );
    return filterRowsByCategories(allRows, selectedCategories);
  }, [outstandingQuery.data?.rows, selectedCategories]);

  const selectedSum = useMemo(() => {
    let sum = 0;
    filteredRows.forEach((row) => {
      const id = `${row.source}-${row.docno}`;
      if (selectedRowIds.has(id)) sum += Math.abs(row.amount);
    });
    uncreditedPaymentRows.forEach((row) => {
      const id = `${row.source}-${row.docno}`;
      if (selectedRowIds.has(id)) sum -= Math.abs(row.amount);
    });
    return sum;
  }, [filteredRows, uncreditedPaymentRows, selectedRowIds]);

  const toggleRow = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const feeIds = filteredRows.map((row) => `${row.source}-${row.docno}`);
    const creditIds = uncreditedPaymentRows.map(
      (row) => `${row.source}-${row.docno}`,
    );
    const allIds = [...feeIds, ...creditIds];
    const allSelected =
      allIds.length > 0 &&
      allIds.every((id) => selectedRowIds.has(id));

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };



  if (!hasCredentials) {
    return null;
  }

  return (
    <div className="space-y-6">
      {reconciliationBlocked && (
        <p className="text-xs font-medium text-red-600">
          Cannot reconcile and reflect payments for this unit due to possible bugs in the
          EBT. This unit currently cannot access SOA breakdowns on the Two
          Serendra App.
        </p>
      )}
      <InspectedUnitLabel />
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Outstanding Balance
        </p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {outstandingQuery.isLoading ? (
              <div className="h-11 w-40 animate-pulse bg-gray-100" />
            ) : (
              <p className="text-4xl font-bold leading-none text-green-700">
                ₱ {formatBalanceDisplay(meta?.balance)}
              </p>
            )}
            {!outstandingQuery.isLoading && !outstandingQuery.isError && (
              <button
                type="button"
                onClick={() => setShowDetails((current) => !current)}
                className="text-green-700 hover:text-green-900"
                aria-label="Split"
              >
                <LuChevronDown
                  className={`text-xl transition-transform ${
                    showDetails ? "rotate-180" : ""
                  }`}
                />
              </button>
            )}
          </div>
          {!outstandingQuery.isLoading && !outstandingQuery.isError && (
            <Link
              href="/soa-breakdown/history"
              className="mr-[21px] text-sm font-semibold text-green-700 hover:text-green-900"
            >
              History
            </Link>
          )}
        </div>

        {outstandingQuery.isError && (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-xs font-medium text-red-700">
              Could not load balance.
            </p>
            <button
              type="button"
              onClick={() => outstandingQuery.refetch()}
              className="text-xs font-bold text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}

        {loadingMessage && !outstandingQuery.isError && (
          <p className="mt-2 text-xs text-gray-400">{loadingMessage}</p>
        )}

        {showDetails && !outstandingQuery.isLoading && !outstandingQuery.isError && (
          <div className="mt-4 grid gap-4 border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
            <BalanceSplit
              label="Dues & Others"
              amount={formatBalanceDisplay(meta?.duesBalance)}
              dueDate={meta?.duesDueDate}
              lastPaymentDate={meta?.duesLastPaymentDate}
            />
            <BalanceSplit
              label="Electricity"
              amount={formatBalanceDisplay(meta?.electricityBalance)}
              dueDate={meta?.electricityDueDate}
              lastPaymentDate={meta?.electricityLastPaymentDate}
            />
          </div>
        )}
      </section>

      <OutstandingFees
        rows={filteredRows}
        creditRows={uncreditedPaymentRows}
        isLoading={outstandingQuery.isLoading}
        isError={outstandingQuery.isError}
        onRetry={() => outstandingQuery.refetch()}
        selectedRowIds={selectedRowIds}
        onToggleRow={toggleRow}
        onToggleSelectAll={toggleSelectAll}
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}
      />

      <button
        type="button"
        disabled={selectedRowIds.size === 0}
        className={`w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
          selectedRowIds.size > 0
            ? "bg-green-700 text-white hover:bg-green-800"
            : "cursor-not-allowed bg-gray-100 text-gray-300"
        }`}
      >
        {selectedRowIds.size > 0
          ? selectedSum < 0
            ? `Total: ₱ (${formatCurrency(Math.abs(selectedSum))})`
            : `Total: ₱ ${formatCurrency(selectedSum)}`
          : "Select Items"}
      </button>
    </div>
  );
}

function BalanceSplit({
  label,
  amount,
  dueDate,
  lastPaymentDate,
}: {
  label: string;
  amount: string;
  dueDate?: string;
  lastPaymentDate?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-gray-900">{amount}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-bold uppercase tracking-widest text-gray-400">Due</p>
          <p className="mt-1 font-semibold text-gray-700">
            {dueDate ? formatCompactDate(dueDate) : "-"}
          </p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-widest text-gray-400">
            Last Payment
          </p>
          <p className="mt-1 font-semibold text-gray-700">
            {lastPaymentDate ? formatCompactDate(lastPaymentDate) : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}


