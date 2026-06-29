import { parseApiDate } from "@/lib/utils/breakdown-date-utils";

export function parseMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMonthYearLabel(value: string): string {
  const date = parseApiDate(value);
  if (!date) return value;

  const month = date.toLocaleString("en-US", { month: "short" });
  const year = String(date.getFullYear()).slice(-2);
  return `${month} '${year}`;
}

export function formatMonthYearRangeLabel(
  dateFrom: string,
  dateTo: string,
): string {
  return `${formatMonthYearLabel(dateFrom)} - ${formatMonthYearLabel(dateTo)}`;
}

export function formatCompactMonthYearLabel(value: string): string {
  const date = parseApiDate(value);
  if (!date) return value;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${year}`;
}

export function formatCompactMonthYearRangeLabel(
  dateFrom: string,
  dateTo: string,
): string {
  return `${formatCompactMonthYearLabel(dateFrom)} - ${formatCompactMonthYearLabel(dateTo)}`;
}

export function formatDateDocnoLabel(dateValue: string, docno: string): string {
  const dateLabel = dateValue ? formatCompactMonthYearLabel(dateValue) : "";
  if (dateLabel && docno) return `${dateLabel} · ${docno}`;
  return dateLabel || docno;
}

export function formatLongDate(value: string): string {
  const date = parseApiDate(value);
  if (!date) return value || "-";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatCompactDate(value: string): string {
  const date = parseApiDate(value);
  if (!date) return value || "-";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}
