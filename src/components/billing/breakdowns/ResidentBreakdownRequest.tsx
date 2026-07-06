"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LuReceiptText } from "react-icons/lu";
import { useQueueDepth } from "@/hooks/useQueueDepth";
import { useSlowLoadingMessage } from "@/hooks/useSlowLoadingMessage";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";
import { CategoryPills } from "@/components/billing/breakdowns/CategoryPills";
import { InspectedUnitLabel } from "@/components/billing/breakdowns/InspectedUnitLabel";
import { OutstandingFees } from "@/components/billing/breakdowns/OutstandingFees";
import { UncreditedPayments } from "@/components/billing/breakdowns/UncreditedPayments";
import {
  formatCompactDate,
  formatCurrency,
} from "@/lib/utils/breakdown-format-utils";
import type { ResidentLedgerResponse } from "@/lib/schema/resident-breakdown.schema";

type ApiResponse<T> = { success: boolean; data?: T; error?: string };
type BreakdownView = "fee" | "payment";

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
  const router = useRouter();
  const { credentials, hasCredentials } = useSoaBreakdownCredentials();
  const [view, setView] = useState<BreakdownView>("fee");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
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
    if (selectedCodes.size === 0) return allRows;
    return allRows.filter((row) => selectedCodes.has(row.resolvedCode));
  }, [outstandingQuery.data?.rows, selectedCodes]);

  const selectedSum = useMemo(() => {
    let sum = 0;
    filteredRows.forEach((row) => {
      const id = `${row.source}-${row.docno}`;
      if (selectedRowIds.has(id)) sum += Math.abs(row.amount);
    });
    return sum;
  }, [filteredRows, selectedRowIds]);

  const toggleRow = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSeePast = (kind: "fee" | "payment") => {
    router.push(`/soa-breakdown/results?kind=${kind}`);
  };

  if (!hasCredentials) {
    return null;
  }

  return (
    <div className="space-y-6">
      <InspectedUnitLabel />
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Outstanding Balance
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
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
              className="flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-900"
            >
              <LuReceiptText />
              {showDetails ? "Hide Split" : "Show Split"}
            </button>
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

      <div className="grid grid-cols-2 gap-3">
        <TabButton selected={view === "fee"} onClick={() => setView("fee")}>
          Fees
        </TabButton>
        <TabButton
          selected={view === "payment"}
          onClick={() => setView("payment")}
        >
          Payments
        </TabButton>
      </div>

      {view === "fee" && (
        <CategoryPills
          selectedCodes={selectedCodes}
          onChange={setSelectedCodes}
        />
      )}

      {view === "fee" ? (
        <OutstandingFees
          rows={filteredRows}
          isLoading={outstandingQuery.isLoading}
          isError={outstandingQuery.isError}
          onRetry={() => outstandingQuery.refetch()}
          selectedRowIds={selectedRowIds}
          onToggleRow={toggleRow}
          onSeePast={() => handleSeePast("fee")}
        />
      ) : (
        <UncreditedPayments
          rows={uncreditedPaymentRows}
          isLoading={outstandingQuery.isLoading}
          isError={outstandingQuery.isError}
          onRetry={() => outstandingQuery.refetch()}
          onSeePast={() => handleSeePast("payment")}
        />
      )}

      {view === "fee" && (
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
            ? `Selected ₱${formatCurrency(selectedSum)}`
            : "Select Fees"}
        </button>
      )}
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

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
        selected ? "bg-black text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
