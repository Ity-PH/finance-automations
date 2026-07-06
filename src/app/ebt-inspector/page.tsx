"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { LuDownload } from "react-icons/lu";
import TabNav from "@/components/TabNav";

type District = "LR" | "HR";
type QueryType =
  | "balance"
  | "electricity_balance"
  | "ledger"
  | "electricity_ledger";

type ApiResponse = {
  success: boolean;
  data?: { rows: Record<string, unknown>[] };
  error?: string;
};

const QUERY_TYPES: { value: QueryType; label: string }[] = [
  { value: "balance", label: "Balance" },
  { value: "ledger", label: "Ledger" },
  { value: "electricity_balance", label: "Electricity Balance" },
  { value: "electricity_ledger", label: "Electricity Ledger" },
];

const needsDates = (type: QueryType) =>
  type === "ledger" || type === "electricity_ledger";

function toApiDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

// EBT cells can be arrays (e.g. refdocs); flatten to a string for table + export.
function cellToString(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

type QueryParams = {
  bpcode: string;
  district: District;
  type: QueryType;
  dateFrom: string;
  dateTo: string;
};

async function fetchEbt(params: QueryParams) {
  const search = new URLSearchParams({
    bpcode: params.bpcode,
    district: params.district,
    type: params.type,
  });
  if (needsDates(params.type)) {
    search.set("date_from", params.dateFrom);
    search.set("date_to", params.dateTo);
  }
  const response = await fetch(`/api/ebt-inspector?${search}`);
  const body = (await response.json()) as ApiResponse;
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? "Failed to fetch EBT data.");
  }
  return body.data.rows;
}

export default function EbtInspectorPage() {
  const today = useMemo(() => new Date(), []);
  const oneYearAgo = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }, []);

  const [bpcode, setBpcode] = useState("");
  const [district, setDistrict] = useState<District>("HR");
  const [type, setType] = useState<QueryType>("balance");
  const [dateFrom, setDateFrom] = useState(toApiDate(oneYearAgo));
  const [dateTo, setDateTo] = useState(toApiDate(today));

  const [submitted, setSubmitted] = useState<QueryParams | null>(null);

  const query = useQuery({
    queryKey: ["ebt-inspector", submitted],
    queryFn: () => fetchEbt(submitted!),
    enabled: submitted !== null,
  });

  const rows = query.data ?? [];

  // Columns = union of row keys in first-seen order (exact EBT shape).
  const columns = useMemo(() => {
    const seen: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!seen.includes(key)) seen.push(key);
      }
    }
    return seen;
  }, [rows]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!bpcode.trim()) return;
    setSubmitted({
      bpcode: bpcode.trim().toUpperCase(),
      district,
      type,
      dateFrom,
      dateTo,
    });
  };

  const handleExport = () => {
    if (!submitted || rows.length === 0) return;
    const sheetRows = rows.map((row) => {
      const out: Record<string, string> = {};
      for (const key of columns) out[key] = cellToString(row[key]);
      return out;
    });
    const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "EBT");
    XLSX.writeFile(
      workbook,
      `EBT_${submitted.bpcode}_${submitted.type}.xlsx`,
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <TabNav />

      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">EBT Inspector</h1>
        <p className="mt-1 text-sm text-gray-500">
          View raw EBT data as a table. No processing — exactly what the EBT
          returns.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="border border-gray-200 bg-gray-50 p-4"
      >
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          Query
        </h2>

        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              Customer No.
            </span>
            <input
              value={bpcode}
              onChange={(e) => setBpcode(e.target.value)}
              placeholder="UO-00080"
              className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              District
            </span>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value as District)}
              className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            >
              <option value="HR">HR</option>
              <option value="LR">LR</option>
            </select>
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Query Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as QueryType)}
            className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
          >
            {QUERY_TYPES.map((qt) => (
              <option key={qt.value} value={qt.value}>
                {qt.label}
              </option>
            ))}
          </select>
        </label>

        {needsDates(type) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Date From (MM/DD/YYYY)
              </span>
              <input
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Date To (MM/DD/YYYY)
              </span>
              <input
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
              />
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={!bpcode.trim()}
          className={`mt-4 w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
            bpcode.trim()
              ? "cursor-pointer bg-black text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-100 text-gray-300"
          }`}
        >
          Query EBT
        </button>
      </form>

      {submitted && (
        <section className="mt-8">
          {query.isLoading && (
            <p className="text-sm text-gray-400">Loading EBT data…</p>
          )}

          {query.isError && (
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-red-700">
                {(query.error as Error)?.message ?? "Failed to load."}
              </p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="text-sm font-bold text-red-700 underline"
              >
                Retry
              </button>
            </div>
          )}

          {!query.isLoading && !query.isError && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  {rows.length} row{rows.length === 1 ? "" : "s"}
                </p>
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-900"
                  >
                    <LuDownload />
                    Export to Excel
                  </button>
                )}
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-gray-400">No rows returned.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="whitespace-nowrap border border-gray-200 px-3 py-2 text-left font-bold uppercase tracking-wide text-gray-600"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="whitespace-nowrap border border-gray-200 px-3 py-2 text-gray-800"
                            >
                              {cellToString(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
