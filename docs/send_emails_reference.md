# Send Emails — Reference Guide

## Overview

This feature sends disconnection notice PDFs to unit owners and tenants by email.
The system uses a message queue (RabbitMQ) to process emails one at a time.

## Architecture

```
Browser UI → Next.js API route → RabbitMQ queue → Email Worker → Mail server
```

Three parts work together:

1. **Send Notices page** (`/send-notices`) — The user uploads files and starts the send.
2. **API route** (`/api/send-notices`) — Puts email jobs into the queue.
3. **Email Worker** (`worker/emailWorker.ts`) — Reads jobs from the queue and sends each email.

## How the User Sends Notices

### Step 1: Upload the Recipient List

The user uploads an Excel or CSV file. The file must have these columns:

| Column | Required | Description |
|---|---|---|
| `Unit Nos.` | Yes | Unit number (e.g. `110F`) |
| `eBTUnitCode` | Yes | EBT system code (e.g. `2S-F-0110`) |
| `OWNER` | Yes | Owner email address |
| `TENANT` | Yes | Tenant email address |
| `EXCLUDE` | No | If value is `#N/A`, the system keeps the row. Any other value removes the row. |

- Column name matching is case-insensitive.
- If the `EXCLUDE` column is absent, the system keeps all rows.

### Step 2: Upload the Notices ZIP

The user uploads a ZIP file that contains the generated PDFs.
Each PDF filename follows this pattern: `{unitCode}_Disconnection_Notice.pdf`.

### Step 3: Confirm Matches

The system matches each PDF to a recipient by unit code.
The table shows matched and unmatched rows. Only matched rows will send.

### Step 4: Dispatch

The system sends one email per valid email address.
A unit with both an owner and a tenant email gets two separate emails.
Each email has the PDF attached.

## Email Worker Details

- Location: `worker/emailWorker.ts`
- Runs as a standalone process, separate from the Next.js app.
- Connects to RabbitMQ and waits for jobs.
- Sends emails through nodemailer.
- Waits 1.5 seconds between emails (Gmail rate limit).
- If a send fails, the job is discarded (no retry).

### Current auth: Gmail OAuth2

The worker uses these environment variables:

```
RABBITMQ_URL=
EMAIL_USER=
EMAIL_CLIENT_ID=
EMAIL_CLIENT_SECRET=
EMAIL_REFRESH_TOKEN=
```

## Known Issue: Filename Matching

The generate page creates filenames with `formatUnitFilename()`.
This function turns `110F` into `F-0110` (letters first, digits zero-padded to 4).

The recipient file uses `eBTUnitCode` values like `2S-F-0110`.

These two formats do not match. A decision is necessary:
- Change the generate page to use `eBTUnitCode` in filenames, or
- Change the match logic to compare on `Unit Nos.` instead, or
- Add a conversion step between the two formats.

## Open Decision: Email Provider Auth

Serendra wants to send from their own address (e.g. `finance@twoserendra.com`).
This address is on Microsoft 365 / Outlook.

### Option 1: SMTP with App Password

- Change worker config to `smtp.office365.com:587`.
- Serendra IT must enable SMTP AUTH for the mailbox.
- Simplest change. Risk: Microsoft disables basic SMTP AUTH on some tenants.

### Option 2: Microsoft Graph API + OAuth2 (Recommended)

- Register an app in Serendra's Azure AD (Entra ID).
- Grant `Mail.Send` permission. Admin must consent.
- Worker calls `POST /v1.0/users/{email}/sendMail` with an access token.
- No SMTP deprecation risk. Proper audit trail in their tenant.
- More setup work. Requires cooperation from Serendra IT.

### Option 3: OAuth2 XOAUTH2 over SMTP

- Same Azure AD app registration as Option 2.
- Pass the OAuth2 token to nodemailer SMTP transport (same pattern as current Gmail setup).
- Keeps nodemailer. Uses modern auth. Same setup effort as Option 2.

### Option 4: Shared Mailbox + Graph API

- If `finance@twoserendra.com` is a shared mailbox, use Graph API with `Mail.Send.Shared`.
- No separate password needed for the shared mailbox.

### Option 5: SMTP Relay

- Serendra IT configures an SMTP relay that accepts mail from the app server IP.
- No auth needed from the app side. Requires IT to set up an Exchange connector.

### Recommendation

Use **Option 2 (Graph API)** if Serendra IT will cooperate. It is the most reliable long-term path.
Use **Option 1 (SMTP)** if you need a working solution today and their tenant allows SMTP AUTH.

## OTP Emails (Separate System)

Login OTP emails use a different path. They do not go through RabbitMQ.
The function `sendOtpEmail()` in `src/lib/email/sendOtpEmail.ts` sends directly through SMTP.
It uses separate environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
