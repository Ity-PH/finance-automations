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
 * Parse Sheet 1 of an Excel buffer into typed row objects.
 * Filters out rows missing a valid "Unit No".
 */
export function parseExcelBuffer(buffer: ArrayBuffer): UnitRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  return raw
    .filter((row) => {
      const unitNo = String(row["Unit No"] ?? "").trim();
      return unitNo.length > 0;
    })
    .map((row) => ({
      Section: String(row["Section"] ?? "").trim(),
      "UO-Code": String(row["UO-Code"] ?? "").trim(),
      "Unit No": String(row["Unit No"] ?? "").trim(),
      "Unit Owner": String(row["Unit Owner"] ?? "").trim(),
      "TOTAL OUTSTANDING BALANCE": Number(row["TOTAL OUTSTANDING BALANCE"]) || 0,
      WA: Number(row["WA"]) || 0,
      AD: Number(row["AD"]) || 0,
      OT: Number(row["OT"]) || 0,
      EL: Number(row["EL"]) || 0,
      REMARKS: String(row["REMARKS"] ?? "").trim(),
    }));
}
