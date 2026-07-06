export const FEE_CODES = [
  { code: "AD", label: "Association Dues" },
  { code: "EC", label: "Equity Contribution" },
  { code: "WA", label: "Water Recovery" },
  { code: "EL", label: "Electricity" },
  { code: "IN", label: "Interest" },
  { code: "SF", label: "Sports Facilities" },
  { code: "SH", label: "Function Room Usage" },
  { code: "SR", label: "Service Request" },
  { code: "SU", label: "Car Sticker, Pets ID, RFID, Waiver ID, Helpers ID, etc." },
  { code: "CI", label: "Citation/Violation" },
  { code: "RF", label: "Reconnection Fee" },
] as const;

export const PRIMARY_FEE_CODES = ["AD", "EC", "WA", "EL"] as const;

export const DUES_EQUITY_CODES = ["AD", "EC", "IN_DUES"] as const;
export const WATER_CODES = ["WA", "IN_WATER_OT"] as const;
export const ELECTRICITY_CODES = ["EL", "IN_ELEC"] as const;
export const OTHER_CODES = [
  "SF",
  "SH",
  "SR",
  "SU",
  "CI",
  "RF",
  "IN",
  "IN_WATER_OT",
] as const;

export const CATEGORIES = [
  { id: "dues", label: "Dues & Equity", codes: DUES_EQUITY_CODES },
  { id: "water", label: "Water", codes: WATER_CODES },
  { id: "electricity", label: "Electricity", codes: ELECTRICITY_CODES },
  { id: "others", label: "Others", codes: OTHER_CODES },
] as const;

export type FeeCategory = (typeof CATEGORIES)[number];
export type FeeCategoryId = FeeCategory["id"];

export type FeeCategoryRow = {
  code: string;
  resolvedCode: string;
};

const PRIMARY_FEE_CODE_SET = new Set<string>(PRIMARY_FEE_CODES);
const OTHER_CODE_SET = new Set<string>(OTHER_CODES);

export function rowMatchesCategory(
  row: FeeCategoryRow,
  categoryId: FeeCategoryId,
): boolean {
  const { code, resolvedCode } = row;

  switch (categoryId) {
    case "dues":
      return includesCode(DUES_EQUITY_CODES, resolvedCode);
    case "water":
      return includesCode(WATER_CODES, resolvedCode);
    case "electricity":
      return includesCode(ELECTRICITY_CODES, resolvedCode);
    case "others":
      return rowMatchesOthers(row);
    default:
      return false;
  }
}

function rowMatchesOthers(row: FeeCategoryRow): boolean {
  const { code, resolvedCode } = row;

  if (
    resolvedCode === "AD" ||
    resolvedCode === "EC" ||
    resolvedCode === "IN_DUES" ||
    resolvedCode === "WA" ||
    resolvedCode === "EL" ||
    resolvedCode === "IN_ELEC"
  ) {
    return false;
  }

  if (OTHER_CODE_SET.has(resolvedCode)) {
    return true;
  }

  return !PRIMARY_FEE_CODE_SET.has(code) && code !== "IN";
}

export function filterRowsByCategories<T extends FeeCategoryRow>(
  rows: T[],
  selectedCategories: Set<FeeCategoryId>,
): T[] {
  if (selectedCategories.size === 0) {
    return rows;
  }

  return rows.filter((row) =>
    CATEGORIES.some(
      (category) =>
        selectedCategories.has(category.id) &&
        rowMatchesCategory(row, category.id),
    ),
  );
}

export function toggleCategory(
  prev: Set<FeeCategoryId>,
  categoryId: FeeCategoryId,
): Set<FeeCategoryId> {
  const next = new Set(prev);
  if (next.has(categoryId)) {
    next.delete(categoryId);
  } else {
    next.add(categoryId);
  }
  return next;
}

function includesCode(codes: readonly string[], value: string): boolean {
  return codes.includes(value);
}
