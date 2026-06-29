export function codeFromDocNo(docno: string): string {
  return docno.split("-")[0]?.toUpperCase() ?? "";
}

const DUES_INTEREST_RE = /\b(AD|EC)\b/;
const UTIL_INTEREST_RE = /\b(WA|OT)\b/;

export function resolveInterestCode(
  code: string,
  remarks: string,
  source: "ledger" | "electricity",
): string {
  if (code !== "IN") return code;
  if (source === "electricity") return "IN_ELEC";

  const upper = remarks.toUpperCase();
  const matchesDues = DUES_INTEREST_RE.test(upper);
  const matchesUtil = UTIL_INTEREST_RE.test(upper);

  if (matchesDues && matchesUtil) return "IN";
  if (matchesDues) return "IN_DUES";
  if (matchesUtil) return "IN_WATER_OT";
  return "IN";
}
