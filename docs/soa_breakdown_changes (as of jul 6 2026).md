# SOA Breakdown Changes (as of Jul 6, 2026)

Port guide for transferring SOA Breakdown UI and backend display fixes from **finance-automations** to **two-serendra-superapp**.

This document covers four changes made on Jul 6, 2026: persistent unit context, expanded fee category filtering, bulk fee selection, and hiding adjustment invoices from outstanding fees.

---

## Summary

| # | Change | Layer | Scope |
|---|--------|-------|-------|
| 1 | Inspected unit label | UI | Outstanding + History views |
| 2 | Expanded Others fee category + dual membership | UI + utils | Outstanding Fees + Settled Fees filters |
| 3 | Select All / Unselect All | UI | Outstanding Fees only |
| 4 | Hide adjustment ARINVOICE rows | Backend service | Outstanding Fees display only |

---

## Prerequisites / shared assumptions

These changes assume the superapp already has (or is porting) the same SOA Breakdown architecture as finance-automations:

- A credential context/provider that stores `{ bpcode, district }` after **View Breakdown** is clicked (`showBreakdown`, `hasCredentials`, `viewBreakdown`).
- Outstanding view API path that sets `outstanding_view=true` and returns normalized rows with `code`, `resolvedCode`, `kind`, `remarks`, etc.
- Interest code resolution via `resolveInterestCode()` in `code-utils.ts` (splits `IN` into `IN_DUES`, `IN_WATER_OT`, `IN_ELEC`, or generic `IN`).
- Category pill UI for filtering fee rows in both outstanding and settled/history views.

If the superapp file paths differ, map by responsibility (component, util, service) rather than exact path.

---

## Change 1: Persistent inspected unit label

### Problem

The Customer Details form is always visible on the main breakdown page, but when navigating to **Past Fees** or **Past Payments** (SOA History), users lose visual context of which unit they are analyzing. The form draft may also appear empty even though credentials exist in context.

### Decision

Add a small green label (`UO-00xxx · HR`) directly above the breakdown content. It reads from the shared credential context, so it persists across tab/view switches and updates only when a new **View Breakdown** query is submitted.

### Example scenario

1. User enters `UO-00347` / `LR` and clicks **View Breakdown**.
2. Label shows: `UO-00347 · LR`.
3. User clicks **See Past Fees** → history page still shows `UO-00347 · LR` above totals.
4. User runs a new breakdown for `UO-00799` / `HR` → label updates.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/InspectedUnitLabel.tsx` | **Create** |
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — render `<InspectedUnitLabel />` at top of breakdown |
| `src/components/billing/breakdowns/ResidentBreakdownResults.tsx` | **Modify** — same placement on history page |

### Implementation

**Create `InspectedUnitLabel.tsx`:**

```tsx
"use client";

import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";

export function InspectedUnitLabel() {
  const { credentials, hasCredentials } = useSoaBreakdownCredentials();

  if (!hasCredentials) {
    return null;
  }

  return (
    <p className="text-sm font-bold text-green-700">
      {credentials.bpcode} · {credentials.district}
    </p>
  );
}
```

**In both `ResidentBreakdownRequest` and `ResidentBreakdownResults`**, import and render as the first child inside the main breakdown container:

```tsx
<div className="space-y-6">
  <InspectedUnitLabel />
  {/* existing breakdown sections */}
</div>
```

No backend changes required.

---

## Change 2: Expanded Others fee category + dual membership filtering

### Problem

The original **Others** category only matched `resolvedCode === "IN"` (unclassified interest). Miscellaneous fee codes (`SF`, `SH`, `SR`, `SU`, `CI`, `RF`) were documented in `FEE_CODES` but not assigned to any category pill, so clicking **Others** did not filter them. Utility interest (`IN_WATER_OT`) could not appear in both **Water** and **Others** because filtering used a flat `Set<resolvedCode>`.

### Decisions

1. **Expand Others** to include explicit miscellaneous codes plus a catch-all for unknown docno prefixes.
2. **Dual membership**: `IN_WATER_OT` rows match both **Water** and **Others**.
3. **Refactor filtering** from `Set<resolvedCode>` to `Set<FeeCategoryId>` with per-category membership functions, because one row can belong to multiple categories.

### Category membership rules (final)

| Category | Matches `resolvedCode` |
|----------|------------------------|
| **Dues & Equity** | `AD`, `EC`, `IN_DUES` |
| **Water** | `WA`, `IN_WATER_OT` |
| **Electricity** | `EL`, `IN_ELEC` |
| **Others** | See rules below |

**Others membership** (`rowMatchesOthers`):

- **Include** if `resolvedCode` is one of: `SF`, `SH`, `SR`, `SU`, `CI`, `RF`, `IN`, `IN_WATER_OT`
- **Exclude** primary fees and their dedicated interest: `AD`, `EC`, `IN_DUES`, `WA`, `EL`, `IN_ELEC`
- **Catch-all**: include if raw docno prefix (`code`) is not `AD`, `EC`, `WA`, `EL`, or `IN` (covers unknown future fee codes like `ZZ`)

**Interest resolution** (unchanged — `src/lib/utils/code-utils.ts`):

```ts
// IN from electricity ledger → IN_ELEC
// IN with AD/EC in remarks → IN_DUES
// IN with WA/OT in remarks → IN_WATER_OT
// IN with both AD/EC and WA/OT in remarks → IN (generic)
// IN with neither → IN (generic)
```

### Example scenarios

| Row | `code` | `resolvedCode` | Dues | Water | Elec | Others |
|-----|--------|----------------|------|-------|------|--------|
| Association Dues | `AD` | `AD` | ✓ | | | |
| Water invoice | `WA` | `WA` | | ✓ | | |
| Utility interest | `IN` | `IN_WATER_OT` | | ✓ | | ✓ |
| Sports facility | `SF` | `SF` | | | | ✓ |
| Dues interest | `IN` | `IN_DUES` | ✓ | | | |
| Unclassified interest | `IN` | `IN` | | | | ✓ |
| Unknown code | `ZZ` | `ZZ` | | | | ✓ |

**Filter behavior:**

- No pills selected → show all rows.
- One or more pills selected → show rows matching **any** selected category (OR logic).
- Selecting **Water** + **Others** shows water invoices, utility interest, and miscellaneous fees.

### Files affected

| File | Action |
|------|--------|
| `src/lib/utils/fee-categories.ts` | **Rewrite** — membership functions, `filterRowsByCategories`, `toggleCategory` |
| `src/lib/utils/fee-categories.test.ts` | **Create** |
| `src/components/billing/breakdowns/CategoryPills.tsx` | **Modify** — use `selectedCategories: Set<FeeCategoryId>` |
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — replace `selectedCodes` with `selectedCategories` + `filterRowsByCategories` |
| `src/components/billing/breakdowns/ResidentBreakdownResults.tsx` | **Modify** — same |

### Implementation

**Replace `fee-categories.ts` exports.** Key new API:

```ts
export type FeeCategoryId = "dues" | "water" | "electricity" | "others";

export type FeeCategoryRow = { code: string; resolvedCode: string };

export function rowMatchesCategory(row: FeeCategoryRow, categoryId: FeeCategoryId): boolean;
export function filterRowsByCategories<T extends FeeCategoryRow>(rows: T[], selectedCategories: Set<FeeCategoryId>): T[];
export function toggleCategory(prev: Set<FeeCategoryId>, categoryId: FeeCategoryId): Set<FeeCategoryId>;
```

Remove the old `toggleCategoryCodes(prev: Set<string>, category)` — it cannot express dual membership.

**`OTHER_CODES` constant** (documentation + `OTHER_CODE_SET`):

```ts
export const OTHER_CODES = [
  "SF", "SH", "SR", "SU", "CI", "RF", "IN", "IN_WATER_OT",
] as const;
```

**`CategoryPills.tsx`** — change props:

```ts
type CategoryPillsProps = {
  selectedCategories: Set<FeeCategoryId>;
  onChange: (next: Set<FeeCategoryId>) => void;
};
```

Active state: `selectedCategories.has(category.id)`.  
Click handler: `toggleCategory(selectedCategories, category.id)`.

**`ResidentBreakdownRequest.tsx` / `ResidentBreakdownResults.tsx`:**

```ts
const [selectedCategories, setSelectedCategories] = useState<Set<FeeCategoryId>>(new Set());

const filteredRows = useMemo(() => {
  const allRows = /* fee rows only */;
  return filterRowsByCategories(allRows, selectedCategories);
}, [/* rows */, selectedCategories]);

<CategoryPills
  selectedCategories={selectedCategories}
  onChange={setSelectedCategories}
/>
```

No backend changes. `resolvedCode` must already be set on each row during normalization (existing `resolveInterestCode` call).

---

## Change 3: Select All / Unselect All for outstanding fees

### Problem

Users manually select individual outstanding fee rows to check totals via the bottom **Selected ₱…** bar. With many rows (or after category filtering), toggling each row is tedious.

### Decision

Add a single toggle button in the Outstanding Fees header:

- Shows **Select All** when not all visible rows are selected.
- Shows **Unselect All** when all visible rows are selected.
- Operates on the **currently filtered** row list (respects category pills).
- Does not clear selections for rows hidden by the current filter.

### Example scenario

1. User filters to **Water** → 3 rows visible.
2. Clicks **Select All** → all 3 water rows selected; bottom bar shows their sum.
3. Clicks **Unselect All** → those 3 deselected; previously selected non-water rows (if any) remain selected.
4. Clears category filter → all fees visible again.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/OutstandingFees.tsx` | **Modify** — add toggle button + `onToggleSelectAll` prop |
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — implement `toggleSelectAll` handler |

### Implementation

**`OutstandingFees.tsx`** — add prop and header button:

```ts
type OutstandingFeesProps = {
  // ...existing props
  onToggleSelectAll: () => void;
};

const visibleRowIds = rows.map((row) => `${row.source}-${row.docno}`);
const allVisibleSelected =
  visibleRowIds.length > 0 &&
  visibleRowIds.every((id) => selectedRowIds.has(id));

// In header, next to "See Past Fees":
<button type="button" onClick={onToggleSelectAll}>
  {allVisibleSelected ? "Unselect All" : "Select All"}
</button>
```

Only show the button when `!isLoading && !isError && rows.length > 0`.

**`ResidentBreakdownRequest.tsx`:**

```ts
const toggleSelectAll = () => {
  const visibleIds = filteredRows.map((row) => `${row.source}-${row.docno}`);
  const allSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedRowIds.has(id));

  setSelectedRowIds((prev) => {
    const next = new Set(prev);
    if (allSelected) {
      visibleIds.forEach((id) => next.delete(id));
    } else {
      visibleIds.forEach((id) => next.add(id));
    }
    return next;
  });
};

<OutstandingFees
  // ...
  onToggleSelectAll={toggleSelectAll}
/>
```

Row IDs remain `${row.source}-${row.docno}` (unchanged).

No backend changes.

---

## Change 4: Hide adjustment ARINVOICE from outstanding fees

### Problem

Some units have stale **adjustment** open items on the balance table that were already reversed via `ARCREDITMEMO` but still appear as outstanding `ARINVOICE` rows. These clutter the outstanding fees list and do not appear in the ledger.

**Example: UO-00347 LR**

| type | docno | remarks | dueamount |
|------|-------|---------|-----------|
| arinvoice | OT-25-01-01155 | Adjustment | 11,671.00 |
| arinvoice | OT-25-01-01156 | Adjustment | 122.05 |
| arinvoice | OT-25-04-01182 | ADJUSTMENT JUN 2025 SOA | 23,727.34 |
| arcreditmemo | ARCM-25-01-00043 | Adjustment | -11,671.00 |
| arcreditmemo | ARCM-25-01-00044 | Adjustment | -122.05 |
| arcreditmemo | ARCM-25-04-01877 | ADJUSTMENT JUN 2025 SOA | -23,727.34 |

Legitimate current fees (AD, EC, WA) should still show.

### Why not filter by `OT` docno prefix?

Other units have real `OT` invoices that must remain visible, e.g.:

```
OT-26-01-00002 | Parking Slot Renewal 2S-002 & 2S-003 - Feb 2026
```

### Decision

Filter by **remarks** on balance-table `ARINVOICE` rows only:

- Regex: `/\badjustments?\b/i` (whole-word, case-insensitive).
- Apply only when building the **outstanding view** fee list (`outstanding_view=true`).
- Do **not** apply to past/settled fees (ledger path).
- Do **not** change balance totals, floating-credit reconciliation, or `duesFeeRows` used internally — display filter only.

### Example scenarios

| remarks | Hidden? |
|---------|---------|
| `Adjustment` | Yes |
| `ADJUSTMENT JUN 2025 SOA` | Yes |
| `Adjustments for prior period` | Yes |
| `Parking Slot Renewal 2S-002 & 2S-003 - Feb 2026` | No |
| `07/2026 Association Dues 82.50sqm @ 125.00/sqm` | No |

### Files affected

| File | Action |
|------|--------|
| `src/lib/utils/balance-row-utils.ts` | **Create** |
| `src/lib/utils/balance-row-utils.test.ts` | **Create** |
| `src/app/server/services/resident-breakdown.service.ts` | **Modify** — optional `excludeAdjustmentFees` on normalize methods |

### Implementation

**Create `balance-row-utils.ts`:**

```ts
const ADJUSTMENT_REMARKS_RE = /\badjustments?\b/i;

export function isAdjustmentArinvoiceRemarks(remarks: string): boolean {
  return ADJUSTMENT_REMARKS_RE.test(remarks);
}
```

**In `resident-breakdown.service.ts`**, add optional filter to both normalize methods:

```ts
private normalizeBalanceRows(
  rows: BalanceApiRow[],
  start: Date | null,
  end: Date | null,
  options?: { excludeAdjustmentFees?: boolean },
): ResidentBreakdownRow[] {
  return rows
    .filter((row) => {
      if (!this.isArinvoice(row) || !this.isInDateRange(row, start, end)) {
        return false;
      }
      if (
        options?.excludeAdjustmentFees &&
        isAdjustmentArinvoiceRemarks(row.remarks ?? "")
      ) {
        return false;
      }
      return true;
    })
    .map(/* unchanged */);
}
```

Same pattern for `normalizeElectricityRows`.

**Only pass the flag in the outstanding view block:**

```ts
const normalizedRows = [
  ...this.normalizeBalanceRows(balanceRows, null, null, {
    excludeAdjustmentFees: true,
  }),
  ...this.normalizeElectricityRows(electricityRows, null, null, {
    excludeAdjustmentFees: true,
  }),
  ...toUncreditedPaymentRows(duesReconciliation.displayed),
  ...toUncreditedPaymentRows(electricityReconciliation.displayed),
];
```

Do **not** pass `excludeAdjustmentFees` in the non-outstanding `getFees` path or `getPastLedger`.

---

## Complete file inventory

### New files

```
src/components/billing/breakdowns/InspectedUnitLabel.tsx
src/lib/utils/balance-row-utils.ts
src/lib/utils/balance-row-utils.test.ts
src/lib/utils/fee-categories.test.ts
```

### Modified files

```
src/lib/utils/fee-categories.ts
src/components/billing/breakdowns/CategoryPills.tsx
src/components/billing/breakdowns/ResidentBreakdownRequest.tsx
src/components/billing/breakdowns/ResidentBreakdownResults.tsx
src/components/billing/breakdowns/OutstandingFees.tsx
src/app/server/services/resident-breakdown.service.ts
```

### Unchanged but required by these changes

```
src/lib/utils/code-utils.ts              — resolveInterestCode (no changes)
src/components/providers/SoaBreakdownCredentialProvider.tsx
src/app/soa-breakdown/page.tsx
src/app/soa-breakdown/results/page.tsx
```

---

## Port checklist for two-serendra-superapp

Use this order to avoid broken intermediate states:

- [ ] **1. Utils (backend-independent)**
  - [ ] Add `balance-row-utils.ts` + tests
  - [ ] Replace/expand `fee-categories.ts` + tests
  - [ ] Verify `code-utils.ts` has `resolveInterestCode` with `IN_DUES` / `IN_WATER_OT` / `IN_ELEC` split

- [ ] **2. Backend**
  - [ ] Add `excludeAdjustmentFees` option to balance/electricity row normalization
  - [ ] Enable only in `outstandingView` response path
  - [ ] Confirm outstanding API still returns `resolvedCode` on each fee row

- [ ] **3. UI components**
  - [ ] Create `InspectedUnitLabel.tsx`
  - [ ] Update `CategoryPills` to category-ID state
  - [ ] Update `OutstandingFees` with Select All toggle
  - [ ] Wire `ResidentBreakdownRequest` (label, categories, select all)
  - [ ] Wire `ResidentBreakdownResults` (label, categories)

- [ ] **4. Manual verification**
  - [ ] Unit label persists on main → history navigation
  - [ ] Others pill includes SF/SH/etc.; `IN_WATER_OT` appears under Water and Others
  - [ ] Select All respects active category filter
  - [ ] UO-00347 LR: adjustment OT rows hidden; AD/EC/WA still shown
  - [ ] Unit with `OT` parking renewal: row still visible

- [ ] **5. Automated tests**

```bash
npm run test:run -- src/lib/utils/fee-categories.test.ts src/lib/utils/balance-row-utils.test.ts
```

---

## Test cases to preserve

### Fee categories (`fee-categories.test.ts`)

- Primary fees (`AD`, `WA`) only match their own category
- `SF`, `CI` match Others
- `IN_WATER_OT` matches Water **and** Others
- `IN_DUES`, `IN_ELEC` do not match Others
- Generic `IN` and unknown `ZZ` match Others
- `filterRowsByCategories` with `water` + `others` returns water invoice, utility interest, and sports fee

### Adjustment filter (`balance-row-utils.test.ts`)

- `"Adjustment"`, `"ADJUSTMENT JUN 2025 SOA"`, `"Adjustments for prior period"` → `true`
- Parking renewal and association dues remarks → `false`

---

## Notes for the porting agent

1. **Map paths, not names literally.** The superapp may use different folder structure; match by component/service responsibility.
2. **Do not hide adjustments in ledger/history.** They are not in the ledger today; filtering outstanding display is sufficient.
3. **Do not filter all `OT` docnos.** Remarks-based filter is intentional.
4. **Category refactor is breaking** for any code still using `selectedCodes: Set<string>` or `toggleCategoryCodes`. Search the superapp for those symbols and update all call sites together.
5. **Balance math is intentionally unchanged** for adjustment hiding. If the superapp later needs reconciliation to ignore adjustment rows too, that is a separate change.

---

## Reference: finance-automations source of truth

Branch/state as of **Jul 6, 2026**. Compare these files directly when porting:

- `src/lib/utils/fee-categories.ts`
- `src/lib/utils/balance-row-utils.ts`
- `src/components/billing/breakdowns/InspectedUnitLabel.tsx`
- `src/components/billing/breakdowns/CategoryPills.tsx`
- `src/components/billing/breakdowns/OutstandingFees.tsx`
- `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx`
- `src/components/billing/breakdowns/ResidentBreakdownResults.tsx`
- `src/app/server/services/resident-breakdown.service.ts` (outstanding view block ~lines 169–178 and normalize methods ~lines 351–430)

---
---

# Additional changes (Jul 6, 2026 — later session)

Three more changes made the same day, after the four above. One new feature (**EBT Inspector**) and two **floating-credit reconciliation bug fixes** discovered while auditing real units against the EBT.

The two reconciliation fixes touch the **same code path** (`reconcileLane` → `reconcileDownpaymentCandidates` in `floating-balance.ts`) that decides which advance/downpayment rows appear under **Uncredited Payments** (Payments tab). Port them together.

## Summary (additional)

| # | Change | Layer | Scope |
|---|--------|-------|-------|
| 5 | EBT Inspector tab (raw EBT viewer + Excel export) | New feature (UI + API) | New route, independent of SOA Breakdown |
| 6 | Count `arcreditmemo` in outstanding-fee sum | Backend service + floating-balance util | Uncredited Payments reconciliation |
| 7 | Shared credit-memo false-exhaustion fallback | floating-balance util | Uncredited Payments reconciliation |

---

## Background the porting agent MUST understand: how EBT models advances

The reconciliation math in changes 6 and 7 only makes sense with these EBT facts. Both fixes are about the **Uncredited Payments** list (advance payments / payments not yet fully applied), built by `reconcileLane`.

**EBT ledger row types and their effect on the running `balance` column:**

- **`INCOMINGPAYMENT`** (has `credit`) — money arrives; *lowers* the running balance.
- **`ARINVOICE`** (has `debit`) — a charge; *raises* the running balance.
- **`CREDITMEMO`** — `debit == credit` (equal), so it is **net-zero to the running balance**. It is **not** money movement; it is an *allocation/application record* that says "this much floating advance has now been formally applied to these specific invoices." Its `refdocs` list the invoices it closed **and** the payment(s) that funded it.
- **`ARCREDITMEMO`** — a negative open item on the balance table (e.g. a reversal/adjustment). Reduces net fees. Hidden from the resident's fee list (see Change 4) but **is** baked into the ledger running balance.

**Sign convention:** a **negative** running balance means the resident is in **credit/advance** (prepaid); positive means owed.

**A single advance is applied over many months via successive credit memos.** One credit memo can be funded by **more than one** payment (it lists multiple `ACR…` docnos in `refdocs`) — this "shared credit memo" is the root of Change 7.

**How `reconcileLane` decides what to show (existing logic, unchanged in intent):**

```
outstandingFees   = sumOutstandingFees(feeRows)          // open charges on the balance table
ledgerFinalBalance= getLedgerFinalBalance(ledgerRows)    // last running balance
derivedCredit     = max(0, outstandingFees - ledgerFinalBalance)  // TRUSTED floating-credit total
candidateSum      = Σ downpayment.candidateRemaining     // what EBT's downpayment rows claim is left
```

`derivedCredit` is the **ground truth** (derived from reliable ledger numbers). The downpayment rows' `dueamount` can be **stale**. `reconcileDownpaymentCandidates` tries to pick the subset of downpayment rows whose remaining sums to `derivedCredit`:

- `derivedCredit ≈ candidateSum` → mode `"all"` (show every candidate).
- `candidateSum < derivedCredit` → mode `"aggregate_only"` (**show nothing** — candidates can't account for the credit).
- `candidateSum > derivedCredit` → try to hide stale/exhausted candidates and show a matching subset (mode `"subset"`), else fall back to `"aggregate_only"`.

Both bugs below end in the wrong `"aggregate_only"` (everything hidden) when a legitimate advance should have shown.

---

## Change 5: EBT Inspector tab (raw EBT viewer)

### Problem

Reconciling a unit against the EBT meant copying the SOA Breakdown JSON, asking an AI to convert it to CSV, saving it, and opening it in Excel. Slow and manual. The processed SOA Breakdown JSON is also *normalized* (filtered/transformed), so it is not the exact EBT data an auditor needs to see.

### Decision

Add a new **EBT Inspector** tab that queries the EBT directly and shows the **raw** upstream rows in an Excel-like table, with a one-click **Export to Excel**. It deliberately **bypasses** all SOA-Breakdown normalization — it hits the repository (`billingBreakdownRepository`) directly so the auditor sees exactly what the EBT returns.

- Same email/session protection as SOA Breakdown (add the routes to the auth middleware matcher).
- Query by Customer No. + District + one of four query types (each is a separate EBT request):

| Query type | EBT endpoint (repository method) | Notes |
|---|---|---|
| Balance | `fetchOutstanding()` → `.balance[]` | no date range |
| Electricity Balance | `fetchOutstanding()` → `.electricity[]` | no date range |
| Ledger | `fetchPastLedger(dateFrom, dateTo)` → `.ledger[]` | requires date range |
| Electricity Ledger | `fetchElectricityLedger(dateFrom, dateTo)` | requires date range |

- Table columns are **derived from the union of row keys** (first-seen order) so the table always mirrors the exact EBT shape. Array cells (e.g. `refdocs`) are flattened to a comma-joined string for both display and export.
- Export uses the already-installed `xlsx` dependency (`XLSX.utils.json_to_sheet` + `XLSX.writeFile`), filename `EBT_<bpcode>_<type>.xlsx`.

### Files affected

| File | Action |
|------|--------|
| `src/app/api/ebt-inspector/route.ts` | **Create** — GET, validates query, calls repository directly, returns raw rows |
| `src/app/ebt-inspector/layout.tsx` | **Create** — wraps page in `QueryProvider` (no credential provider needed) |
| `src/app/ebt-inspector/page.tsx` | **Create** — form + table + Excel export |
| `src/components/TabNav.tsx` | **Modify** — add `{ label: "EBT Inspector", href: "/ebt-inspector" }` |
| `src/middleware.ts` | **Modify** — add `/ebt-inspector/:path*` and `/api/ebt-inspector/:path*` to matcher |

### Implementation

**API route** (`src/app/api/ebt-inspector/route.ts`) — key points: reuse `DistrictSchema` and `parseApiDate`; require dates only for ledger types; call the repo directly (do **not** route through `residentBreakdownService`, which normalizes):

```ts
const EbtQuerySchema = z
  .object({
    bpcode: z.string().trim().min(1),
    district: DistrictSchema,
    type: z.enum(["balance", "electricity_balance", "ledger", "electricity_ledger"]),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ledger" && v.type !== "electricity_ledger") return;
    for (const key of ["date_from", "date_to"] as const) {
      if (!v[key] || !parseApiDate(v[key]!)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Valid ${key} is required in MM/DD/YYYY format.`, path: [key] });
      }
    }
  });

// dispatch:
//  balance / electricity_balance -> fetchOutstanding() then pick .balance or .electricity
//  ledger                        -> fetchPastLedger(bpcode, district, date_from, date_to).ledger
//  electricity_ledger            -> fetchElectricityLedger(bpcode, district, date_from, date_to)
// return { success: true, data: { rows } }
```

**Page** (`src/app/ebt-inspector/page.tsx`) — client component. Local state only (customer no, district, query type, dateFrom/dateTo defaulting to last 12 months in `MM/DD/YYYY`). `useQuery` fires on submit. Columns = union of keys across returned rows; `cellToString` flattens arrays. Reuse the same input/select styling as `SoaBreakdownCredentialsForm`. Show date inputs only for ledger types. "Export to Excel" maps rows through the derived columns and writes an `.xlsx`.

**No changes to the SOA Breakdown feature.** This tab is independent. If the superapp already exposes the EBT via an equivalent repository/service, point the four query types at the equivalent calls.

### Port notes

- The superapp's equivalent of `billingBreakdownRepository` may be named differently — map by responsibility (the thing that does the authenticated `X-API-Key` fetch to the EBT base URL).
- Ensure the new routes are behind the same auth as SOA Breakdown (session cookie / email OTP middleware).
- `xlsx` is already a dependency in finance-automations; confirm it exists in the superapp or add it.

---

## Change 6: Count `arcreditmemo` in the outstanding-fee sum

### Problem

A legitimate, **not-yet-exhausted advance payment disappeared** from Uncredited Payments whenever the unit also had an open `arcreditmemo` (a hidden negative adjustment, e.g. a Pet-ID reversal) on the balance table.

**Example: UO-00391 LR** — advance `ACR647020-2S` (₱153,090.00, a 12-month prepayment) had ₱76,545.00 genuinely unapplied, but showed **nothing** in the dues lane's Uncredited Payments.

### Root cause

`sumOutstandingFees` counted only `ARINVOICE` rows and **ignored** the `ARCREDITMEMO` (negative) row. But `ledgerFinalBalance` **does** include that reversal. So:

```
sumOutstandingFees = 14,833.80        // arinvoice only; the -1,000 arcreditmemo omitted
ledgerFinalBalance = -62,712.14       // includes the -1,000 reversal
derivedCredit      = 14,833.80 - (-62,712.14) = 77,545.94   // OVERSTATED by 1,000
candidateSum       = 76,545.94        // real remaining advance (76,545.00 + 0.94)
```

`candidateSum (76,545.94) < derivedCredit (77,545.94)` → `reconcileDownpaymentCandidates` hits the `candidateSum < derivedTotalCredit` branch → returns `mode: "aggregate_only"` → **displays nothing**. The ₱1,000 phantom gap equals exactly the omitted arcreditmemo.

### There are TWO places to fix (both required)

`arcreditmemo` is stripped **twice**: once by the service before rows reach `reconcileLane`, and once inside `sumOutstandingFees`. Both must let it through, or the fix is silently ineffective (the util fix alone passes unit tests but does nothing in the running app, because the service already removed the row upstream).

### Decision

Count `arcreditmemo` (which carries a **negative** `dueamount`, so it nets correctly) in the outstanding-fee sum **for reconciliation math only**. Keep it **hidden from the resident's fee list** — display still filters to `ARINVOICE` (`normalizeBalanceRows`, unchanged; consistent with Change 4).

### Files affected

| File | Action |
|------|--------|
| `src/lib/billing/floating-balance.ts` | **Modify** — add `isArcreditmemo`; include it in `sumOutstandingFees` |
| `src/app/server/services/resident-breakdown.service.ts` | **Modify** — the `duesFeeRows` / `electricityFeeRows` filters (outstanding-view block) must include `arcreditmemo` |
| `src/lib/billing/floating-balance.test.ts` | **Modify** — add regression test |

### Implementation

**`floating-balance.ts`:**

```ts
function isArcreditmemo(row: { type?: string }): boolean {
  return (row.type ?? "").toLowerCase() === "arcreditmemo";
}

export function sumOutstandingFees(rows: BalanceLikeRow[]): number {
  return rows.reduce((sum, row) => {
    if (isArinvoice(row)) return sum + parseMoney(row.dueamount);
    // Only a CREDIT-side (negative dueamount) arcreditmemo nets against fees;
    // it is hidden from the resident's list (normalizeBalanceRows shows arinvoice
    // only) but MUST count here or derivedCredit is overstated and reconcile
    // wrongly falls to "aggregate_only" (e.g. a -500 Pet-ID reversal).
    // Positive arcreditmemo rows are stale reversed-invoice artifacts NOT in the
    // ledger balance (e.g. UO-00803's 2023 rows of 28k/158k); counting them would
    // massively overstate derivedCredit and hide legit advances.
    if (isArcreditmemo(row)) {
      const due = parseMoney(row.dueamount);
      return due < 0 ? sum + due : sum;
    }
    return sum;
  }, 0);
}
```

> **IMPORTANT — sign matters.** Count `arcreditmemo` **only when its `dueamount` is negative** (the true credit/reversal case). Some units carry **positive** `arcreditmemo` rows on the balance table that are stale reversed-invoice artifacts and are **not** reflected in the ledger balance. Example: **UO-00803 LR** has 2023 A/R Credit Memos of `+28,334.78` and `+158,351.12`. Counting those blew `sumOutstandingFees` up to ~194,438 and re-hid two small legit advances (`ACR695473-2S` ₱532.31 + `ACR697392-2S` ₱0.79 = ₱533.10). With negative-only: `7,608.32 (arinvoice) − 500 (Pet-ID reversal) = 7,108.32`; `derivedCredit = 7,108.32 − 6,575.22 = 533.10 = candidateSum` → mode `"all"` → both advances show. An early version of this fix counted *all* arcreditmemo and had to be corrected — do not repeat that.

**`resident-breakdown.service.ts`** — in the `outstandingView` block, the fee-row filters previously kept only `arinvoice`. Change both to include `arcreditmemo`. These `feeRows` feed only `sumOutstandingFees` (and the past-ledger date-range calc, where an extra negative row is harmless). Display is a separate path (`normalizeBalanceRows`), so the resident still never sees the arcreditmemo:

```ts
// arcreditmemo (negative) nets against fees in sumOutstandingFees so
// derivedCredit stays correct. It is NOT displayed (normalizeBalanceRows shows
// arinvoice only); it only feeds the reconciliation math here.
const isFeeRow = (row: { type?: string }) => {
  const type = (row.type ?? "").toLowerCase();
  return type === "arinvoice" || type === "arcreditmemo";
};
const duesFeeRows = balanceRows.filter(isFeeRow);
const duesPaymentRows = balanceRows.filter(
  (row) => (row.type ?? "").toLowerCase() === "downpayment",
);
const electricityFeeRows = electricityRows.filter(isFeeRow);
const electricityPaymentRows = electricityRows.filter(
  (row) => (row.type ?? "").toLowerCase() === "downpayment",
);
```

**Result on UO-00391:** `sumOutstandingFees = 14,833.80 + (-1,000) = 13,833.80` → `derivedCredit = 76,545.94 = candidateSum` → mode `"all"` → `ACR647020-2S` shows its ₱76,545 floating advance.

### Regression test (add to `floating-balance.test.ts`)

Feed `reconcileLane` a balance set with an `arcreditmemo` and assert the advance still displays:

```ts
it("391 dues lane — arcreditmemo counts in fees so advance still shows", () => {
  const balanceRows: BalanceApiRow[] = [
    { type: "arinvoice", docno: "AD-26-06-06516", dueamount: "11,812.50" },
    { type: "arinvoice", docno: "WA-26-06-04613", dueamount: "3,021.30" },
    { type: "arcreditmemo", docno: "ARCM-26-07-00178", dueamount: "-1,000.00" },
    { type: "downpayment", docno: "ACR647020-2S", docdate: "01/07/2026", amount: "-153,090.00", dueamount: "-76,545.00", remarks: "01/2026 - 12/2026 Association Dues & Equity Contribution" },
    { type: "downpayment", docno: "ACR698475-2S", docdate: "06/01/2026", amount: "-439.00", dueamount: "-0.94", remarks: "Water Apr 2026 with over" },
  ];
  const ledgerRows: LedgerApiRow[] = [
    { docdate: "07/02/2026", docno: "ARCM-26-07-00178", doctype: "ARCREDITMEMO", credit: "1,000.00", balance: "-62,712.14", refdocs: "SU-26-06-01773" },
  ];
  const feeRows = balanceRows.filter((r) => r.type === "arinvoice" || r.type === "arcreditmemo");
  expect(sumOutstandingFees(feeRows)).toBeCloseTo(13833.8, 2);
  const result = reconcileLane({
    feeRows,
    paymentCandidateRows: balanceRows.filter((r) => r.type === "downpayment"),
    ledgerRows,
    source: "ledger",
  });
  expect(result.derivedCredit).toBeCloseTo(76545.94, 2);
  expect(result.candidateSum).toBeCloseTo(76545.94, 2);
  expect(result.mode).toBe("all");
  expect(result.displayed.map((r) => r.docno).sort()).toEqual(["ACR647020-2S", "ACR698475-2S"]);
});
```

Second test — positive-arcreditmemo artifacts must be ignored (guards the sign rule):

```ts
it("803 dues lane — positive arcreditmemo artifacts must NOT inflate fees", () => {
  const balanceRows: BalanceApiRow[] = [
    { type: "arinvoice", docno: "AD-26-06-06927", dueamount: "5,500.00" },
    { type: "arinvoice", docno: "EC-26-06-06920", dueamount: "440.00" },
    { type: "arinvoice", docno: "SU-26-06-01775", dueamount: "500.00" },
    { type: "arinvoice", docno: "WA-26-06-04910", dueamount: "1,168.32" },
    { type: "arcreditmemo", docno: "ARCM-23-06-00045", dueamount: "28,334.78" },
    { type: "arcreditmemo", docno: "ARCM-23-06-00047", dueamount: "158,351.12" },
    { type: "arcreditmemo", docno: "ARCM-26-07-00180", dueamount: "-500.00" },
    { type: "downpayment", docno: "ACR695473-2S", docdate: "05/11/2026", amount: "-533.40", dueamount: "-532.31" },
    { type: "downpayment", docno: "ACR697392-2S", docdate: "05/19/2026", amount: "-886.00", dueamount: "-0.79" },
  ];
  const ledgerRows: LedgerApiRow[] = [
    { docdate: "06/20/2026", docno: "WA-26-06-04910", doctype: "ARINVOICE", debit: "1,168.32", balance: "6,575.22" },
  ];
  const feeRows = balanceRows.filter((r) => r.type === "arinvoice" || r.type === "arcreditmemo");
  expect(sumOutstandingFees(feeRows)).toBeCloseTo(7108.32, 2); // positive 28k/158k ignored
  const result = reconcileLane({
    feeRows,
    paymentCandidateRows: balanceRows.filter((r) => r.type === "downpayment"),
    ledgerRows,
    source: "ledger",
  });
  expect(result.derivedCredit).toBeCloseTo(533.1, 2);
  expect(result.mode).toBe("all");
  expect(result.displayed.map((r) => r.docno).sort()).toEqual(["ACR695473-2S", "ACR697392-2S"]);
});
```

---

## Change 7: Shared credit-memo false-exhaustion fallback

### Problem

When one credit memo is funded by **two** advance payments, **both** advances vanished from Uncredited Payments — even the one still genuinely floating.

**Example: UO-00432 LR** — two dues advances:

- `ACR653666-2S` (₱14,000) — actually **fully consumed** (EBT's `dueamount -7,000.68` is stale). Correctly should be hidden.
- `ACR654326-2S` (₱42,000) — genuinely **₱4,044.32** left. Should show.

Correct output: show `ACR654326-2S` (4,044.32), hide `ACR653666-2S`. Actual output: **both hidden**.

### Root cause

`CM-25-12-14633` (₱14,430) is a **shared** credit memo — its `refdocs` reference **both** `ACR653666-2S` and `ACR654326-2S` (it was funded by the ₱6,999.32 tail of the first advance plus ₱7,430.68 of the second).

`enrichCandidateFromLedger` computes `referencedCmTotal` by summing the **full** credit of every CM in a payment's `refdocs`. For the shared CM it counts the whole ₱14,430 against **each** payment:

```
ACR653666-2S: paymentNet 14,000  referencedCmTotal 21,430.68  -> isLedgerExhausted = true  (correct)
ACR654326-2S: paymentNet 42,000  referencedCmTotal 44,955.00  -> isLedgerExhausted = true  (WRONG; only 37,955.68 truly applied)
```

Both flagged exhausted → in `reconcileDownpaymentCandidates` the `active` (non-exhausted) set is **empty** → the subset search runs on `active` (nothing) → greedy runs on `active` (nothing) → returns `mode: "aggregate_only"` → **both hidden**.

`derivedCredit` here is `4,044.32`, which equals `ACR654326-2S` alone — so a subset-sum over **all** candidates would recover the right answer, but the code never tried it because it pre-filtered to `active` first.

### Decision

Add a **fallback**: before returning `aggregate_only` in the `candidateSum > derivedCredit` branch, run `subsetSum` over **all** candidates (not just `active`) against the trusted `derivedCredit`. This is a pure fallback — it only fires when the existing logic would otherwise display nothing, so it strictly improves behavior and does not disturb passing cases. Guard with `candidates.length <= 12` (the existing `subsetSum` is O(2ⁿ) bitmask).

We did **not** rewrite `isLedgerExhausted` to split shared credit memos proportionally — that needs an allocation engine. The subset-sum fallback over the trusted `derivedCredit` is smaller and self-correcting. Ceiling: `subsetSum` is exponential, already gated at ≤12 candidates; revisit only if a unit ever has >12 floating downpayments.

### Files affected

| File | Action |
|------|--------|
| `src/lib/billing/floating-balance.ts` | **Modify** — add all-candidates subset-sum fallback in `reconcileDownpaymentCandidates` |
| `src/lib/billing/floating-balance.test.ts` | **Modify** — add regression test |

### Implementation

In `reconcileDownpaymentCandidates`, replace the trailing `aggregate_only` returns (the two at the very end of the `candidateSum > derivedTotalCredit` path) with:

```ts
// Fallback: isLedgerExhausted over-counts a credit memo that is shared by
// several payments (its full credit is attributed to each), which can falsely
// flag a still-floating payment as exhausted and empty `active`. Before giving
// up, subset-sum over ALL candidates against the trusted derivedCredit.
if (candidates.length <= 12) {
  const fullSubset = subsetSum(candidates, derivedTotalCredit, tolerance);
  if (fullSubset && fullSubset.length > 0) {
    const displayedDocnos = new Set(fullSubset.map((row) => row.docno));
    const hidden = candidates.filter((row) => !displayedDocnos.has(row.docno));
    return { displayed: fullSubset, hidden, mode: "subset" };
  }
}

return { displayed: [], hidden: candidates, mode: "aggregate_only" };
```

**Result on UO-00432:** `active` is empty → fallback `subsetSum([7,000.68, 4,044.32], target 4,044.32)` → picks `{ACR654326-2S}` → shown; `ACR653666-2S` hidden. Correct.

### Regression test (add to `floating-balance.test.ts`)

```ts
it("432 dues lane — shared credit memo must not hide the floating advance", () => {
  const balanceRows: BalanceApiRow[] = [
    { type: "arinvoice", docno: "AD-26-06-06557", dueamount: "15,930.00" },
    { type: "downpayment", docno: "ACR653666-2S", docdate: "11/18/2025", amount: "-14,000.00", dueamount: "-7,000.68" },
    { type: "downpayment", docno: "ACR654326-2S", docdate: "11/27/2025", amount: "-42,000.00", dueamount: "-4,044.32" },
  ];
  const ledgerRows: LedgerApiRow[] = [
    { docdate: "11/18/2025", docno: "ACR653666-2S", doctype: "INCOMINGPAYMENT", credit: "14,000.00", refdocs: ["CM-A", "CM-SHARED"] },
    { docdate: "11/27/2025", docno: "ACR654326-2S", doctype: "INCOMINGPAYMENT", credit: "42,000.00", refdocs: ["CM-SHARED", "CM-B"] },
    { docdate: "11/19/2025", docno: "CM-A", doctype: "CREDITMEMO", credit: "7,000.68" },
    { docdate: "12/20/2025", docno: "CM-SHARED", doctype: "CREDITMEMO", credit: "14,430.00" },
    { docdate: "05/20/2026", docno: "CM-B", doctype: "CREDITMEMO", credit: "30,000.00", balance: "11,885.68" },
  ];
  const result = reconcileLane({
    feeRows: balanceRows.filter((r) => r.type === "arinvoice"),
    paymentCandidateRows: balanceRows.filter((r) => r.type === "downpayment"),
    ledgerRows,
    source: "ledger",
  });
  expect(result.derivedCredit).toBeCloseTo(4044.32, 2);
  expect(result.mode).toBe("subset");
  expect(result.displayed.map((r) => r.docno)).toEqual(["ACR654326-2S"]);
  expect(result.hidden.map((r) => r.docno)).toContain("ACR653666-2S");
});
```

---

## Non-issue confirmed (no change): float noise in `derivedCredit`

While auditing UO-00391's electricity lane we saw `derivedCredit = 0.819999999999709` vs `candidateSum = 0.82` (mode `"all"`). This is **fine** — plain IEEE-754 noise (~3e-13) from summing money as JS floats. Every comparison in `reconcileDownpaymentCandidates` uses `Math.abs(a - b) <= DEFAULT_TOLERANCE` (`0.01`), which absorbs sub-cent noise. No action needed; do not "fix" it. Only revisit money-as-float if amounts reach billions or exact equality is ever required (neither applies).

---

## Additional file inventory (changes 5–7)

### New files

```
src/app/api/ebt-inspector/route.ts
src/app/ebt-inspector/layout.tsx
src/app/ebt-inspector/page.tsx
```

### Modified files

```
src/components/TabNav.tsx                                  # add EBT Inspector tab
src/middleware.ts                                          # add ebt-inspector routes to auth matcher
src/lib/billing/floating-balance.ts                       # changes 6 + 7
src/app/server/services/resident-breakdown.service.ts     # change 6 (fee-row filters include arcreditmemo)
src/lib/billing/floating-balance.test.ts                  # regression tests for 6 + 7
```

### Unchanged but required

```
src/app/server/repositories/billing-breakdown.repo.ts     # EBT fetch methods reused by EBT Inspector
src/components/providers/QueryProvider.tsx                 # wraps EBT Inspector page
src/lib/schema/resident-breakdown.schema.ts               # DistrictSchema reused by EBT Inspector route
src/lib/utils/breakdown-date-utils.ts                     # parseApiDate reused by EBT Inspector route
```

---

## Port checklist (changes 5–7)

- [ ] **Change 6 + 7 (do together — same reconciliation path):**
  - [ ] `floating-balance.ts`: add `isArcreditmemo`; include it in `sumOutstandingFees`.
  - [ ] `floating-balance.ts`: add all-candidates `subsetSum` fallback (guarded ≤12) before the final `aggregate_only` in `reconcileDownpaymentCandidates`.
  - [ ] Service: outstanding-view fee-row filters (`duesFeeRows`, `electricityFeeRows`) include `arcreditmemo`. **This is the easy-to-miss step** — without it, the util fix does nothing in the running app.
  - [ ] Confirm display path (`normalizeBalanceRows`) still filters to `arinvoice` only, so arcreditmemo stays hidden from the resident.
  - [ ] Add both regression tests.
  - [ ] Verify live: **UO-00391 LR** Payments tab shows `ACR647020-2S` (~76,545); **UO-00432 LR** Payments tab shows `ACR654326-2S` (4,044.32) and hides `ACR653666-2S`; **UO-00803 LR** Payments tab shows `ACR695473-2S` (532.31) + `ACR697392-2S` (0.79) despite the positive 2023 arcreditmemo artifacts.

- [ ] **Change 5 (independent):**
  - [ ] Create the EBT Inspector route + page + layout; map the four query types to the superapp's EBT repository methods.
  - [ ] Add the tab and the two routes to the auth middleware matcher.
  - [ ] Confirm `xlsx` dependency present.
  - [ ] Verify: query `UO-00080` / `LR`, each of the four types renders a raw table and exports `.xlsx`.

- [ ] **Automated tests:**

```bash
npm run test:run -- src/lib/billing/floating-balance.test.ts
```

---

## Port notes (changes 5–7)

1. **Changes 6 and 7 are the same bug family** (wrong `aggregate_only`, everything hidden) with two independent triggers: an omitted `arcreditmemo` (overstates `derivedCredit`), and a shared credit memo (falsely exhausts a candidate). Apply both; each has its own regression test.
2. **The service pre-filter is the trap.** `sumOutstandingFees` alone looks correct in unit tests but is inert in the running app if the service strips `arcreditmemo` before rows reach it. Grep the superapp's outstanding-view block for the `arinvoice`-only fee-row filter and update it.
3. **Display is intentionally unchanged.** Resident never sees `arcreditmemo`; it only affects reconciliation math. Same spirit as Change 4.
4. **`derivedCredit` is the source of truth**, not the downpayment `dueamount` (which can be stale). Both fixes lean on that: net the fees correctly, then subset-sum to the trusted credit.
5. **Do not tighten the float tolerance.** See the non-issue note above.
6. **EBT Inspector must bypass normalization.** Its whole value is showing the *raw* EBT rows. Call the repository directly, not the normalizing service.

---
## Change 8: Balances tab + "Remaining Credit" collapsible (Jul 8, 2026)

### Problem

Uncredited (advance) payments lived in a separate **Payments** tab, fully expanded, disconnected from the outstanding fees they offset. Users had to switch tabs to see that a unit had unused advance credit against its balance. The **Fees** tab and **Payments** tab treated two halves of the same balance as unrelated screens.

### Decision

Merge the advance-payment data into the outstanding fees view and rename that tab **Balances**:

- Rename the **Fees** tab to **Balances**.
- Inside the same Outstanding Fees card, below the fee list, add a **collapsible** "Remaining Credit" section that renders the advance-payment rows (the data previously shown in the Payments tab as "Uncredited Payments").
- **Collapsed by default** — a single tappable summary row separated from the fee list by a top border. Left: title + muted caption `{count} payments · Tap to view`. Right: the remaining-credit total (green, accent) + a chevron that rotates 180° on open.
- **Expanded** — an inline table (pushes content down, not a modal): description column (no header, muted, wraps), `Original` and `Remaining` columns right-aligned. No row dividers; vertical padding only. The `Remaining` column's right edge lines up with the outstanding-fee amounts above it (shared `px-3` inset inside the same `-mx-2` container).
- Pure client-side expand/collapse — no data refetch on toggle.
- Remove the **See Past Fees** button (it becomes a future **History** tab — not implemented yet).
- **Payments** tab left unchanged for now (still renders `UncreditedPayments`).
- Fee-selection logic unchanged.

### Data

Same rows as before: `outstandingQuery.data.rows` filtered to `kind === "payment"` (`uncreditedPaymentRows`), passed into `OutstandingFees` as `creditRows`.

- description = `row.remarks`
- original = `row.paidAmount`
- remaining = `Math.abs(row.amount)`
- `remainingCredit` = `sum(Math.abs(row.amount))` over all credit rows — **computed, never hardcoded**.
- `count` = number of credit rows.

Money formatted via existing `formatCurrency` (`toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`).

### Example scenario

1. User views a unit with outstanding fees and 4 advance payments.
2. **Balances** tab: fee list, then a `Remaining Credit` row showing `665.59` (= 432.32 + 21.05 + 201.11 + 11.11) and `4 payments · Tap to view`.
3. Taps the row → chevron rotates, inline table reveals the 4 records with `Original` / `Remaining` columns; the `Remaining` edge aligns with the fee amounts above.
4. Taps again → collapses. No network request either way.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/OutstandingFees.tsx` | **Modify** — add `creditRows` prop + `RemainingCredit` collapsible sub-component; remove `onSeePast` / "See Past Fees" button |
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — rename tab to "Balances", pass `creditRows={uncreditedPaymentRows}`, drop fee `onSeePast` |

`UncreditedPayments.tsx` is untouched (still used by the Payments tab). Its `handleSeePast("payment")` wiring stays.

### Implementation

**`OutstandingFees.tsx`** — new prop, drop `onSeePast`:

```ts
type OutstandingFeesProps = {
  rows: ResidentBreakdownRow[];
  creditRows: ResidentBreakdownRow[]; // advance/uncredited payment rows
  // ...existing props, no onSeePast
};
```

Render below the fee list, inside the same `<section>`:

```tsx
{!isLoading && !isError && creditRows.length > 0 && (
  <RemainingCredit rows={creditRows} />
)}
```

`RemainingCredit` sub-component:

```tsx
function RemainingCredit({ rows }: { rows: ResidentBreakdownRow[] }) {
  const [open, setOpen] = useState(false);
  const remainingCredit = rows.reduce((sum, row) => sum + Math.abs(row.amount), 0);

  return (
    <div className="-mx-2 mt-3 border-t border-gray-200 pt-2">
      <button type="button" onClick={() => setOpen((c) => !c)}
        className="flex w-full items-center justify-between gap-4 px-3 py-3 text-left hover:bg-gray-50">
        <span>
          <span className="block text-sm font-bold">Remaining Credit</span>
          <span className="mt-0.5 block text-xs font-medium text-gray-400">
            {rows.length} payments · Tap to view
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-green-700">
            {formatCurrency(remainingCredit)}
          </span>
          <LuChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div>
          {/* header: no description header, Original + Remaining right-aligned */}
          <div className="grid grid-cols-[1fr_96px_96px] gap-2 px-3 pb-2 ...">
            <span />
            <span className="text-right">Original</span>
            <span className="text-right">Remaining</span>
          </div>
          {rows.map((row, index) => (
            <div key={`${row.source}-${row.docno}-${index}`}
              className="grid grid-cols-[1fr_96px_96px] items-start gap-2 px-3 py-3">
              <p className="... text-gray-400">{row.remarks || "No remarks"}</p>
              <p className="text-right ... text-gray-400">
                {row.paidAmount != null ? formatCurrency(row.paidAmount) : "-"}
              </p>
              <p className="text-right ...">{formatCurrency(Math.abs(row.amount))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Alignment note: both the fee-amount column and the credit table sit inside a `-mx-2` container with `px-3` rows, so the right edges coincide regardless of the fixed `96px` credit column widths.

**`ResidentBreakdownRequest.tsx`:**

```tsx
<TabButton selected={view === "fee"} onClick={() => setView("fee")}>
  Balances
</TabButton>

<OutstandingFees
  rows={filteredRows}
  creditRows={uncreditedPaymentRows}
  // ...existing props, no onSeePast
/>
```

No backend changes.

### Deferred (not in this change)

- ~~**History** tab (replaces the removed "See Past Fees" / "See Past Payments" buttons).~~ **Done — see Jul 8 changes below.**
- ~~Reworking / removing the standalone **Payments** tab.~~ **Done — Balances/Payments tabs removed; see Jul 8 changes below.**
- Credit rows are passed **unsorted**; the old Payments-tab block sorted by date. Add sorting here if finance wants chronological order.

---
---

# UI Overhaul: History page + SOA Breakdown layout changes (Jul 8, 2026)

Four frontend-only changes made together. No backend changes. These resolve the deferred items from earlier ("History tab" and "removing the standalone Payments tab").

## Summary (Jul 8)

| # | Change | Layer | Scope |
|---|--------|-------|-------|
| 8 | Unified History page with Fees/Payments tabs | UI (new route + component) | New `/soa-breakdown/history` route |
| 9 | Split + History icon buttons on SOA breakdown page | UI | `ResidentBreakdownRequest` header |
| 10 | CategoryPills moved inside OutstandingFees box | UI | `OutstandingFees` component |
| 11 | Remove Balances/Payments tab pills + UncreditedPayments section | UI | `ResidentBreakdownRequest` |

---

## Change 8: Unified History page with Fees/Payments tab switcher

### Problem

Fee History and Payment History were previously accessed via separate navigations (`/soa-breakdown/results?kind=fee` and `?kind=payment`). The `kind` was controlled by a URL search param, and the page title was generic "SOA History" with no tab UI for switching between the two.

### Decision

Create a single **History** page at `/soa-breakdown/history` with an internal **Fees / Payments** pill-tab switcher. The tab state is managed via `useState` (not URL params). Advanced options (custom date range, category pills for fees) are behind a collapsible "Advanced Options" section.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/ResidentBreakdownHistory.tsx` | **Create** |
| `src/app/soa-breakdown/history/page.tsx` | **Create** |
| `src/components/billing/breakdowns/ResidentBreakdownResults.tsx` | **Delete** (replaced) |
| `src/app/soa-breakdown/results/page.tsx` | **Delete** (replaced) |

### Implementation

**New `ResidentBreakdownHistory.tsx`** — replaces `ResidentBreakdownResults.tsx`. Full source of truth:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LuChevronLeft, LuSlidersHorizontal } from "react-icons/lu";
import { CategoryPills } from "@/components/billing/breakdowns/CategoryPills";
import {
  filterRowsByCategories,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";
import { PastFees } from "@/components/billing/breakdowns/PastFees";
import { PastPayments } from "@/components/billing/breakdowns/PastPayments";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";
import {
  dateFromMonthRange,
  dateFromRange,
} from "@/lib/utils/breakdown-date-utils";
import { formatCurrency } from "@/lib/utils/breakdown-format-utils";
import type {
  ResidentDateRange,
  ResidentLedgerResponse,
} from "@/lib/schema/resident-breakdown.schema";
```

Key architectural differences from the old `ResidentBreakdownResults`:

1. **Tab state is internal** (`useState<"fee" | "payment">("fee")`), not from `useSearchParams().get("kind")`.
2. **Advanced Options section** is collapsible (closed by default) with `LuSlidersHorizontal` icon toggle:
   - Fee tab: shows `CategoryPills` + custom month range picker + "Apply Custom Range" button.
   - Payment tab: shows only the custom month range picker (no CategoryPills).
3. **Header**: Back chevron (`LuChevronLeft`) linking to `/soa-breakdown` + "History" title. No close (X) button in this repo (that is two-serendra-superapp only).
4. **No info banner** in this repo (superapp-only feature).
5. **Tab switcher**: pill-in-track design — two buttons inside a `rounded-full bg-gray-100 p-1` container; active tab gets `bg-black text-white`.
6. Reuses `PastFees` and `PastPayments` components unchanged.
7. Reuses `fetchPastLedger`, `RANGE_OPTIONS`, `MONTH_OPTIONS`, `defaultMonthSelection`, `MonthYearSelect` — all moved from the deleted `ResidentBreakdownResults`.

**Tab switcher markup:**

```tsx
<div className="flex rounded-full bg-gray-100 p-1">
  <button
    type="button"
    onClick={() => setActiveTab("fee")}
    className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      activeTab === "fee"
        ? "bg-black text-white"
        : "text-gray-500 hover:text-gray-700"
    }`}
  >
    Fees
  </button>
  <button
    type="button"
    onClick={() => setActiveTab("payment")}
    className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      activeTab === "payment"
        ? "bg-black text-white"
        : "text-gray-500 hover:text-gray-700"
    }`}
  >
    Payments
  </button>
</div>
```

**Advanced Options (collapsible) markup:**

```tsx
<section>
  <button
    type="button"
    onClick={() => setAdvancedOpen((c) => !c)}
    className="flex w-full items-center justify-between"
  >
    <span className="text-sm font-bold text-gray-700">
      Advanced Options
    </span>
    <LuSlidersHorizontal
      className={`text-lg text-gray-400 transition-transform ${
        advancedOpen ? "rotate-90" : ""
      }`}
    />
  </button>

  {advancedOpen && (
    <div className="mt-4 space-y-4 border border-gray-200 bg-gray-50 p-4">
      {/* CategoryPills only on fee tab */}
      {!isPayment && (
        <CategoryPills
          selectedCategories={selectedCategories}
          onChange={setSelectedCategories}
        />
      )}
      {/* Custom month range picker (both tabs) */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
          Custom Range
        </h3>
        {/* MonthYearSelect Start + End + Apply button — same as old ResidentBreakdownResults */}
      </div>
    </div>
  )}
</section>
```

**New route page** (`src/app/soa-breakdown/history/page.tsx`):

```tsx
"use client";

import { Suspense } from "react";
import TabNav from "@/components/TabNav";
import { ResidentBreakdownHistory } from "@/components/billing/breakdowns/ResidentBreakdownHistory";
import { SoaBreakdownCredentialsForm } from "@/components/billing/breakdowns/SoaBreakdownCredentialsForm";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";

export default function SoaBreakdownHistoryPage() {
  const { showBreakdown } = useSoaBreakdownCredentials();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <TabNav />
      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">SOA History</h1>
      </header>
      <div className="space-y-8">
        <SoaBreakdownCredentialsForm />
        {showBreakdown && (
          <Suspense
            fallback={<p className="text-sm text-gray-500">Loading history...</p>}
          >
            <ResidentBreakdownHistory />
          </Suspense>
        )}
      </div>
    </main>
  );
}
```

Uses the existing `SoaBreakdownCredentialProvider` from the parent layout (`/soa-breakdown/layout.tsx`, unchanged).

### Deleted files

- `src/components/billing/breakdowns/ResidentBreakdownResults.tsx` — fully replaced by `ResidentBreakdownHistory.tsx`.
- `src/app/soa-breakdown/results/page.tsx` — route replaced by `/soa-breakdown/history/page.tsx`.

### Route change

| Old route | New route |
|-----------|-----------|
| `/soa-breakdown/results?kind=fee` | `/soa-breakdown/history` (Fees tab active by default) |
| `/soa-breakdown/results?kind=payment` | `/soa-breakdown/history` (switch to Payments tab) |

**For two-serendra-superapp:** the superapp should also add:
- A **dismissible info banner** at the top of the History page: "Transactions may take some time to properly reflect in the system. For questions, please contact or visit the Finance Office for details." with an X close button. Use `useState(true)` for visibility.
- A **close (X) button** in the header (top-right), navigating back to the breakdown/home screen.

---

## Change 9: Split + History icon buttons on SOA Breakdown main page

### Problem

Previously, the SOA breakdown page header had a single button: "Show Split" / "Hide Split" (with `LuReceiptText` icon and text label). There was no direct way to access the History page from the main breakdown screen — users had to navigate via "See Past Fees" or "See Past Payments" links buried in the Payments tab and OutstandingFees section.

### Decision

Replace the single button with **two elements**, right-aligned to the balance amount:

- **Chevron icon** (`LuChevronDown`) — toggles the balance split panel (existing behavior). Grouped beside the balance amount. The chevron rotates (`rotate-180`) when the split is open. `aria-label="Split"`.
- **History link** — a text link saying "History", placed on the far right.

The Split chevron is `text-xl` size with no text label. Both elements use `text-green-700 hover:text-green-900`.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** |

### Implementation

**Imports changed:**

```diff
-import { useRouter } from "next/navigation";
-import { LuReceiptText } from "react-icons/lu";
+import Link from "next/link";
+import { LuChevronDown } from "react-icons/lu";
```

**Removed:** `useRouter` import, `handleSeePast` function, `BreakdownView` type.

**Button markup** (replaces old single button):

```tsx
{/* Note: the wrapper div has items-center to align everything with the balance */}
<div className="mt-2 flex items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    {outstandingQuery.isLoading ? (
      <div className="h-11 w-40 animate-pulse bg-gray-100" />
    ) : (
      <p className="text-4xl font-bold leading-none text-green-700">
        ₱ {formatBalanceDisplay(meta?.balance)}
      </p>
    )}
    {!outstandingQuery.isLoading && !outstandingQuery.isError && (
      <button
        type="button"
        onClick={() => setShowDetails((current) => !current)}
        className="text-green-700 hover:text-green-900"
        aria-label="Split"
      >
        <LuChevronDown
          className={`text-xl transition-transform ${
            showDetails ? "rotate-180" : ""
          }`}
        />
      </button>
    )}
  </div>
  {!outstandingQuery.isLoading && !outstandingQuery.isError && (
    <Link
      href="/soa-breakdown/history"
      className="mr-[21px] text-sm font-semibold text-green-700 hover:text-green-900"
    >
      History
    </Link>
  )}
</div>
```

---

## Change 10: CategoryPills moved inside OutstandingFees box

### Problem

CategoryPills was rendered **outside** the OutstandingFees card, between the old tab pills and the fees list. This was a layout artifact from having Balances/Payments tabs.

### Decision

Move CategoryPills **inside** the OutstandingFees card, rendered directly below the "Outstanding Fees" heading and the "Select All" button. This matches the screenshot design where categories are contextually grouped with the fees they filter.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/OutstandingFees.tsx` | **Modify** — add category props, import and render `CategoryPills` inside the card |
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — remove standalone `<CategoryPills>` render, pass category props to `<OutstandingFees>` |

### Implementation

**`OutstandingFees.tsx`** — new imports and props:

```tsx
import { CategoryPills } from "@/components/billing/breakdowns/CategoryPills";
import type { FeeCategoryId } from "@/lib/utils/fee-categories";

type OutstandingFeesProps = {
  rows: ResidentBreakdownRow[];
  creditRows: ResidentBreakdownRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedRowIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleSelectAll: () => void;
  selectedCategories: Set<FeeCategoryId>;        // NEW
  onCategoryChange: (next: Set<FeeCategoryId>) => void;  // NEW
};
```

CategoryPills rendered inside the `<section>`, after the heading div, before the row list:

```tsx
<div className="mb-4">
  <CategoryPills
    selectedCategories={selectedCategories}
    onChange={onCategoryChange}
  />
</div>
```

**`ResidentBreakdownRequest.tsx`** — removed standalone `<CategoryPills>` block and the `CategoryPills` import. Now passes the props through to `<OutstandingFees>`:

```tsx
<OutstandingFees
  rows={filteredRows}
  creditRows={uncreditedPaymentRows}
  isLoading={outstandingQuery.isLoading}
  isError={outstandingQuery.isError}
  onRetry={() => outstandingQuery.refetch()}
  selectedRowIds={selectedRowIds}
  onToggleRow={toggleRow}
  onToggleSelectAll={toggleSelectAll}
  selectedCategories={selectedCategories}
  onCategoryChange={setSelectedCategories}
/>
```

---

## Change 11: Remove Balances/Payments tab pills + UncreditedPayments section

### Problem

The SOA breakdown main page had `Balances | Payments` tab pills that toggled between the OutstandingFees view and UncreditedPayments view. With the History button now providing access to full payment history, and the Remaining Credit section inside OutstandingFees already showing uncredited/advance payments inline, the separate UncreditedPayments section and the tab pills are redundant.

### Decision

1. **Remove** the `Balances | Payments` tab pill buttons entirely.
2. **Remove** the `<UncreditedPayments>` section from the main breakdown page.
3. **Remove** the `UncreditedPayments` import from `ResidentBreakdownRequest`.
4. Show `<OutstandingFees>` **always** (no conditional rendering based on tab state).
5. Show the "Select Fees" button **always** (no `view === "fee"` guard).
6. **Remove** the `view` state variable (`useState<BreakdownView>`) and `BreakdownView` type.
7. **Remove** the `TabButton` local component.

### Files affected

| File | Action |
|------|--------|
| `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` | **Modify** — remove tabs, UncreditedPayments, view state, TabButton |
| `src/components/billing/breakdowns/UncreditedPayments.tsx` | **No longer imported** from the main page (file still exists for potential future use) |

### Implementation

**Removed from `ResidentBreakdownRequest.tsx`:**

```diff
-import { UncreditedPayments } from "@/components/billing/breakdowns/UncreditedPayments";

-type BreakdownView = "fee" | "payment";

-const [view, setView] = useState<BreakdownView>("fee");

-<div className="grid grid-cols-2 gap-3">
-  <TabButton selected={view === "fee"} onClick={() => setView("fee")}>
-    Balances
-  </TabButton>
-  <TabButton
-    selected={view === "payment"}
-    onClick={() => setView("payment")}
-  >
-    Payments
-  </TabButton>
-</div>

-{view === "fee" && ( <CategoryPills ... /> )}

-{view === "fee" ? ( <OutstandingFees ... /> ) : ( <UncreditedPayments ... /> )}

-{view === "fee" && ( <button>Select Fees</button> )}

-function TabButton({ ... }) { ... }
```

**Replaced with** (flat, no tabs):

```tsx
<OutstandingFees
  rows={filteredRows}
  creditRows={uncreditedPaymentRows}
  isLoading={outstandingQuery.isLoading}
  isError={outstandingQuery.isError}
  onRetry={() => outstandingQuery.refetch()}
  selectedRowIds={selectedRowIds}
  onToggleRow={toggleRow}
  onToggleSelectAll={toggleSelectAll}
  selectedCategories={selectedCategories}
  onCategoryChange={setSelectedCategories}
/>

<button
  type="button"
  disabled={selectedRowIds.size === 0}
  className={`w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
    selectedRowIds.size > 0
      ? "bg-green-700 text-white hover:bg-green-800"
      : "cursor-not-allowed bg-gray-100 text-gray-300"
  }`}
>
  {selectedRowIds.size > 0
    ? `Selected ₱${formatCurrency(selectedSum)}`
    : "Select Fees"}
</button>
```

Note: `uncreditedPaymentRows` is still computed and passed as `creditRows` to `OutstandingFees` — the **Remaining Credit** collapsible section inside `OutstandingFees` uses these rows. The standalone `UncreditedPayments` section was the only thing removed.

### UncreditedPayments.tsx — previous changes to note

In an earlier step during this session, `UncreditedPayments.tsx` was also modified to **remove the `onSeePast` prop** and the "See Past Payments" button. The current state of this file:

- `onSeePast` prop: **removed**
- "See Past Payments" button: **removed**
- Header simplified to just title + subtitle (no action button)
- File still exists but is **no longer imported** by `ResidentBreakdownRequest`

---

## Complete file inventory (Jul 8 changes)

### New files

```
src/components/billing/breakdowns/ResidentBreakdownHistory.tsx
src/app/soa-breakdown/history/page.tsx
```

### Deleted files

```
src/components/billing/breakdowns/ResidentBreakdownResults.tsx
src/app/soa-breakdown/results/page.tsx
```

### Modified files

```
src/components/billing/breakdowns/ResidentBreakdownRequest.tsx
src/components/billing/breakdowns/OutstandingFees.tsx
src/components/billing/breakdowns/UncreditedPayments.tsx
```

### Unchanged but required by these changes

```
src/components/billing/breakdowns/CategoryPills.tsx          — unchanged, now rendered by OutstandingFees instead of ResidentBreakdownRequest
src/components/billing/breakdowns/PastFees.tsx               — unchanged, used by ResidentBreakdownHistory
src/components/billing/breakdowns/PastPayments.tsx           — unchanged, used by ResidentBreakdownHistory
src/components/billing/breakdowns/InspectedUnitLabel.tsx     — unchanged
src/components/billing/breakdowns/SoaBreakdownCredentialsForm.tsx — unchanged
src/components/providers/SoaBreakdownCredentialProvider.tsx   — unchanged
src/app/soa-breakdown/layout.tsx                             — unchanged (provides QueryProvider + SoaBreakdownCredentialProvider)
src/lib/utils/fee-categories.ts                              — unchanged
src/lib/utils/breakdown-date-utils.ts                        — unchanged (dateFromRange, dateFromMonthRange)
src/lib/utils/breakdown-format-utils.ts                      — unchanged (formatCurrency, formatCompactMonthYearRangeLabel, etc.)
src/lib/schema/resident-breakdown.schema.ts                  — unchanged (ResidentDateRange, ResidentLedgerResponse types)
```

---

## Port checklist for two-serendra-superapp (Jul 8 changes)

All changes are frontend-only. No API or backend changes.

- [ ] **1. Delete old history/results route and component**
  - [ ] Delete the superapp equivalent of `ResidentBreakdownResults.tsx`
  - [ ] Delete the superapp equivalent of `/soa-breakdown/results/page.tsx`

- [ ] **2. Create new History component**
  - [ ] Create `ResidentBreakdownHistory.tsx` with:
    - [ ] Internal Fees/Payments tab state (not URL params)
    - [ ] Pill-in-track tab switcher
    - [ ] Collapsible Advanced Options (with `LuSlidersHorizontal` icon)
    - [ ] CategoryPills inside Advanced Options for fee tab only
    - [ ] Custom month range picker for both tabs
    - [ ] Period pills (1 Month, 3 Months, 6 Months, This Year)
    - [ ] Total display (₱ green bold)
    - [ ] Back chevron header
  - [ ] **Superapp-only additions:**
    - [ ] Add **close (X) button** in header (top-right)
    - [ ] Add **dismissible info banner** below header

- [ ] **3. Create new History page route**
  - [ ] Create `/soa-breakdown/history/page.tsx`
  - [ ] Ensure parent layout provides credential + query providers

- [ ] **4. Update SOA Breakdown main page**
  - [ ] Add `LuChevronDown` icon next to balance — toggles split panel and rotates (`rotate-180`) when open.
  - [ ] Add "History" text link next to it, aligned to the right. Both should use `text-sm text-green-700 hover:text-green-900`.
  - [ ] Remove `Balances | Payments` tab pills and `TabButton` component
  - [ ] Remove `UncreditedPayments` import and section (Remaining Credit in OutstandingFees covers it)
  - [ ] Remove `view` state and `BreakdownView` type
  - [ ] Remove `handleSeePast` / `onSeePast` plumbing

- [ ] **5. Move CategoryPills into OutstandingFees**
  - [ ] Add `selectedCategories` and `onCategoryChange` props to `OutstandingFees`
  - [ ] Import and render `CategoryPills` inside the OutstandingFees card, after the heading
  - [ ] Remove standalone `<CategoryPills>` from parent

- [ ] **6. Update UncreditedPayments** (if still used elsewhere)
  - [ ] Remove `onSeePast` prop
  - [ ] Remove "See Past Payments" button
  - [ ] Simplify header

- [ ] **7. Update any links/references**
  - [ ] Search for `/soa-breakdown/results` and replace with `/soa-breakdown/history`
  - [ ] Search for `ResidentBreakdownResults` and replace with `ResidentBreakdownHistory`

- [ ] **8. Icon dependencies**
  - [ ] Ensure `react-icons` includes `LuChevronDown`, `LuChevronLeft`, `LuSlidersHorizontal` (all from `react-icons/lu`)

- [ ] **9. Manual verification**
  - [ ] SOA breakdown page: Split chevron (`LuChevronDown`) and History text link show on same line, right-aligned to balance.
  - [ ] Click Split → balance split panel toggles
  - [ ] Click History → navigates to `/soa-breakdown/history`
  - [ ] History page: Fees tab active by default, shows total fees, period pills, settled fees list
  - [ ] Switch to Payments tab: total changes, categories disappear from advanced options, past payments list shows
  - [ ] Advanced Options toggle works, CategoryPills only on fee tab
  - [ ] Custom date range works for both tabs
  - [ ] Back chevron returns to `/soa-breakdown`
  - [ ] CategoryPills appear inside OutstandingFees box on main page
  - [ ] No UncreditedPayments section on main page
  - [ ] Remaining Credit section inside OutstandingFees still works
  - [ ] Select Fees button always visible (not gated by tab)

---

## Port notes (Jul 8 changes)

1. **Route rename is the main breaking change.** Any deep links, bookmarks, or navigation calls using `/soa-breakdown/results` must update to `/soa-breakdown/history`. The `?kind=fee|payment` query param is no longer used.
2. **`UncreditedPayments.tsx` still exists** in the codebase. It is not deleted, just no longer imported on the main page. If the superapp uses it elsewhere, leave it; otherwise it can be deleted.
3. **CategoryPills is now a child of OutstandingFees**, not a sibling. Category state is still managed by the parent (`ResidentBreakdownRequest`) and passed down — the OutstandingFees component does not own it.
4. **Two-serendra-superapp must add two things this repo intentionally omits:** the dismissible info banner and the close (X) button on the History page.
5. **All data-fetching patterns are unchanged.** Same `fetchPastLedger`, same `useQuery` keys, same API endpoints. The History component just manages the `kind` internally instead of reading from URL params.

---

## Reference: finance-automations source of truth (Jul 8, 2026)

Compare these files directly when porting:

- `src/components/billing/breakdowns/ResidentBreakdownHistory.tsx` (NEW — replaces ResidentBreakdownResults)
- `src/app/soa-breakdown/history/page.tsx` (NEW — replaces results/page.tsx)
- `src/components/billing/breakdowns/ResidentBreakdownRequest.tsx` (MODIFIED)
- `src/components/billing/breakdowns/OutstandingFees.tsx` (MODIFIED)
- `src/components/billing/breakdowns/UncreditedPayments.tsx` (MODIFIED — onSeePast removed)
