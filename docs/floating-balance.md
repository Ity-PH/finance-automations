# Floating Balance Reconciliation

Aggregate-first, row-reconcile logic for uncredited (floating) payments in the SOA breakdown outstanding view.

## Problem

EBT balance table `downpayment` rows can be stale. Example: unit 517F payment `ACR0543409` shows ₱9,324 remaining in the balance table, but the ledger shows it fully consumed via credit memos.

Prior behavior displayed every balance-table downpayment via `normalizeDownpaymentRows()` with no reconciliation. That overstates floating credit on buggy towers.

## Lanes

Dues and electricity reconcile **independently**. Never mix them into one derived credit.

| Lane | Fee source | Payment candidates | Ledger source | Net balance source |
|------|------------|-------------------|---------------|-------------------|
| **Dues** | `balance` `arinvoice` | `balance` `downpayment` | `outstanding.ledger` (+ optional `past-ledger.ledger`) | Last `outstanding.ledger` row with `balance` |
| **Electricity** | `electricity` `arinvoice` | `electricity` `downpayment` | Electricity ledger from outstanding fetch (+ optional `past-ledger.electricityLedger`) | Last electricity ledger row with `balance` |

Implementation: [`src/lib/billing/floating-balance.ts`](../src/lib/billing/floating-balance.ts)

---

## Algorithm (Phases A–G)

### Phase A — Outstanding fees (per lane)

```
dues_outstanding_fees = sum(parseMoney(row.dueamount))
  for balance rows where type === "arinvoice"

electricity_outstanding_fees = sum(parseMoney(row.dueamount))
  for electricity rows where type === "arinvoice"
```

### Phase B — Authoritative net balance (per lane)

```
dues_ledger_final_balance = parseMoney(last dues ledger row with balance)
electricity_ledger_final_balance = parseMoney(last electricity ledger row with balance)
```

Use data already returned by `/outstanding` and the existing electricity ledger fetch. Do not re-fetch for balance alone.

### Phase C — Derive true floating credit (per lane)

```
dues_derived_credit = max(0, dues_outstanding_fees - dues_ledger_final_balance)
electricity_derived_credit = max(0, electricity_outstanding_fees - electricity_ledger_final_balance)
```

Each lane's derived credit is the **display cap** for that lane's uncredited payments.

- If `dues_derived_credit <= 0.01` → hide all dues downpayment rows
- If `electricity_derived_credit <= 0.01` → hide all electricity downpayment rows

### Phase D — Build downpayment candidates (per lane)

From balance table rows where `type === "downpayment"`:

- `originalAmount = abs(parseMoney(amount))`
- `candidateRemaining = abs(parseMoney(dueamount))`
- Preserve `docno`, `docdate`, `remarks`
- Tag `source` as `"ledger"` or `"electricity"`

### Phase E — Ledger enrichment (lazy, single-fetch)

**E1 — Try outstanding response first**

Index ledger rows by `docno` and credit memos by `docno`. For each candidate, find matching `INCOMINGPAYMENT`:

```
paymentNet = parseMoney(credit) - parseMoney(debit)
paymentRefdocs = splitCsv(refdocs)
referencedCmTotal = sum(cm.credit for cm in paymentRefdocs where doctype=CREDITMEMO)
ledgerImpliedRemaining = max(0, paymentNet - referencedCmTotal)
isLedgerExhausted = referencedCmTotal >= paymentNet - 0.01
```

**E2 — Decide if past-ledger is needed**

Per lane:

```
needsPastLedger =
  abs(candidate_sum - derived_credit) > 0.01
  AND outstanding ledger for that lane lacks usable refdocs
```

**E3 — Fetch past-ledger once if any lane needs it**

- Collect `docdate` from candidates in lanes needing enrichment
- Include oldest `arinvoice` docdate per lane if helpful
- `date_from` = first day of oldest relevant month (`MM/DD/YYYY`)
- `date_to` = today
- Call `past-ledger` **exactly once**
- Re-run only lanes that needed enrichment with past ledger rows merged into indexes

**Fallback:** If no dates parse, fall back to 5 years ago and log a warning.

### Phase F — Reconcile candidates to derived credit (per lane)

```
candidate_sum = sum(candidateRemaining)
derived_total_credit = lane-specific derived credit from Phase C
```

| Case | Condition | Action |
|------|-----------|--------|
| **1 — exact match** | `abs(candidate_sum - derived_total_credit) <= 0.01` | Display all candidates |
| **2 — overstatement** | `candidate_sum > derived_total_credit + 0.01` | Select subset summing to derived credit |
| **3 — no exact subset** | Subset search fails | `aggregate_only` — hide per-row payments for that lane |
| **4 — zero credit** | `derived_total_credit <= 0.01` | Hide all downpayment rows |

**Subset removal priority (Case 2):**

1. Drop `isLedgerExhausted === true` first
2. Drop largest stale mismatch: `candidateRemaining - ledgerImpliedRemaining`
3. Prefer keeping newer payments (`docdate` desc)
4. Prefer rows with empty `refdocs`
5. If N ≤ 12 after pre-filter, bounded subset search; if N > 12, greedy only

**Server logging only:**

```ts
console.info("[floating-balance]", {
  lane, bpcode, candidateSum, derivedCredit, mode,
  displayed, hidden, pastLedgerFetched, pastLedgerRange,
});
```

### Phase G — Normalize display rows

Only reconciled candidates become `ResidentBreakdownRow` with `kind: "payment"`:

- `amount` = negative remaining
- `paidAmount` = original payment
- `source` = `"ledger"` or `"electricity"`

---

## Worked Examples

### Unit 3506 (healthy tower)

Manual test credentials: `bpcode=UO-00799`, `district=HR`, `unitNo=3506`

```
dues_outstanding_fees     = 49,476.77
dues_ledger_final_balance = 16,402.50
dues_derived_credit       = 49,476.77 - 16,402.50 = 33,074.27

Candidates:
  ACR650504-2S  6,525.59
  ACR673518-2S 10,000.00
  ACR692044-2S  1,000.00
  ACR700858-2S 15,548.68
  ────────────────────────
  Sum          33,074.27  ✅ exact match

Result: mode = "all", all 4 payments displayed
```

### Unit 517F (buggy tower)

```
dues_outstanding_fees     = 10,920.00  (5,250 + 5,250 + 420)
dues_ledger_final_balance =  5,670.00
dues_derived_credit       = 10,920.00 - 5,670.00 = 5,250.00

Raw candidates:
  ACR0543409    9,324.00  ← ledger-exhausted (CMs total ≥ payment net)
  ACR683649-2S  3,956.43
  ACR701642-2S  1,293.57
  ────────────────────────
  Sum          14,574.00  ❌ overstates by 9,324.00

Ledger enrichment for ACR0543409:
  paymentNet = 9,369.98
  referencedCmTotal = 9,324.00 + 161.98 = 9,485.98
  isLedgerExhausted = true

Result: mode = "subset"
  Display: ACR683649-2S + ACR701642-2S = 5,250.00
  Hidden:  ACR0543409
```

---

## Past-Ledger Policy

| Rule | Detail |
|------|--------|
| Max calls | **1 per outstanding request** |
| When | Only if lane mismatch AND outstanding ledger lacks `refdocs` |
| `date_from` | First day of oldest candidate/fee month |
| `date_to` | Today |
| Fallback | 5-year window only when dates unparseable |

---

## Fallback: aggregate_only

When no exact subset sums to derived credit:

- Do not show misleading per-payment rows for that lane
- Set `meta.duesFloatingCreditReconciliation = "aggregate_only"` (or electricity equivalent)
- Set `meta.duesDerivedFloatingCredit` to the authoritative aggregate
- UI currently shows no per-row payments for that lane (no aggregate banner yet)

---

## Performance Rules

- Single `/outstanding` call per outstanding view load
- Existing electricity ledger fetch (5-year window) unchanged
- Optional **one** `past-ledger` call when enrichment needed
- Index ledger rows once per dataset: O(n)
- Subset search bounded to N ≤ 12; greedy for larger sets
- No per-candidate ledger fetches
- No duplicate `fetchOutstanding` calls

---

## DO / DON'T

**DO**

- Reconcile dues and electricity in separate lanes
- Compute lane-specific derived credit before choosing display rows
- Use ledger final balance as authoritative net owed per lane
- Use balance table `dueamount` for per-invoice outstanding fees
- Keep reconciliation logic server-side and pure functions unit-tested
- Call `past-ledger` at most once per outstanding request
- Use `0.01` cent tolerance
- Log hidden stale candidates server-side

**DON'T**

- Mix dues and electricity into one derived credit
- Trust raw `sum(downpayment.dueamount)` for net balance or total credit
- Display balance-table downpayments without reconciliation
- Call `past-ledger` on every outstanding request
- Default to 5-year window when oldest candidate month is known
- Run exponential subset search on large candidate sets
- Silently show wrong payment rows when subset match fails

---

## Test Fixtures

Unit tests: [`src/lib/billing/floating-balance.test.ts`](../src/lib/billing/floating-balance.test.ts)

CSV fixtures: `ebt_files/3506 balance fetched 06-27-26.csv`, `ebt_files/517 balance updated (jun 28 2026).csv`, `ebt_files/517F ledger jan 2023 to jun 2026 (fetched jun 28 2026).csv`

Run:

```bash
npm run test:run
```

Manual verification:

```bash
npm run dev
```

- 3506 → dues uncredited total ≈ ₱33,074.27 (4 rows)
- 517F → no `ACR0543409`, dues uncredited total ≈ ₱5,250.00 (2 rows)
- Check server logs for `[floating-balance]` entries
