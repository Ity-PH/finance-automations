# Two Serendra — Disconnection Notice Generator

Internal finance tool for bulk-generating PDF disconnection notices by merging Excel data with Word templates. **100% client-side** — no Docker, no server-side conversion.

## Overview

Upload an `.xlsx` spreadsheet of unit owners with outstanding balances and a `.docx` letter template. The tool converts the template to HTML, injects each row's data, renders PDFs in the browser, then downloads everything as a single ZIP file.

### Key Features

- **Excel Parsing** — Reads Sheet 1, extracts unit data, filters empty rows
- **Word to HTML** — Uses `mammoth.js` to convert `.docx` → clean HTML
- **Template Tags** — Supports `{Tag}`, `«Tag»`, and Word Mail Merge field display text
- **Live Preview** — Select any unit to verify the data mapping before generating
- **Client-Side PDFs** — `html2pdf.js` renders directly in the browser — no server needed
- **Bulk Download** — All notices packaged into `Bulk_Notices.zip` via `jszip`
- **Zero Persistence** — Everything runs in-memory; no files saved to disk, no database

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Excel Parsing | SheetJS (`xlsx`) |
| Word → HTML | `mammoth.js` |
| HTML → PDF | `html2pdf.js` |
| Zipping | `jszip` + `file-saver` |

## Prerequisites

- **Node.js** ≥ 20

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000**.

## Usage

1. **Upload Excel** — Drag or click to upload the `.xlsx` file containing unit owner data
2. **Upload Template** — Drag or click to upload the `.docx` letter template
3. **Set Dates** — Fill in Notice Date, As Of Date, and Due Date
4. **Preview** — Use the dropdown to verify data mapping for any unit
5. **Generate** — Click "Generate & Download All PDFs" → downloads `Bulk_Notices.zip`

## Excel Format

The tool expects Sheet 1 with these columns:

| Column | Description |
|--------|-------------|
| `Section` | Building section (e.g., Almond) |
| `UO-Code` | Unit owner code |
| `Unit No` | Unit number (e.g., 105A) |
| `Unit Owner` | Owner name |
| `TOTAL OUTSTANDING BALANCE` | Total balance |
| `WA` | Water charges |
| `AD` | Association dues |
| `OT` | Other charges |
| `EL` | Electricity charges |
| `REMARKS` | Optional remarks |

## Template Tags

The `.docx` template can use any of these formats — all supported automatically:

**Standard curly braces:**
```
{Unit_No}  {Unit_Owner}  {AD}  {WA}  {EL}  {OT}
{Notice_Date}  {As_Of_Date}  {Due_Date}
```

**Chevron delimiters:**
```
«Unit_No»  «Unit_Owner»  etc.
```

**Word Mail Merge fields** — The display text (e.g., `«Unit_Owner»`) is extracted by mammoth and replaced automatically.

## Project Structure

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main UI (uploads, preview, generation)
├── components/
│   └── Dropzone.tsx           # Reusable file upload dropzone
├── lib/
│   ├── parseExcel.ts          # xlsx → typed JSON rows
│   └── generatePdf.ts        # mammoth + html2pdf pipeline
└── types/
    └── html2pdf.d.ts          # Type declarations for html2pdf.js
```

## License

Private — Internal use only.
