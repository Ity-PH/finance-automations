# Two Serendra — Finance Automations

Internal finance suite for Two Serendra: bulk disconnection notices, resident balance inspection, and raw billing data lookup. Tabbed single app.

## Tools

- **Generate Notices** (`/`) — Merge an `.xlsx` of unit owners with a `.docx` template into bulk PDFs via [Gotenberg](https://gotenberg.dev/), downloaded as one ZIP.
- **Send Notices** (`/send-notices`) — Queue the generated notices for bulk email delivery (RabbitMQ + background worker).
- **SOA Breakdown** (`/soa-breakdown`) — Inspect a resident's outstanding balance, fee split, uncredited advance payments, and ledger history, reconciled against the billing (EBT) backend.
- **EBT Inspector** (`/ebt-inspector`) — View the raw EBT response (balance / ledger / electricity) in a table and export to Excel. Bypasses all normalization.

SOA Breakdown and EBT Inspector are behind an **OTP email login gate** (allowlisted emails only).

### Key Features

- **Excel Parsing** — Reads Sheet 1, extracts unit data, filters empty rows
- **Mail Merge Support** — Auto-converts Word Mail Merge fields (`MERGEFIELD`) into template tags — no template edits needed
- **Live Preview** — Verify data mapping for any unit before generating
- **Bulk PDF Generation** — Converts all notices in one click with a progress indicator
- **Floating-credit reconciliation** — Derives true unapplied advance from the ledger instead of trusting stale EBT downpayment balances
- **Zero Persistence** — Runs in-memory; no files saved to disk, no database

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query (`@tanstack/react-query`) |
| Validation | `zod` |
| Auth | OTP email login; `jose` (JWT sessions) + `bcryptjs` |
| Excel Parsing / Export | SheetJS (`xlsx`) |
| Word Templating | `docxtemplater` + `pizzip` |
| PDF Conversion | Gotenberg (Cloud Deployed) |
| Zipping | `jszip` + `file-saver` |
| Email | `nodemailer` (SMTP OTP + notice delivery) |
| Queue | RabbitMQ (`amqplib`) + background worker |

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

### 3. Start the email worker (optional — only for Send Notices)

```bash
npm run worker
```

Consumes the RabbitMQ queue and sends bulk notice emails.

## Usage — Generate Notices

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
│   ├── api/
│   │   ├── convert/           # Gotenberg proxy (docx → pdf)
│   │   ├── auth/              # OTP login / verify / logout
│   │   ├── queue-email/       # enqueue bulk notice emails
│   │   ├── send-notices/      # send-notices endpoint
│   │   ├── soa-breakdown/     # outstanding, ledger, queue
│   │   └── ebt-inspector/     # raw EBT proxy
│   ├── page.tsx               # Generate Notices UI
│   ├── send-notices/          # Send Notices UI
│   ├── soa-breakdown/         # SOA Breakdown UI (+ results)
│   ├── ebt-inspector/         # EBT Inspector UI
│   ├── login/                 # OTP login page
│   └── server/                # repositories + services (billing/EBT)
├── components/                # Dropzone, TabNav, billing breakdown UI
├── middleware.ts             # session gate for soa-breakdown + ebt-inspector
└── lib/
    ├── parseExcel.ts          # xlsx → typed JSON rows
    ├── preprocessDocx.ts      # Mail Merge XML → {Tag} converter
    ├── renderDocx.ts          # docxtemplater rendering pipeline
    ├── auth/                  # session tokens
    ├── billing/               # floating-credit reconciliation
    └── schema/                # zod schemas
worker/                        # RabbitMQ email worker
```

## Environment Variables

See `.env.example` for the full list. Grouped by concern:

| Group | Variables |
|-------|-----------|
| Auth (OTP gate) | `AUTH_CHALLENGE_SECRET`, `AUTH_SESSION_SECRET`, `OTP_ALLOWLIST` |
| SMTP (OTP delivery) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Email (Gmail OAuth2, notices) | `EMAIL_USER`, `EMAIL_CLIENT_ID`, `EMAIL_CLIENT_SECRET`, `EMAIL_REFRESH_TOKEN` |
| Gotenberg (docx → pdf) | `GOTENBERG_URL`, `SERVICE_USER_GOTENBERG`, `SERVICE_PASSWORD_GOTENBERG` |
| Queue | `RABBITMQ_URL` |
| Billing (EBT) backend | `RESIDENT_BREAKDOWN_BASE_URL`, `RESIDENT_BREAKDOWN_API_KEY` |
| Rate limiting | `TRUSTED_PROXY_HOPS` (default 1) |

## License

Private — Internal use only.
