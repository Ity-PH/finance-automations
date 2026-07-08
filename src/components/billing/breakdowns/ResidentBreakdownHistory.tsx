"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LuChevronLeft, LuSlidersHorizontal } from "react-icons/lu";
import { CategoryPills } from "@/components/billing/breakdowns/CategoryPills";
import {
  filterRowsByCategories,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";
import { PastFees } from "@/components/billing/breakdowns/PastFees";
import { PastPayments } from "@/components/billing/breakdowns/PastPayments";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";
import {
  dateFromMonthRange,
  dateFromRange,
} from "@/lib/utils/breakdown-date-utils";
import { formatCurrency } from "@/lib/utils/breakdown-format-utils";
import type {
  ResidentDateRange,
  ResidentLedgerResponse,
} from "@/lib/schema/resident-breakdown.schema";

type ApiResponse<T> = { success: boolean; data?: T; error?: string };
type HistoryTab = "fee" | "payment";

const RANGE_OPTIONS: { value: ResidentDateRange; label: string }[] = [
  { value: "lastMonth", label: "1 Month" },
  { value: "last3Months", label: "3 Months" },
  { value: "last6Months", label: "6 Months" },
  { value: "year", label: "This Year" },
];

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function defaultMonthSelection(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    startMonth: start.getMonth(),
    startYear: start.getFullYear(),
    endMonth: end.getMonth(),
    endYear: end.getFullYear(),
  };
}

async function fetchPastLedger(
  bpcode: string,
  district: "LR" | "HR",
  dateFrom: string,
  dateTo: string,
  kind: "fee" | "payment",
) {
  const params = new URLSearchParams({
    bpcode,
    district,
    date_from: dateFrom,
    date_to: dateTo,
    kind,
  });
  const response = await fetch(`/api/soa-breakdown/ledger?${params}`);
  const body = (await response.json()) as ApiResponse<ResidentLedgerResponse>;

  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? "Failed to fetch ledger.");
  }
  return body.data;
}

export function ResidentBreakdownHistory() {
  const { credentials, hasCredentials } = useSoaBreakdownCredentials();

  const [activeTab, setActiveTab] = useState<HistoryTab>("fee");
  const isPayment = activeTab === "payment";

  const defaultMonths = useMemo(() => defaultMonthSelection(), []);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => currentYear + 1 - i);
  }, []);

  const [range, setRange] = useState<ResidentDateRange>("lastMonth");
  const [useCustom, setUseCustom] = useState(false);
  const [customStartMonth, setCustomStartMonth] = useState(
    defaultMonths.startMonth,
  );
  const [customStartYear, setCustomStartYear] = useState(
    defaultMonths.startYear,
  );
  const [customEndMonth, setCustomEndMonth] = useState(defaultMonths.endMonth);
  const [customEndYear, setCustomEndYear] = useState(defaultMonths.endYear);
  const [selectedCategories, setSelectedCategories] = useState<
    Set<FeeCategoryId>
  >(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { dateFrom, dateTo } = useMemo(() => {
    if (useCustom) {
      return dateFromMonthRange(
        customStartMonth,
        customStartYear,
        customEndMonth,
        customEndYear,
      );
    }
    return dateFromRange(range);
  }, [
    customEndMonth,
    customEndYear,
    customStartMonth,
    customStartYear,
    range,
    useCustom,
  ]);

  const customMonthInvalid =
    customEndYear < customStartYear ||
    (customEndYear === customStartYear && customEndMonth < customStartMonth);

  const ledgerQuery = useQuery({
    queryKey: [
      "resident-past-ledger",
      credentials.bpcode,
      credentials.district,
      dateFrom,
      dateTo,
      activeTab,
    ],
    queryFn: () =>
      fetchPastLedger(
        credentials.bpcode,
        credentials.district,
        dateFrom,
        dateTo,
        activeTab,
      ),
    enabled: hasCredentials && dateFrom !== "" && dateTo !== "",
  });

  const displayRows = useMemo(() => {
    const rows = ledgerQuery.data?.rows ?? [];
    if (isPayment) return rows;
    return filterRowsByCategories(rows, selectedCategories);
  }, [isPayment, ledgerQuery.data?.rows, selectedCategories]);

  const total = displayRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);

  if (!hasCredentials) {
    return (
      <div className="border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Enter customer details and click View Breakdown on the{" "}
        <Link href="/soa-breakdown" className="font-semibold text-blue-600">
          SOA Breakdown page
        </Link>{" "}
        before viewing history.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/soa-breakdown"
          className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-black"
        >
          <LuChevronLeft className="text-lg" />
        </Link>
        <h2 className="text-xl font-bold tracking-tight">History</h2>
      </div>

      {/* Tab Switcher */}
      <div className="flex rounded-full bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("fee")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "fee"
              ? "bg-black text-white"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fees
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payment")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "payment"
              ? "bg-black text-white"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Payments
        </button>
      </div>

      {/* Total Display */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
          {isPayment ? "Total Payments" : "Total Fees"}
        </p>
        {ledgerQuery.isLoading ? (
          <div className="mt-2 h-11 w-40 animate-pulse bg-gray-100" />
        ) : (
          <p className="mt-2 text-4xl font-bold leading-none text-green-700">
            ₱ {formatCurrency(total)}
          </p>
        )}
      </div>

      {/* Period Pills */}
      <section>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
          Period
        </label>
        <div className="flex flex-wrap gap-2 pb-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setRange(option.value);
                setUseCustom(false);
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                !useCustom && range === option.value
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* Advanced Options */}
      <section>
        <button
          type="button"
          onClick={() => setAdvancedOpen((c) => !c)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-bold text-gray-700">
            Advanced Options
          </span>
          <LuSlidersHorizontal
            className={`text-lg text-gray-400 transition-transform ${
              advancedOpen ? "rotate-90" : ""
            }`}
          />
        </button>

        {advancedOpen && (
          <div className="mt-4 space-y-4 border border-gray-200 bg-gray-50 p-4">
            {!isPayment && (
              <CategoryPills
                selectedCategories={selectedCategories}
                onChange={setSelectedCategories}
              />
            )}

            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
                Custom Range
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <MonthYearSelect
                  label="Start"
                  month={customStartMonth}
                  year={customStartYear}
                  yearOptions={yearOptions}
                  onMonthChange={setCustomStartMonth}
                  onYearChange={setCustomStartYear}
                />
                <MonthYearSelect
                  label="End"
                  month={customEndMonth}
                  year={customEndYear}
                  yearOptions={yearOptions}
                  onMonthChange={setCustomEndMonth}
                  onYearChange={setCustomEndYear}
                />
              </div>
              {customMonthInvalid && (
                <p className="mt-3 text-xs font-medium text-red-700">
                  End month must be on or after start month.
                </p>
              )}
              <button
                type="button"
                disabled={customMonthInvalid}
                onClick={() => setUseCustom(true)}
                className={`mt-4 w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
                  customMonthInvalid
                    ? "cursor-not-allowed bg-gray-100 text-gray-300"
                    : "bg-black text-white hover:bg-gray-800"
                }`}
              >
                Apply Custom Range
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Content */}
      {isPayment ? (
        <PastPayments
          dateFrom={dateFrom}
          dateTo={dateTo}
          rows={displayRows}
          isLoading={ledgerQuery.isLoading}
          isError={ledgerQuery.isError}
          error={ledgerQuery.error}
          onRetry={() => ledgerQuery.refetch()}
        />
      ) : (
        <PastFees
          dateFrom={dateFrom}
          dateTo={dateTo}
          rows={displayRows}
          isLoading={ledgerQuery.isLoading}
          isError={ledgerQuery.isError}
          error={ledgerQuery.error}
          onRetry={() => ledgerQuery.refetch()}
        />
      )}
    </div>
  );
}

function MonthYearSelect({
  label,
  month,
  year,
  yearOptions,
  onMonthChange,
  onYearChange,
}: {
  label: string;
  month: number;
  year: number;
  yearOptions: number[];
  onMonthChange: (v: number) => void;
  onYearChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <select
          value={month}
          onChange={(event) => onMonthChange(Number(event.target.value))}
          className="border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
        >
          {MONTH_OPTIONS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
