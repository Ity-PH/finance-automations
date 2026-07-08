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
---

# OPEN BUG (not yet fixed): unallocatable floating credit shows nothing

**Status:** unresolved — needs a finance-team decision before coding. Documented Jul 6, 2026 for discussion. This is **not** the same as Changes 6 and 7 (those had a clean answer once inputs were corrected; this one has no clean per-row answer at all).

**One-line symptom:** a unit that genuinely holds unapplied advance credit shows **"No uncredited payments"** because the credit cannot be matched to any subset of the EBT's downpayment rows.

## The reference unit: UO-00934 LR

### What the app shows

- Outstanding Balance: **(₱4,081.77)** — i.e. the account is **in credit** (Dues & Others −4,081.77; Electricity 0.00).
- Payments tab → **Uncredited Payments: "No uncredited payments."** ← the bug. The advance is real and should be listed.

### Raw EBT balance table

| type | docno | dueamount | remarks |
|------|-------|-----------|---------|
| arinvoice | OT-24-04-00009 | 939.37 | Adjustment to ACR0564114 |
| downpayment | ACR0534441 | −3,217.60 | Water Advance Payment (O) |
| downpayment | ACR0544409 | −3,899.00 | Water advance Payment (O) |
| downpayment | ACR0621965 | −2,134.42 | Water Advance payment (O) |
| downpayment | ACR654632-2S | −200.00 | water adv payment |
| downpayment | ACR573509-F | −699.90 | 12/2025 Association Dues - 12/2025 Equity Contribution - PDC |

Downpayment "remaining" per EBT sums to **₱10,150.92**.

### Reconciliation inputs (dues lane)

```
sumOutstandingFees = 939.37            // the one open arinvoice (the adjustment)
ledgerFinalBalance = -4,081.77         // account is in credit
derivedCredit      = max(0, 939.37 - (-4,081.77)) = 5,021.14   // TRUSTED floating credit
candidateSum       = 10,150.92         // EBT downpayment remainings (STALE, overstated)
```

`candidateSum (10,150.92) > derivedCredit (5,021.14)` → reconcile enters the subset/exhausted branch, finds no matching subset, and returns `mode: "aggregate_only"` → **displays nothing**.

## Finding 1 — the open "fee" is a payment reversal, not a charge

`OT-24-04-00009` ("Adjustment to ACR0564114") reverses a real payment:

- 03/05/2024 — `ACR0564114` INCOMINGPAYMENT **credit ₱939.37** (payment received).
- 04/01/2024 — `OT-24-04-00009` ARINVOICE **debit ₱939.37** ("Adjustment to ACR0564114").

Net effect zero; the 939.37 payment was clawed back (bounced / misapplied / wrong unit). No `refdocs`, never re-settled — so it lingers as an open item. Change 4 correctly hides it from the fee **display** (remarks match `/\badjustments?\b/i`), but `sumOutstandingFees` still counts it.

## Finding 2 — ignoring the adjustment does NOT change the answer

The adjustment is a wash; removing it consistently leaves `derivedCredit` identical:

| Treatment | open fees | ledger balance | derivedCredit |
|---|---|---|---|
| Keep adjustment | 939.37 | −4,081.77 | **5,021.14** |
| Remove it from **both** sides | 0 | −5,021.14 | **5,021.14** |

The −4,081.77 balance already includes the +939.37 debit, so you cannot drop it from fees only (that double-counts). Done consistently, `derivedCredit` stays **5,021.14**. **The adjustment is a red herring for the amount — it is not why nothing shows.**

### Finding 2b — empirical test: excluding ADJUSTMENT rows does NOT surface the advances

Finance (interview) proposed that any arinvoice whose remarks match `/\badjustments?\b/i` should be dropped from the reconciliation, on the theory it is corrupting the math. Tested against **live** UO-00934 LR data by replaying the exact algorithm three ways:

| Treatment | sumFees | ledgerBal | derivedCredit | candidateSum | mode | displayed |
|---|---|---|---|---|---|---|
| Current (adjustment counted) | 939.37 | −4,081.77 | 5,021.14 | 10,150.92 | `aggregate_only` | **nothing** |
| Drop adjustment from fees only | 0 | −4,081.77 | 4,081.77 | 10,150.92 | `aggregate_only` | **nothing** |
| Drop adjustment from both sides | 0 | −5,021.14 | 5,021.14 | 10,150.92 | `aggregate_only` | **nothing** |

**Result: no change in outcome.** Only **one** adjustment row exists in the entire 219-row ledger (the same `OT-24-04-00009`, debit 939.37), so excluding it can move `derivedCredit` by at most 939.37. But `candidateSum` (10,150.92) sits **~5,130–6,070 above** `derivedCredit` in every treatment, so `candidateSum > derivedCredit` always routes to `aggregate_only` and displays nothing. The adjustment exclusion is confirmed a **dead end** for this bug — it changes the figure slightly but not the hide.

**Corollary (per-row ledger truth is broken by shared credit memos).** Enriching each downpayment against the ledger shows the credit memos are over-counted — `CM-25-12-14655` is charged against **three** different advances, `CM-25-10-12459` against two — so the ledger declares every advance *except* the ₱200 (`ACR654632-2S`) fully exhausted, while the account net balance is still **−4,081.77 in credit**:

| downpayment | EBT says unapplied | ledger paymentNet | credit-memos charged | ledger verdict |
|---|---|---|---|---|
| ACR0534441 | 3,217.60 | 4,000.00 | 10,133.57 | exhausted |
| ACR0544409 | 3,899.00 | 4,000.00 | 8,543.73 | exhausted |
| ACR0621965 | 2,134.42 | 2,134.42 | 4,808.78 | exhausted |
| ACR654632-2S | 200.00 | 200.00 | 0.00 | **floating 200** |
| ACR573509-F | 699.90 | 16,437.50 | 16,437.50 | exhausted |

The real credit (₱4,081.77) exists at the account level but cannot be pinned to any specific ACR — the shared-CM over-count destroys per-row attribution. This is why neither "trust EBT" (overstates, 10,150.92) nor "trust ledger per-row" (understates, 200) is correct, and only the **aggregate synthetic row** (solution 1) surfaces the right number.

## Finding 3 — the real blocker: EBT downpayment remainings are stale and unreconcilable

- EBT claims **10,150.92** remaining across the 5 downpayments.
- Ledger-true floating credit is **5,021.14** gross (or **4,081.77** net — the displayed credit balance).
- EBT overstates by ~**5,130**.
- **No subset** of `{3,217.60, 3,899.00, 2,134.42, 200.00, 699.90}` sums to 5,021.14 (brute-forced; closest 4,798.90) **or** to 4,081.77 (closest 4,099.00).

So even a perfect subset algorithm cannot reconcile — the inputs themselves are wrong.

## Finding 4 — per-row true remaining cannot be reconstructed from the ledger

Attempted to recompute each downpayment's real remaining by allocating credit-memo shares. The ledger does not attribute cleanly:

- Credit memos are **shared** across multiple payments (same defect family as Change 7).
- Some CMs have a blank `refno`; some rows appear duplicated.
- Both "full attribution" and "even split" produce nonsense (negative remainings):

| downpayment | paid | CM full | rem (full) | rem (split) |
|---|---|---|---|---|
| ACR0534441 | 4,000.00 | 10,133.57 | −6,133.57 | −1,894.11 |
| ACR0544409 | 4,000.00 | 8,543.73 | −4,543.73 | −1,697.64 |
| ACR0621965 | 2,134.42 | 4,808.78 | −2,674.36 | −269.97 |
| ACR654632-2S | 200.00 | 0.00 | 200.00 | 200.00 |
| ACR573509-F | 16,437.50 | 16,437.50 | 0.00 | 8,218.75 |

**Conclusion:** which specific advance holds the ₱5,021.14 cannot be determined from this data. Only the **aggregate** is trustworthy.

## Why this is different from Changes 6 and 7

- **Change 6** (arcreditmemo) and **Change 7** (shared-CM false-exhaustion) both had a *correct, itemizable* answer once the reconciliation inputs were fixed — a specific downpayment (or subset) legitimately matched `derivedCredit`.
- **This bug** has **no** itemizable answer. `derivedCredit` is known and correct, but no subset of the (stale) downpayment rows reproduces it, and the ledger cannot be used to derive per-row truth. The reconciler's "if I can't itemize precisely, show nothing" policy then hides real credit.

This is a **design limitation of `aggregate_only` mode**, exposed whenever EBT's downpayment tracking drifts far from the ledger. Changes 6/7 narrowed how often we land in `aggregate_only`; they did not change what `aggregate_only` *displays* (still nothing).

## Potential solutions (for finance discussion)

Ordered by current preference. All only affect the `aggregate_only` case; `"all"` and `"subset"` behavior is unchanged.

1. **Aggregate synthetic row (recommended).** When `mode === "aggregate_only"` and `derivedCredit > 0`, display one line — e.g. "Unapplied advance (unallocated)" — for the aggregate amount, with no specific `docno`.
   - **Amount decision (needs finance):** show **net ₱4,081.77** (reconciles with the headline credit balance the resident already sees; the hidden 939.37 reversal is netted out) **or gross ₱5,021.14** (total advance before offsetting the hidden reversal). Recommendation: **net**, for headline consistency.
   - **Pros:** always surfaces the real credit; no fabricated per-payment split; matches the mode's own name.
   - **Cons:** not itemized (can't point to a specific ACR); needs a UI row that tolerates a missing docno.

2. **Greedy itemize with a partial last row.** Show newest/closest downpayments accumulating up to `derivedCredit`, trimming the final row partially.
   - **Pros:** looks itemized.
   - **Cons:** the per-row amounts are *invented* (don't match EBT), and picking "which rows" is arbitrary given the data — risk of misleading finance into thinking a specific ACR is/ isn't consumed.

3. **Trust EBT downpayment `dueamount` as-is.** Abandon the reconcile-hiding; list all downpayment rows at their EBT remaining (sum 10,150.92).
   - **Pros:** dead simple; matches what finance sees in SAP's payment screen.
   - **Cons:** **overstates** by ~5,130 here; re-introduces exactly the stale-credit display the reconciler was built to suppress. Would regress other units.

4. **Leave as-is (status quo).** Keep showing "No uncredited payments" when unallocatable.
   - **Pros:** no risk of showing a wrong itemization.
   - **Cons:** hides real credit; this is the reported complaint.

## Open questions for the finance team

1. When an advance cannot be tied to a specific charge, do they want to see the **aggregate unapplied credit**, or is "no uncredited payments" acceptable in that case?
2. For the aggregate, which figure is the "right" one operationally: **net (4,081.77, matches the credit balance)** or **gross (5,021.14, total advance)**?
3. **Root-data question:** why does EBT still report ₱10,150.92 of downpayment remaining when the ledger shows only ~5,021 in credit? Are the old 2023 water advances (`ACR0534441`, `ACR0544409`) genuinely still open, or is EBT's downpayment tracking stale? If EBT can be corrected at source, this bug largely disappears.
4. Is the reversed payment `ACR0564114` / `OT-24-04-00009` a real ₱939.37 the resident still owes, or leftover noise that should be written off? This decides net vs gross.

## Reproduction

```
EBT Inspector → UO-00934 / LR → Balance        (see the 1 arinvoice + 5 downpayments)
EBT Inspector → UO-00934 / LR → Ledger         (trace OT-24-04-00009, ACR0564114, and each ACR)
SOA Breakdown → UO-00934 / LR → Payments tab   (observe "No uncredited payments")
```

---

## Second reproduction case: UO-01166 LR

Same *symptom* as UO-00934 (`aggregate_only` → nothing shown), but the **root cause is different and, crucially, fixable at source**. This is **not** a reconciliation-design limitation. A resident's installment check bounced, was re-entered under a new docno, but the bounced credit was **never reversed in the ledger** — so the ledger running balance double-counts one installment. That inflates `derivedCredit` by exactly one installment (3,930.57) above the resident's true floating credit, which is why no whole-candidate subset can match. Correct the bounced-check entry upstream and the account reconciles perfectly with the standard subset method — **no app change needed**.

### What the app shows

- Outstanding Balance **₱29,413.98** (Dues & Others 28,954.82 + Electricity 459.16).
- Outstanding Fees list: WA-25-08-07299 (46,463.76), AD-26-06-07289 (12,312.50), EC-26-06-07282 (985.00), SU-26-06-01681 (200.00), WA-26-06-05151 (438.12), EL-26-06-07385 (459.16). The two OT adjustment invoices are correctly hidden.
- Payments tab: **nothing** — the seven "Water July 2025 Nth Installment" advance payments do not appear.

### Raw EBT balance table (dues lane)

| type | docno | dueamount | remarks |
|---|---|---|---|
| arinvoice | WA-25-08-07299 | 46,463.76 | Water Jul 2025 |
| arinvoice | OT-25-11-01291 | 3,930.57 | ADJUSTMENT FOR JANUARY 2026 SOA (BC) |
| arinvoice | OT-26-02-00013 | 3,930.57 | Adjustment April 2026 SOA |
| arinvoice | AD-26-06-07289 | 12,312.50 | 07/2026 Assoc Dues |
| arinvoice | EC-26-06-07282 | 985.00 | 07/2026 Equity |
| arinvoice | SU-26-06-01681 | 200.00 | Vehicle RF Tag |
| arinvoice | WA-26-06-05151 | 438.12 | Water May 2026 |
| arcreditmemo | ARCM-25-11-03105 | −3,930.57 | ADJUSTMENT FOR JANUARY 2026 SOA (BC) |
| arcreditmemo | ARCM-26-02-00067 | −3,930.57 | Adjustment April 2026 SOA |
| downpayment | ACR0548519 | −11,323.63 | ASSOC DUES OCT'23 … & OVER (12/05/2023) |
| downpayment | ACR646169-2SWA | −3,930.57 | Water July 2025 1st Installment |
| downpayment | ACR647920-2S | −3,930.57 | Water July 2025 2nd Installment |
| downpayment | ACR674726-2S | −3,930.57 | Water July 2025 3rd Installment |
| downpayment | ACR680488-2S | −3,930.57 | Water July 2025 4th Installment |
| downpayment | ACR688562-2S | −3,930.57 | Water July 2025 5th Installment |
| downpayment | ACR693354-2S | −3,930.57 | Water July 2025 6th Installment |
| downpayment | ACR699584-2S | −3,930.57 | Water July 2025 7th Installment |

### Reconciliation inputs (dues lane)

```
sumOutstandingFees = arinvoice(68,260.52) + negative arcreditmemo(−7,861.14) = 60,399.38
                     (the two OT adjustments +7,861.14 net exactly against the two ARCM −7,861.14)
ledgerFinalBalance = 28,954.82        (last ledger running balance — INFLATED by a bounced credit, see below)
derivedCredit      = 60,399.38 − 28,954.82 = 31,444.56   ← overstated by exactly one installment

candidateSum       = 11,323.63 + 7 × 3,930.57 = 38,837.62
```

`derivedCredit` here is **wrong**, and predictably so: `31,444.56 = 8 × 3,930.57`, i.e. **eight** installments of floating credit — but the resident has only paid **seven**. The extra installment is the bounced check `ACR646169-2S`, whose credit is still sitting in the ledger running balance (see next section). The resident's *true* floating credit is `7 × 3,930.57 = 27,513.99`.

`candidateSum (38,837.62) > derivedCredit (31,444.56)` → enters subset search over `{11,323.63, and seven of 3,930.57}`. No whole subset sums to the (overstated) 31,444.56: installments-only needs k = 8.0 but only 7 exist; `11,323.63 + 3,930.57·k = 31,444.56` gives k = 5.119 (non-integer). `subsetSum` null → greedy null → full-candidate `subsetSum` null → `aggregate_only` → `displayed: []`. **Nothing shown — because the target it was searching for was inflated by a bounced payment.**

### Ledger evidence — what EBT got wrong

Pulled `past-ledger` UO-01166 / LR (01/01/2023 → 07/07/2026):

**1. ACR0548519 is a phantom — fully consumed in 2023–2024, yet EBT still reports 11,323.63 remaining.**

```
12/05/2023  ACR0548519  INCOMINGPAYMENT  credit 11,405.39   refdocs: 548519, ACR0559139
12/05/2023  548519      CREDITMEMO       debit=credit 11,323.63  refdocs: WA-23-08-05019, AD-23-09-09619, WA-23-09-05464, ACR0548519
02/20/2024  ACR0559139  INCOMINGPAYMENT  debit 81.76 …          refdocs: …, ACR0548519
```

CM 548519 allocated 11,323.63 of the payment to 2023 invoices; the remaining 81.76 was drawn by ACR0559139. Payment 11,405.39 = 11,323.63 + 81.76 → **fully consumed**. EBT's downpayment `dueamount` of 11,323.63 is 100% stale.

**2. THE ROOT CAUSE — a bounced check was double-credited in the ledger and never reversed.**

The resident's 1st installment check bounced. Finance re-entered it under a new docno (`…-2SWA`) with the corrected check details — necessary because docnos can't be reused. But the **original bounced credit was never reversed with an offsetting debit**, so the ledger now carries the 1st installment as **two** credits:

```
row 115  12/15/2025  ACR646169-2S    INCOMINGPAYMENT  credit 3,930.57  bal 43,853.72  ← bounced check, NOT reversed
row 116  12/15/2025  ACR646169-2SWA  INCOMINGPAYMENT  credit 3,930.57  bal 39,923.15  ← the real re-entered payment
```

Both credits reduce the running balance. There is **no** debit anywhere in the ledger that claws back the bounced `ACR646169-2S`. (The two "(BC)" adjustment pairs — `OT-25-11-01291` debit + `ARCM-25-11-03105` credit, and the Feb 2026 pair — each net to **zero** on the running balance; they do **not** reverse the bounced payment.)

Net effect: the ledger running balance (28,954.82) is **3,930.57 too low** — it credits one installment twice. That flows straight into `derivedCredit = 60,399.38 − 28,954.82 = 31,444.56`, overstating the true floating credit by exactly one installment.

Correctly, the EBT downpayment list carries only the **seven real** installments (`-2SWA` = 1st … 7th); the bounced `ACR646169-2S` is *not* listed as a downpayment. So the candidate side is right (7 installments = 27,513.99) and the ledger-derived side is wrong (31,444.56). They can never reconcile while the bounce sits uncorrected.

### The real fix (upstream, not in the app)

Reverse the bounced check `ACR646169-2S` in the EBT ledger — post the offsetting **debit 3,930.57** that should have accompanied the bounce. That raises the running balance to `28,954.82 + 3,930.57 = 32,885.39`, giving:

```
derivedCredit = 60,399.38 − 32,885.39 = 27,513.99 = 7 × 3,930.57   ← the seven real installments, exactly
```

Then `active` (the seven non-exhausted installments) sums to 27,513.99 = `derivedCredit` → `mode: "subset"` → **all seven installments surface**, and the 2023 phantom `ACR0548519` (correctly flagged consumed) stays hidden. No app change required for this unit — it's a **data-entry defect at EBT**, and once the bounce is reversed the standard reconciliation handles it cleanly.

*(The phantom `ACR0548519` remains an independent stale-EBT issue, but it does not block this unit: it is correctly detected as consumed and excluded from `active`, so it never needs to be matched.)*

### Reproduction

```
EBT Inspector → UO-01166 / LR → Balance   (1 big water arinvoice + 2 OT adj + 2 ARCM + 8 downpayments; only 7 real installments listed)
EBT Inspector → UO-01166 / LR → Ledger    (rows 115-116: ACR646169-2S bounced credit + ACR646169-2SWA real credit, both present, neither reversed; ACR0548519 consumed via CM 548519 + ACR0559139)
SOA Breakdown → UO-01166 / LR → Payments  (observe no uncredited payments; derivedCredit meta = 31,444.56 = 8 installments, one more than paid → aggregate_only)
```

---

## Simplified Explanation

This is the same bug as above, written in plain accounting terms — no code, no jargon. It walks through: how the tool figures out a resident's advance payments today (**Part A**); what goes wrong for two example units, **UO-00934** (**Part B**) and **UO-01166** (**Part C**); and the possible fixes (**Part D**).

### Part A — How the tool currently reconciles advance payments

Each advance payment (a "down payment" / "ACR") is a **credit the resident paid ahead of time**. As each month's dues, equity, and water charges fall due, the association **applies** part of that advance against them, until the advance is fully used up (fully applied).

The EBT keeps a list of these advance-payment **items** and, beside each one, an amount labeled *"still unapplied"* — how much of that advance it believes has not yet been used.

**The catch:** that "still unapplied" amount is often **overstated**. The EBT frequently keeps showing an advance as unapplied long after it was actually applied to charges. If the tool simply trusted those amounts, it would credit residents with far more advance than they truly have.

**So the tool does not trust those item labels. It reconciles them against the statement of account (the ledger).** In plain terms:

1. Add up everything the resident still genuinely **owes** today (the open charges / open items).
2. Take the account's real **running balance** at the bottom of the ledger — this already reflects every payment and every charge that has actually been posted.
3. The difference between those two is the **true total advance still unapplied**, regardless of what the item labels claim.
4. Finally, the tool tries to trace that true amount back to specific advance-payment items, so it can show the resident "your remaining advance is this item and that item."

**A clean example (how it's supposed to work):**

- EBT lists two advance items: Item A "₱5,000 unapplied", Item B "₱3,000 unapplied" → labels claim ₱8,000 total.
- But the statement of account proves the resident only has **₱3,000** of advance truly unapplied.
- The tool concludes Item A was already applied, shows **only Item B (₱3,000)**, and hides Item A. Correct result — the resident's real advance is ₱3,000, and it matches Item B exactly.

**A real worked example — UO-00050 HR (a phantom caught correctly):**

The EBT lists three advance-payment items for this resident:

| Advance-payment item | EBT says still unapplied |
|---|---|
| ACR0543409 (Association Dues, Nov 2023) | 9,324.00 |
| ACR683649-2S (Water & interest, Mar 2026) | 3,956.43 |
| ACR701642-2S (Association Dues, Jun 2026) | 1,293.57 |
| **EBT total** | **14,574.00** |

Now the four steps:

1. **What the resident still owes today (open charges).** 06/2026 Association Dues 5,250.00 + 07/2026 Association Dues 5,250.00 + 07/2026 Equity 420.00 = **₱10,920.00**. (The five 2023 "Reversed" water credit-memo lines are old reversal entries, not real charges or credits, so they are set aside.)

2. **The real running balance at the bottom of the statement of account:** **₱5,670.00**.

3. **True unapplied advance** = what they owe on paper − real balance = 10,920.00 − 5,670.00 = **₱5,250.00**. This is the real advance still sitting unused, whatever the item labels claim.

4. **Trace it back to the items:**
   - **ACR0543409** — EBT says 9,324.00 unapplied, but the statement shows this November 2023 payment was **already applied** back in November 2023, against the October and November 2023 dues. It is a **phantom**: fully used up, yet still sitting on the list. Its true unapplied amount is **₱0**.
   - **ACR683649-2S** — truly **3,956.43** unapplied (statement agrees with the label).
   - **ACR701642-2S** — truly **1,293.57** unapplied (statement agrees with the label).
   - 3,956.43 + 1,293.57 = **₱5,250.00** — exactly the true total from Step 3.

So the tool shows the two genuine advances (₱3,956.43 and ₱1,293.57) and **hides the ₱9,324.00 phantom** (ACR0543409). Correct result: the resident sees their real ₱5,250.00 advance, and the already-applied 2023 payment does not inflate it. This is the reconciliation working exactly as intended.

That "tracing back to a specific item" step is the important one. It only works when the true unapplied amount lines up with one item, or with a clean combination of items — as in UO-00050 above. The two broken units further down (UO-00934, UO-01166) are exactly where that clean match is impossible.

### Part B — What goes wrong for UO-00934

This resident is actually **in credit** — the tool's headline correctly shows an advance balance of **₱4,081.77** in their favor. So there is real advance money here. Yet the Payments tab says **"No uncredited payments,"** which is wrong and confusing.

Here is why, step by step:

**1. The EBT item labels are badly overstated.** The EBT lists five advance-payment items and claims they are still **₱10,150.92** unapplied in total. But the statement of account proves only about **₱5,021** of advance is genuinely unapplied (and after one offset, the net figure is the ₱4,081.77 shown in the headline). So the EBT is overstating the unapplied advances by roughly **₱5,130**.

**2. The true leftover doesn't line up with any of the items.** The real unapplied advance (~₱5,021) does not equal any single advance-payment item, and it does not equal any clean combination of the five items either. The amounts simply don't add up to it. The individual items are:

| Advance-payment item | EBT says still unapplied |
|---|---|
| ACR0534441 (Water advance, 2023) | 3,217.60 |
| ACR0544409 (Water advance, 2023) | 3,899.00 |
| ACR0621965 (Water advance, 2025) | 2,134.42 |
| ACR654632-2S (Water advance) | 200.00 |
| ACR573509-F (Dues/Equity, PDC) | 699.90 |
| **EBT total** | **10,150.92** |
| **Statement of account says truly unused** | **~5,021.14** |

No mix of those five figures adds up to ₱5,021.14. So the tool knows the *total* real advance, but it cannot say *which* item (or items) that money belongs to.

**3. When the tool can't point to a specific item, it currently shows nothing.** Because it can't confidently attach the ₱5,021 to a named advance-payment item, it plays it safe and displays "No uncredited payments." That safe choice is what hides the real advance and creates the complaint.

**4. Why the numbers can't be traced to an item.** Normally we could re-derive each item's real unapplied amount from the statement. Here we can't, because the association's own records apply one credit memo against **several** advance-payment items at once, some records are missing their reference, and a few appear twice. When we try to work out how much each item truly has left, the math comes out impossible (some items would show a *negative* unapplied amount). The bookkeeping is too tangled to split cleanly per item.

**5. Side note — the one "charge" showing is not a real charge.** The single ₱939.37 open item labeled "Adjustment to ACR0564114" is actually a **reversed payment**: a ₱939.37 payment came in on 03/05/2024 and was taken back on 04/01/2024. It nets to zero and is not a new fee. It does **not** cause this bug — the missing-advance problem is exactly the same with or without it. It only matters for deciding the final displayed figure (see the question below).

**6. We tested removing the adjustment — it did not fix anything.** The finance team suggested that dropping any "Adjustment" row from the calculation might make the advances reappear. We tried exactly that on this resident's live data, three different ways. In every case the tool still showed nothing. The reason: there is only **one** adjustment row on the whole account (that ₱939.37), so removing it can only move the numbers by ₱939 at most — but the EBT's advance list (₱10,150.92) is overstated by roughly **₱5,130**, a gap far too big for a ₱939 change to close. So the resident's advance still can't be matched to the items, and the tool still stays silent. **The adjustment is a red herring; the real fix is one of the options below.**

### Part C — What goes wrong for UO-01166

This one looks like the same problem but has a **completely different, and fixable, cause** — a bounced check that was never properly reversed. This resident is paying off a large water charge of **₱46,463.76** (Water July 2025) in monthly installments of **₱3,930.57** each. They have paid **seven** installments, so their true advance credit is **7 × ₱3,930.57 = ₱27,513.99**. Yet the Payments tab shows **nothing**.

Here is why, step by step:

**1. A check bounced, and its credit was left in the account.** The resident's 1st installment was paid by a check that later bounced. Finance re-entered the payment under a new reference number (the "…-2SWA" one) with the corrected check details — normal practice, since a reference number can't be reused. **But the original bounced payment was never reversed.** So the account's ledger now records the 1st installment **twice**: once for the bounced check, once for the good one.

**2. That double-count makes the account look like it has one extra installment.** Because the bounced payment is still credited, the statement of account reads as if the resident has **eight** installments of advance credit (₱31,444.56) when they really have **seven** (₱27,513.99). The tool trusts the statement, so it goes looking for eight installments' worth of advance money.

**3. But the advance-payment list only has seven.** The EBT correctly lists only the seven **real** installments (the bounced one is not on the list). So the tool is trying to match an eight-installment total against a seven-installment list — it can never add up. No combination fits, so the tool plays safe and shows **"No uncredited payments,"** hiding all seven genuine installments.

**The fix is at the source, not in the tool.** Finance needs to **reverse the bounced check** in the EBT ledger (post the offsetting entry that should have accompanied the bounce). The moment that's done, the statement drops back to the correct seven-installment total (₱27,513.99), which matches the list exactly — and all seven installments appear normally. **No change to the tool is required for this resident.**

**The difference from UO-00934:** UO-00934 is a genuine reconciliation limit (the numbers truly can't be itemized). UO-01166 is **not** — it's a data-entry error at EBT (a bounce left uncorrected). Fix the ledger entry and it resolves itself.

### Part D — Possible ways to fix it

Ordered by our current preference. Each option only changes the stuck case (the resident truly has advance money, but it can't be traced to specific items); the cases that already work are left untouched.

**Option 1 — Show one summary line (recommended).** When the tool knows the true advance total but can't tie it to specific items, show a single line — e.g. "Unapplied advance (unallocated)" — for that total, without naming a particular advance payment.
- *Upside:* the resident always sees their real credit, and nothing is made up.
- *Downside:* it's a lump sum, not itemized; the display needs a line that works without a document number.
- *Which figure to show:* the **net ₱4,081.77** (matches the credit balance already on the headline) or the **gross ₱5,021.14** (the total advance before offsetting the one reversed payment). We suggest **net**, so the two figures agree.

**Option 2 — Itemize by best guess, trimming the last item.** Show the most recent advances adding up to the true total, cutting the final item down to a partial amount so the total matches.
- *Upside:* looks fully itemized.
- *Downside:* the per-item amounts are **made up** — they won't match the EBT — and choosing which items to show is a guess. Risk of implying a specific advance is used (or unused) when we don't actually know.

**Option 3 — Just trust the EBT labels.** List every advance at the EBT's "still unapplied" amount (total ₱10,150.92 here).
- *Upside:* simplest; matches exactly what finance sees in the EBT payment screen.
- *Downside:* **overstates** the resident's credit by ~₱5,130 in this case — this is precisely the overstatement the reconciliation was built to prevent, and it would break other units.

**Option 4 — Leave it as-is.** Keep showing "No uncredited payments" whenever the advance can't be traced.
- *Upside:* never shows a wrong itemization.
- *Downside:* hides real credit — the very complaint being reported.

---

## In Summary: root causes of disappearing uncredited payments

Every case where an uncredited (advance) payment vanishes from the app traces back to the **same core design decision**: the app does **not** trust the EBT's per-payment "still unapplied" figure (`dueamount`), because that figure is frequently wrong. Instead it derives the *true total* advance from the statement of account (`sumOutstandingFees − ledgerFinalBalance = derivedCredit`), then tries to **map that trusted total back onto specific EBT downpayment rows**. A payment disappears whenever that mapping fails. The failures come from seven distinct problems:

1. **Stale / phantom EBT remainings (overstated).** The EBT keeps showing a payment as unapplied long after the ledger already applied it (via a credit memo). This inflates the candidate sum above the trusted total.
   - *Seen in:* UO-00050 (ACR0543409, 9,324 phantom — **caught correctly**); UO-00934 (five overstated items); UO-01166 (ACR0548519, 11,323.63 phantom).

2. **Missing floating payments (not surfaced at all).** A genuinely-unapplied payment exists in the ledger but is **absent from the EBT downpayment list**, so the tool has no row to point at even though the credit is real.
   - *Status:* the one suspected case (UO-01166, `ACR646169-2S`) turned out **not** to be a missing floating payment — it is a **bounced check** left un-reversed in the ledger. See problem 7.

3. **Whole-row-only selection — can't show a partial or invent a missing row.** The reconciler may only show or hide **entire** EBT rows. When the trusted total needs *part* of a row, or a row that isn't on the list, no clean combination lands on the target.
   - *Seen in:* UO-00934 (no subset of the five items sums to the true total).

4. **Shared credit memos over-counted (double attribution).** One credit memo referenced by several payments has its **full** amount attributed to **each** of them, so a still-floating payment looks fully applied and gets hidden.
   - *Seen in:* Change 7 (fixed with a fallback, but the tangled allocation in EBT persists as the underlying cause).

5. **Safe-default hides everything (`aggregate_only`).** When the trusted total can't be matched to specific rows, the tool currently shows **nothing** rather than an aggregate figure — so real credit disappears from the UI even though the headline balance already reflects it.
   - *Seen in:* UO-00934 (ends here — a genuine reconciliation limit). UO-01166 also lands in this state, but only as a *downstream symptom* of problem 7; fixing the ledger entry resolves it without touching this default.

6. **Upstream data quality — the real origin.** Problems 1–4 all reduce to one thing: the EBT's downpayment `dueamount` is **not kept in sync** with credit-memo allocations. It is not cleared when a payment is applied, sometimes omits a payment entirely, and lets one memo count against many payments. If the EBT maintained accurate per-payment remainings, `derivedCredit` and the candidate sum would agree and **none** of the reconciliation guesswork (and none of this hiding) would be needed.

7. **Bounced/reversed payment left un-reversed in the ledger (inflates the trusted total).** When a check bounces and is re-entered under a new docno, the **original credit must be reversed with an offsetting debit**. If it isn't, the ledger double-counts that payment, and since the true credit is derived *from* the ledger balance (`sumOutstandingFees − ledgerFinalBalance`), `derivedCredit` is overstated by the un-reversed amount — pushing an otherwise-clean account into `aggregate_only`.
   - *Seen in:* UO-01166 (`ACR646169-2S`, a bounced 1st-installment check still credited alongside its `-2SWA` replacement; inflates `derivedCredit` by exactly one 3,930.57 installment). **Fix:** reverse the bounced credit at EBT; the account then reconciles at 7 installments with no app change.

**Single-sentence root cause:** the EBT's per-payment "still unapplied" figures are unreliable — stale, missing, or double-counted — and the app can only display **whole** EBT rows, so whenever the ledger-proven true credit cannot be expressed as a clean subset of those unreliable rows, the app hides the payments instead of surfacing the amount it already knows is there.

**What's fixable where:**
- *App-side (we control):* problem 5 — stop hiding; show the trusted aggregate when itemization fails (see Part D / Potential solutions). This makes the credit visible for the genuine-limit case (UO-00934).
- *EBT-side (source data):* problems 1, 2, 4, 6, **7** — fixing the upstream data removes the mismatch at the root. Problem 7 (UO-01166's bounced check) is the clearest example: a single corrective ledger entry makes the account reconcile perfectly, no app change needed.

---

## What we would need from finance

1. When we can prove a resident has advance money but **cannot tie it to a specific advance payment**, do you want the tool to show the **total unused advance as one summary line**, or is "No uncredited payments" acceptable in that situation?
2. If we show a summary line, which figure is correct for your purposes — the **net ₱4,081.77** (matches the credit balance already on the headline) or the **gross ₱5,021.14** (total advance before offsetting the reversed payment)?
3. Most important, root cause: **why does the EBT still show ₱10,150.92 of advances remaining when the account only truly has about ₱5,021 unused?** Are those old 2023 water advances really still open, or is the EBT simply not clearing them once they're spent? If the EBT records can be corrected at the source, this problem mostly goes away on its own.
4. Is that reversed ₱939.37 (ACR0564114) still genuinely collectible from the resident, or should it be written off? Your answer decides the net-vs-gross figure above.
