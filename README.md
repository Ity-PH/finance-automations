# Two Serendra — Disconnection Notice Generator

Internal finance tool for bulk-generating PDF disconnection notices by merging Excel data with Word templates.

## DEPRECATED
Note that this repository is no longer in use. Look for `Ity/finance-tools` repository for the updated version of this tool.

## Overview

Upload an `.xlsx` spreadsheet of unit owners with outstanding balances and a `.docx` letter template. The tool merges each row into the template and converts them to PDFs via [Gotenberg](https://gotenberg.dev/), then downloads everything as a single ZIP file.

### Key Features

- **Excel Parsing** — Reads Sheet 1, extracts unit data, filters empty rows
- **Mail Merge Support** — Automatically converts Word Mail Merge fields (`MERGEFIELD`) into template tags — no template modifications needed
- **Live Preview** — Select any unit to verify the data mapping before generating
- **Bulk PDF Generation** — Converts all notices in one click with a progress indicator
- **Zero Persistence** — Everything runs in-memory; no files saved to disk, no database

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Excel Parsing | SheetJS (`xlsx`) |
| Word Templating | `docxtemplater` + `pizzip` |
| PDF Conversion | Gotenberg (Cloud Deployed) |
| Zipping | `jszip` + `file-saver` |

## Prerequisites

- **Node.js** ≥ 20

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

In a separate terminal:

```bash
npm run dev
```

The app runs on **http://localhost:3001**.

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

The `.docx` template can use any of these formats — all are supported automatically:

**Standard curly braces:**
```
{Unit_No}  {Unit_Owner}  {AD}  {WA}  {EL}  {OT}
{Notice_Date}  {As_Of_Date}  {Due_Date}
```

**Word Mail Merge fields** (Insert → Merge Field):
The tool auto-converts these to curly-brace tags at processing time. No manual editing needed.

**Chevron delimiters:**
```
«Unit_No»  «Unit_Owner»  etc.
```

## Project Structure

```
src/
├── app/
│   ├── api/convert/route.ts   # Gotenberg proxy (docx → pdf)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main UI (uploads, preview, generation)
├── components/
│   └── Dropzone.tsx           # Reusable file upload dropzone
└── lib/
    ├── parseExcel.ts          # xlsx → typed JSON rows
    ├── preprocessDocx.ts      # Mail Merge XML → {Tag} converter
    └── renderDocx.ts          # docxtemplater rendering pipeline
```

## Environment Variables

Ensure you have `GOTENBERG_URL`, `SERVICE_USER`, and `SERVICE_PASSWORD` in your environment variables to let the .docx to PDF conversion work smoothly.

## License

Private — Internal use only.
