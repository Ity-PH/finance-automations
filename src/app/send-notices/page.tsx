"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import TabNav from "@/components/TabNav";

type Recipient = {
  unitNo: string;
  unitCode: string;
  ownerEmail: string;
  tenantEmail: string;
};

type MatchedNotice = {
  unitNo: string;
  unitCode: string;
  ownerEmail: string;
  tenantEmail: string;
  filename: string;
  matched: boolean;
};

export default function SendNotices() {
  // --- State ---
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [recipientFile, setRecipientFile] = useState<File | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const [zip, setZip] = useState<JSZip | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [matches, setMatches] = useState<MatchedNotice[]>([]);

  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const REQUIRED_HEADERS = ["unit nos.", "ebtunitcode", "owner", "tenant"] as const;

  // ponytail: #N/A is the only "keep" sentinel; anything else (blank, text, error) = exclude
  const shouldExclude = (val: unknown): boolean => String(val ?? "").trim() !== "#N/A";

  /** Lowercase all keys so header matching is case-insensitive */
  const normalizeKeys = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(row)) out[k.trim().toLowerCase()] = row[k];
    return out;
  };

  /**
   * Parse rows from sheet JSON into Recipient[], filtering excluded rows.
   */
  const parseRows = (json: Record<string, unknown>[]): Recipient[] | string => {
    if (json.length === 0) return "File has no data rows.";

    const normalized = json.map(normalizeKeys);
    const keys = Object.keys(normalized[0]);
    const missing = REQUIRED_HEADERS.filter((h) => !keys.includes(h));
    if (missing.length > 0) {
      return `Missing required columns: ${missing.join(", ")}. Found: ${Object.keys(json[0]).join(", ")}`;
    }

    // ponytail: EXCLUDE column optional — no column = include all
    const hasExclude = keys.includes("exclude");

    return normalized
      .filter((row) => !hasExclude || !shouldExclude(row["exclude"]))
      .filter((row) => row["ebtunitcode"]) // skip empty rows
      .map((row) => ({
        unitNo: String(row["unit nos."] ?? "").trim(),
        unitCode: String(row["ebtunitcode"] ?? "").trim(),
        ownerEmail: String(row["owner"] ?? "").trim(),
        tenantEmail: String(row["tenant"] ?? "").trim(),
      }));
  };

  // --- Parse Excel / CSV ---
  const handleRecipientUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRecipientFile(file);
    setRecipientError(null);
    setMatches([]);
    setSendResult(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let json: Record<string, unknown>[];

      if (ext === "csv") {
        const text = await file.text();
        const workbook = XLSX.read(text, { type: "string" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      }

      const result = parseRows(json);
      if (typeof result === "string") {
        setRecipientError(result);
        return;
      }

      setRecipients(result);
    } catch (err) {
      console.error("Recipient parse error:", err);
      setRecipientError("Failed to parse file. Check format and try again.");
    }
  };

  // --- Parse ZIP ---
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setZipFile(file);
    setMatches([]);
    setSendResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const loaded = await JSZip.loadAsync(buffer);
      setZip(loaded);
    } catch (err) {
      console.error("ZIP parse error:", err);
    }
  };

  // --- Match recipients to ZIP files ---
  useEffect(() => {
    if (!recipients || !zip) return;

    const filenames = Object.keys(zip.files).filter(
      (f) => !zip.files[f].dir
    );

    // Build lookup: unitCode → recipient
    const recipientMap = new Map<string, Recipient>();
    for (const r of recipients) {
      recipientMap.set(r.unitCode, r);
    }

    const matchedUnitCodes = new Set<string>();
    const result: MatchedNotice[] = [];

    // Match each file to a recipient
    for (const filename of filenames) {
      const parts = filename.split("_Disconnection_Notice.pdf");
      const unitCode = parts[0];

      const recipient = recipientMap.get(unitCode);
      if (recipient) {
        matchedUnitCodes.add(unitCode);
        result.push({
          unitNo: recipient.unitNo,
          unitCode: recipient.unitCode,
          ownerEmail: recipient.ownerEmail,
          tenantEmail: recipient.tenantEmail,
          filename,
          matched: true,
        });
      } else {
        result.push({
          unitNo: "",
          unitCode: unitCode || filename,
          ownerEmail: "",
          tenantEmail: "",
          filename,
          matched: false,
        });
      }
    }

    // Flag recipients with no matching file
    for (const r of recipients) {
      if (!matchedUnitCodes.has(r.unitCode)) {
        result.push({
          unitNo: r.unitNo,
          unitCode: r.unitCode,
          ownerEmail: r.ownerEmail,
          tenantEmail: r.tenantEmail,
          filename: "",
          matched: false,
        });
      }
    }

    setMatches(result);
  }, [recipients, zip]);

  // --- Send ---
  const matchedCount = matches.filter((m) => m.matched).length;
  const unmatchedCount = matches.filter((m) => !m.matched).length;
  const canSend = matchedCount > 0 && !isSending;

  const handleSend = async () => {
    if (!zip) return;

    setIsSending(true);
    setSendResult(null);

    try {
      const matched = matches.filter((m) => m.matched);

      // ponytail: flatten to one job per email — a unit with both owner+tenant = two jobs
      const jobs = (
        await Promise.all(
          matched.map(async (m) => {
            const pdfBase64 = await zip.file(m.filename)!.async("base64");
            const emails = [m.ownerEmail, m.tenantEmail].filter(Boolean);
            return emails.map((email) => ({
              to: email,
              customerName: m.unitNo,
              unitCode: m.unitCode,
              filename: m.filename,
              pdfBase64,
            }));
          })
        )
      ).flat();

      const res = await fetch("/api/send-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobs),
      });

      const data = await res.json();

      if (data.success) {
        setSendResult(`All notices queued successfully. (${data.queued} jobs)`);
      } else {
        setSendResult(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error("Send error:", err);
      setSendResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <TabNav />

      {/* Header */}
      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Send Disconnection Notices
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload recipient list and notices ZIP, then dispatch via email.
        </p>
      </header>

      {/* --- Section 1: Upload Recipient List --- */}
      <section className="mb-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          1 / Upload Recipient List
        </h2>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Excel / CSV Data (.xlsx, .xls, .csv)
          </label>
          <div
            className={`flex min-h-[140px] cursor-pointer items-center justify-center border-2 border-dashed p-6 transition-colors ${
              recipientFile
                ? "border-black bg-gray-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
            onClick={() => document.getElementById("recipient-input")?.click()}
          >
            <input
              id="recipient-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleRecipientUpload}
              className="hidden"
            />
            {recipientFile ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-black">{recipientFile.name}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {(recipientFile.size / 1024).toFixed(1)} KB — Click to replace
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Click to select file</p>
            )}
          </div>
        </div>
        {recipientError && (
          <p className="mt-3 text-sm text-red-600">{recipientError}</p>
        )}
        {recipients && !recipientError && (
          <p className="mt-3 text-xs text-gray-500">
            ✓ Parsed <strong>{recipients.length}</strong> recipients (excluded rows filtered out)
          </p>
        )}
      </section>

      {/* --- Section 2: Upload ZIP --- */}
      <section className="mb-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          2 / Upload Notices (ZIP)
        </h2>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
            ZIP Archive (.zip)
          </label>
          <div
            className={`flex min-h-[140px] cursor-pointer items-center justify-center border-2 border-dashed p-6 transition-colors ${
              zipFile
                ? "border-black bg-gray-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
            onClick={() => document.getElementById("zip-input")?.click()}
          >
            <input
              id="zip-input"
              type="file"
              accept=".zip"
              onChange={handleZipUpload}
              className="hidden"
            />
            {zipFile ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-black">{zipFile.name}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {(zipFile.size / 1024).toFixed(1)} KB — Click to replace
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Click to select file</p>
            )}
          </div>
        </div>
        {zip && (
          <p className="mt-3 text-xs text-gray-500">
            ✓ Loaded <strong>{Object.keys(zip.files).filter((f) => !zip.files[f].dir).length}</strong> files from ZIP
          </p>
        )}
      </section>

      {/* --- Section 3: Preview Table --- */}
      {matches.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
            3 / Confirm Matches
          </h2>
          <div className="overflow-x-auto border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-50 text-left">
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Unit
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    eBT Code
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Owner
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Tenant
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    File
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {matches.map((m, i) => (
                  <tr
                    key={`${m.unitCode}-${i}`}
                    className={`border-b border-gray-100 ${
                      !m.matched ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2">{m.unitNo || "—"}</td>
                    <td className="px-3 py-2">{m.unitCode}</td>
                    <td className="px-3 py-2">{m.ownerEmail || "—"}</td>
                    <td className="px-3 py-2">{m.tenantEmail || "—"}</td>
                    <td className="px-3 py-2">{m.filename || "—"}</td>
                    <td className="px-3 py-2">
                      {m.matched ? (
                        <span className="text-green-600">✓ Matched</span>
                      ) : (
                        <span className="text-red-600">✗ No Match</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {matchedCount} matched · {unmatchedCount} unmatched
          </p>
        </section>
      )}

      {/* --- Section 4: Dispatch --- */}
      <section className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          4 / Dispatch
        </h2>
        <button
          disabled={!canSend}
          onClick={handleSend}
          className={`w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
            canSend
              ? "cursor-pointer bg-black text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-100 text-gray-300"
          }`}
        >
          Send All Notices
        </button>
        {isSending && (
          <p className="mt-2 text-center text-xs text-gray-500">Sending...</p>
        )}
        {sendResult && (
          <p
            className={`mt-2 text-center text-xs ${
              sendResult.startsWith("Error") ? "text-red-600" : "text-green-600"
            }`}
          >
            {sendResult}
          </p>
        )}
        {!canSend && !isSending && !sendResult && (
          <p className="mt-2 text-center text-xs text-gray-400">
            Upload both files and ensure at least one match to enable
          </p>
        )}
      </section>
    </main>
  );
}
