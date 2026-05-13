"use client";

import { useState, useCallback } from "react";
import Dropzone from "@/components/Dropzone";
import { parseExcelBuffer, UnitRow } from "@/lib/parseExcel";
import { renderDocx, TemplateData } from "@/lib/renderDocx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export default function Home() {
  // --- File State ---
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [docxFile, setDocxFile] = useState<File | null>(null);

  // --- Parsed Data ---
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  // --- Date State ---
  const [noticeDate, setNoticeDate] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // --- Generation State ---
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // --- Derived ---
  const isReady =
    rows.length > 0 &&
    docxFile !== null &&
    noticeDate !== "" &&
    asOfDate !== "" &&
    dueDate !== "";

  const selectedRow = rows.find((r) => r["Unit No"] === selectedUnit) || null;

  // --- Handlers ---
  const handleExcelUpload = useCallback(async (file: File) => {
    setExcelFile(file);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelBuffer(buffer);
      setRows(parsed);
      setSelectedUnit(parsed.length > 0 ? parsed[0]["Unit No"] : "");
    } catch (e) {
      console.error("Excel parse error:", e);
      setError("Failed to parse Excel file. Check format matches expected columns.");
      setRows([]);
      setSelectedUnit("");
    }
  }, []);

  const handleDocxUpload = useCallback((file: File) => {
    setDocxFile(file);
    setError(null);
  }, []);

  /**
   * Format a date string (YYYY-MM-DD) into a human-readable format
   * e.g. "May 13, 2026"
   */
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  /**
   * Format a number as currency-like string with 2 decimal places
   */
  const formatAmount = (n: number): string => {
    return n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  /**
   * Build the TemplateData object for a given row
   */
  const buildTemplateData = (row: UnitRow): TemplateData => ({
    Unit_No: row["Unit No"],
    Unit_Owner: row["Unit Owner"],
    AD: formatAmount(row.AD),
    WA: formatAmount(row.WA),
    EL: formatAmount(row.EL),
    OT: formatAmount(row.OT),
    Notice_Date: formatDate(noticeDate),
    As_Of_Date: formatDate(asOfDate),
    Due_Date: formatDate(dueDate),
  });

  /**
   * Phase 4: Bulk generation — loop rows, template docx, convert to PDF, zip all.
   */
  const handleGenerate = useCallback(async () => {
    if (!docxFile || rows.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ current: 0, total: rows.length });

    try {
      const templateBuffer = await docxFile.arrayBuffer();
      const zip = new JSZip();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const data = buildTemplateData(row);

        // 1. Render populated .docx in-memory
        const populatedDocx = renderDocx(templateBuffer, data);

        // 2. Send to /api/convert for PDF conversion
        const formData = new FormData();
        const docxBuffer = new Uint8Array(populatedDocx).buffer;
        formData.append(
          "file",
          new Blob([docxBuffer], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
          "document.docx"
        );

        const res = await fetch("/api/convert", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(
            `PDF conversion failed for ${row["Unit No"]}: ${errBody}`
          );
        }

        const pdfBuffer = await res.arrayBuffer();

        // 3. Add PDF to zip
        const safeUnitNo = row["Unit No"].replace(/[^a-zA-Z0-9_-]/g, "_");
        zip.file(`${safeUnitNo}_Disconnection_Notice.pdf`, pdfBuffer);

        setProgress({ current: i + 1, total: rows.length });
      }

      // 4. Generate and download zip
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "Bulk_Notices.zip");
    } catch (e) {
      console.error("Generation error:", e);
      setError(e instanceof Error ? e.message : "Unknown error during generation");
    } finally {
      setIsGenerating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docxFile, rows, noticeDate, asOfDate, dueDate]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Header */}
      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Disconnection Notice Generator
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Two Serendra — Internal Finance Tool
        </p>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* --- Section 1: File Uploads --- */}
      <section className="mb-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          1 / Upload Files
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Dropzone
            label="Excel Data (.xlsx)"
            accept={{
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                [".xlsx"],
            }}
            file={excelFile}
            onFileAccepted={handleExcelUpload}
          />
          <Dropzone
            label="Word Template (.docx)"
            accept={{
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                [".docx"],
            }}
            file={docxFile}
            onFileAccepted={handleDocxUpload}
          />
        </div>
        {rows.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            ✓ Parsed <strong>{rows.length}</strong> unit rows from Sheet 1
          </p>
        )}
      </section>

      {/* --- Section 2: Date Inputs --- */}
      <section className="mb-10">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
          2 / Set Dates
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <DateInput
            label="Notice Date"
            value={noticeDate}
            onChange={setNoticeDate}
          />
          <DateInput
            label="As Of Date"
            value={asOfDate}
            onChange={setAsOfDate}
          />
          <DateInput label="Due Date" value={dueDate} onChange={setDueDate} />
        </div>
      </section>

      {/* --- Section 3: Preview Panel (Phase 2) --- */}
      {rows.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
            3 / Preview Data Mapping
          </h2>
          <div className="border border-gray-200 bg-gray-50 p-4">
            {/* Unit Selector */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">
                Select Unit
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                {rows.map((row) => (
                  <option key={row["Unit No"]} value={row["Unit No"]}>
                    {row["Unit No"]} — {row["Unit Owner"]}
                  </option>
                ))}
              </select>
            </div>

            {/* Data Mapping Table */}
            {selectedRow && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left">
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                      Template Tag
                    </th>
                    <th className="py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {Object.entries(buildTemplateData(selectedRow)).map(
                    ([tag, value]) => (
                      <tr
                        key={tag}
                        className="border-b border-gray-100"
                      >
                        <td className="py-2 pr-4 text-gray-600">
                          {`{${tag}}`}
                        </td>
                        <td className="py-2 font-semibold text-black">
                          {value || "—"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* --- Section 4: Generate Button --- */}
      <section className="border-t border-gray-200 pt-6">
        <button
          disabled={!isReady || isGenerating}
          onClick={handleGenerate}
          className={`w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
            isReady && !isGenerating
              ? "cursor-pointer bg-black text-white hover:bg-gray-800"
              : "cursor-not-allowed bg-gray-100 text-gray-300"
          }`}
        >
          {isGenerating
            ? `Generating ${progress.current} of ${progress.total} PDFs...`
            : "Generate & Download All PDFs"}
        </button>

        {/* Progress Bar */}
        {isGenerating && progress.total > 0 && (
          <div className="mt-3 h-1.5 w-full bg-gray-200">
            <div
              className="h-full bg-black transition-all duration-300"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        )}

        {!isReady && !isGenerating && (
          <p className="mt-2 text-center text-xs text-gray-400">
            Upload both files and set all dates to enable
          </p>
        )}
      </section>
    </main>
  );
}

/* ─── Inline sub-component ─── */

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 px-3 py-2 text-sm text-black transition-colors focus:border-black focus:outline-none"
      />
    </div>
  );
}
