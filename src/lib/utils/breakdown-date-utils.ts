import type { ResidentDateRange } from "@/lib/schema/resident-breakdown.schema";

export function formatApiDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

export function parseApiDate(value: string): Date | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function dateFromRange(
  range: ResidentDateRange,
  today = new Date(),
): { dateFrom: string; dateTo: string } {
  const currentMonthStart = firstDayOfMonth(today);
  const dateTo = lastDayOfMonth(today);
  let dateFrom: Date;

  if (range === "lastMonth") {
    dateFrom = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 1,
      1,
    );
  } else if (range === "last3Months") {
    dateFrom = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 3,
      1,
    );
  } else if (range === "last6Months") {
    dateFrom = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 6,
      1,
    );
  } else if (range === "year") {
    dateFrom = new Date(today.getFullYear(), 0, 1);
    dateTo.setFullYear(today.getFullYear(), 11, 31);
  } else {
    dateFrom = new Date(1900, 0, 1);
  }

  return {
    dateFrom: formatApiDate(dateFrom),
    dateTo: formatApiDate(dateTo),
  };
}

export function dateFromMonthRange(
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number,
): { dateFrom: string; dateTo: string } {
  const start = firstDayOfMonth(new Date(startYear, startMonth, 1));
  const end = lastDayOfMonth(new Date(endYear, endMonth, 1));

  return {
    dateFrom: formatApiDate(start),
    dateTo: formatApiDate(end),
  };
}

export function currentMonthRange(
  today = new Date(),
): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: formatApiDate(firstDayOfMonth(today)),
    dateTo: formatApiDate(lastDayOfMonth(today)),
  };
}
