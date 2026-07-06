"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CategoryPills } from "@/components/billing/breakdowns/CategoryPills";
import {
  filterRowsByCategories,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";
import { InspectedUnitLabel } from "@/components/billing/breakdowns/InspectedUnitLabel";
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

export function ResidentBreakdownResults() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") === "payment" ? "payment" : "fee";
  const isPayment = kind === "payment";
  const { credentials, hasCredentials } = useSoaBreakdownCredentials();

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
      kind,
    ],
    queryFn: () =>
      fetchPastLedger(
        credentials.bpcode,
        credentials.district,
        dateFrom,
        dateTo,
        kind,
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
      <InspectedUnitLabel />
      <div className="flex items-start justify-between gap-4">
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
        <Link
          href="/soa-breakdown"
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back
        </Link>
      </div>

      <section>
        <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
          Period
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
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

      {!isPayment && (
        <CategoryPills
          selectedCategories={selectedCategories}
          onChange={setSelectedCategories}
        />
      )}

      <section className="border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          Advanced Custom Range
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
      </section>

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
