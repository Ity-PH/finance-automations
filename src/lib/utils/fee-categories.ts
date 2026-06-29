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

export const DUES_EQUITY_CODES = ["AD", "EC", "IN_DUES"] as const;
export const WATER_CODES = ["WA", "IN_WATER_OT"] as const;
export const ELECTRICITY_CODES = ["EL", "IN_ELEC"] as const;
export const OTHER_CODES = ["IN"] as const;

export const CATEGORIES = [
  { id: "dues", label: "Dues & Equity", codes: DUES_EQUITY_CODES },
  { id: "water", label: "Water", codes: WATER_CODES },
  { id: "electricity", label: "Electricity", codes: ELECTRICITY_CODES },
  { id: "others", label: "Others", codes: OTHER_CODES },
] as const;

export type FeeCategory = (typeof CATEGORIES)[number];

export function toggleCategoryCodes(
  prev: Set<string>,
  category: FeeCategory,
): Set<string> {
  if (prev.size === 0) {
    return new Set(category.codes);
  }

  const active = category.codes.every((code) => prev.has(code));
  const next = new Set(prev);

  if (active) {
    const remainingActiveCategories = CATEGORIES.filter(
      (candidate) =>
        candidate.id !== category.id &&
        candidate.codes.every((code) => prev.has(code)),
    );
    const protectedCodes = new Set(
      remainingActiveCategories.flatMap((candidate) => candidate.codes),
    );

    category.codes.forEach((code) => {
      if (!protectedCodes.has(code)) {
        next.delete(code);
      }
    });

    return next;
  }

  category.codes.forEach((code) => next.add(code));
  return next;
}
