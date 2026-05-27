import * as XLSX from "xlsx";

export interface UnitRow {
  Section: string;
  "UO-Code": string;
  "Unit No": string;
  "Unit Owner": string;
  "TOTAL OUTSTANDING BALANCE": number;
  WA: number;
  AD: number;
  OT: number;
  EL: number;
  REMARKS: string;
}

/**
 * Safely parses messy Excel currency values (strings with commas, dashes, etc.) into strict numbers.
 */
function parseCurrency(val: unknown): number {
  if (typeof val === "number") return val;
  
  if (typeof val === "string") {
    const cleanStr = val.replace(/,/g, "").trim();
    if (cleanStr === "-" || cleanStr === "") return 0; // Handle Excel accounting dashes
    
    const parsed = Number(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}

/**
 * Excel headers often have accidental spaces (e.g., " WA " instead of "WA").
 * This creates a new object where all keys are perfectly trimmed.
 */
function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    normalized[key.trim()] = row[key];
  }
  return normalized;
}

export function parseExcelBuffer(buffer: ArrayBuffer): UnitRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  return raw
    // 1. Normalize the keys first so " WA " becomes "WA"
    .map(normalizeRowKeys)
    // 2. Filter out rows missing a Unit No
    .filter((row) => {
      const unitNo = String(row["Unit No"] ?? "").trim();
      return unitNo.length > 0;
    })
    // 3. Map safely
    .map((row) => ({
      Section: String(row.Section ?? "").trim(),
      "UO-Code": String(row["UO-Code"] ?? "").trim(),
      "Unit No": String(row["Unit No"] ?? "").trim(),
      "Unit Owner": String(row["Unit Owner"] ?? "").trim(),
      "TOTAL OUTSTANDING BALANCE": parseCurrency(row["TOTAL OUTSTANDING BALANCE"]),
      WA: parseCurrency(row.WA),
      AD: parseCurrency(row.AD),
      OT: parseCurrency(row.OT),
      EL: parseCurrency(row.EL),
      REMARKS: String(row.REMARKS ?? "").trim(),
    }));
}