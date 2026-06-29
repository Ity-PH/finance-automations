"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import TabNav from "@/components/TabNav";

type Recipient = {
  unitCode: string;
  name: string;
  email: string;
};

type MatchedNotice = {
  unitCode: string;
  name: string;
  email: string;
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

      if (ext === "csv") {
        const text = await file.text();
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setRecipientError("CSV file is empty or has no data rows.");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim());
        const iUnit = headers.indexOf("eBTUnitCode");
        const iName = headers.indexOf("CustomerName");
        const iEmail = headers.indexOf("CustomerEmail");

        if (iUnit === -1 || iName === -1 || iEmail === -1) {
          setRecipientError(
            `Missing required columns. Expected: eBTUnitCode, CustomerName, CustomerEmail. Found: ${headers.join(", ")}`
          );
          return;
        }

        const parsed: Recipient[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim());
          if (cols[iUnit] && cols[iEmail]) {
            parsed.push({
              unitCode: cols[iUnit],
              name: cols[iName] || "",
              email: cols[iEmail],
            });
          }
        }
        setRecipients(parsed);
      } else {
        // xlsx / xls
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (json.length === 0) {
          setRecipientError("Excel file has no data rows.");
          return;
        }

        const firstRow = json[0];
        if (
          !("eBTUnitCode" in firstRow) ||
          !("CustomerName" in firstRow) ||
          !("CustomerEmail" in firstRow)
        ) {
          const found = Object.keys(firstRow).join(", ");
          setRecipientError(
            `Missing required columns. Expected: eBTUnitCode, CustomerName, CustomerEmail. Found: ${found}`
          );
          return;
        }

        const parsed: Recipient[] = json
          .filter((row) => row["eBTUnitCode"] && row["CustomerEmail"])
          .map((row) => ({
            unitCode: String(row["eBTUnitCode"]),
            name: String(row["CustomerName"] || ""),
            email: String(row["CustomerEmail"]),
          }));

        setRecipients(parsed);
      }
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
          unitCode: recipient.unitCode,
          name: recipient.name,
          email: recipient.email,
          filename,
          matched: true,
        });
      } else {
        result.push({
          unitCode: unitCode || filename,
          name: "",
          email: "",
          filename,
          matched: false,
        });
      }
    }

    // Flag recipients with no matching file
    for (const r of recipients) {
      if (!matchedUnitCodes.has(r.unitCode)) {
        result.push({
          unitCode: r.unitCode,
          name: r.name,
          email: r.email,
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

      const jobs = await Promise.all(
        matched.map(async (m) => {
          const pdfBase64 = await zip.file(m.filename)!.async("base64");
          return {
            to: m.email,
            customerName: m.name,
            unitCode: m.unitCode,
            filename: m.filename,
            pdfBase64,
          };
        })
      );

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
            ✓ Parsed <strong>{recipients.length}</strong> recipients
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
                    Unit Code
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Customer Name
                  </th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Email
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
                    <td className="px-3 py-2">{m.unitCode}</td>
                    <td className="px-3 py-2">{m.name || "—"}</td>
                    <td className="px-3 py-2">{m.email || "—"}</td>
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
