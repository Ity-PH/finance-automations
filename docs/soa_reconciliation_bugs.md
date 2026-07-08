# SOA Reconciliation Bugs (open, not yet fixed)

> Split out of `soa_breakdown_changes (as of jul 6 2026).md` on Jul 8, 2026.
> That file is now purely implementation instructions; this file holds the
> open reconciliation bug analysis (UO-00934, UO-01166) awaiting finance decisions.

---

# OPEN BUG (not yet fixed): unallocatable floating credit shows nothing

**Status:** unresolved — needs a finance-team decision before coding. Documented Jul 6, 2026 for discussion. This is **not** the same as Changes 6 and 7 (those had a clean answer once inputs were corrected; this one has no clean per-row answer at all).

> **⚠️ ROOT CAUSE FOUND (Jul 8, 2026) — see [Finding 6](#finding-6). Read it before the earlier findings.**
> The per-row credit **is** recoverable; the whole "unallocatable" premise was us reading the **wrong EBT column**. SAP exposes a third money column, **"Total Payment"**, that our API never returned. Its values sum **exactly** to the true floating credit (₱4,081.77) and subset-sum lands a unique exact match. **Findings 4 and 5 are largely overturned** — corrections inline below. The fix is a data-plumbing change (fetch `Total Payment`), not a synthetic aggregate line.

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

Done consistently on **both** sides (the gross interpretation, treating the reversed payment as genuine credit), `derivedCredit` stays **5,021.14**. **The adjustment is a red herring for whether anything shows — it is not why nothing appears.**

> **Correction (see Finding 2c):** the parenthetical claim once here — that dropping the adjustment from fees *only* "double-counts" — is **wrong**. The ledger already nets the reversed payment (`ACR0564114` credit) against its reversal (`OT-24-04-00009` debit) to zero, so the −4,081.77 does **not** carry a live +939.37. Dropping the dead invoice from the balance alone is legitimate and yields the **correct net** derivedCredit of 4,081.77. It still doesn't surface the advances, but for a different reason (stale candidates) — detailed below.

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

### Finding 2c — excluding the adjustment from the BALANCE ONLY: corrects `derivedCredit`, still doesn't reconcile

A subtler variant, prompted by the question: *"is this just finance failing to clear the reversed payment off the balance table?"* Here the adjustment is dropped from the **balance table only**, leaving the ledger fully intact (unlike Finding 2b's symmetric both-sides removal).

First, the ledger facts (`ACR0564114` and `OT-24-04-00009` traced live):

```
row 51  03/05/2024  ACR0564114     INCOMINGPAYMENT  credit 939.37   ← payment received
row 58  04/01/2024  OT-24-04-00009 ARINVOICE        debit  939.37   ← reversal ("Adjustment to ACR0564114")
```

Both sit mid-ledger and **cancel** — net **zero** contribution to the final running balance of −4,081.77. So the −4,081.77 does **not** contain a live +939.37; the adjustment already consumed itself canceling its own payment inside the ledger. The only place the 939.37 still lingers as a *live* item is the **balance table**, as a stale open arinvoice.

Replaying the algorithm with `OT-24-04-00009` removed from the balance (ledger untouched):

| Treatment | sumFees | ledgerBal | derivedCredit | candidateSum | closest subset | mode | displayed |
|---|---|---|---|---|---|---|---|
| Current (OT on balance) | 939.37 | −4,081.77 | 5,021.14 | 10,150.92 | 4,798.90 (off 222.24) | `aggregate_only` | **nothing** |
| **OT removed from balance only** | 0 | −4,081.77 | **4,081.77** | 10,150.92 | 4,099.00 (off 17.23) | `aggregate_only` | **nothing** |

**Two conclusions:**

1. **The lingering OT invoice is a genuine finance data-hygiene defect, and clearing it is legitimate.** Removing it from the balance alone does **not** double-count (the ledger already nets the reversal), and it moves `derivedCredit` from the overstated 5,021.14 to **4,081.77 — exactly the headline net credit.** This is the *more correct* trusted total. It also settles the **net-vs-gross** question (open Q2 / solutions §1): the reversed ₱939.37 is not floating credit, so **net 4,081.77 is the right figure**, and the reversed payment should simply be written off the open-items list.

2. **But it still does not surface the advances.** Even at the correct 4,081.77, no subset of the stale downpayment remainings `{3,217.60, 3,899.00, 2,134.42, 200.00, 699.90}` sums to it — closest is 4,099.00 (`ACR0544409 + ACR654632-2S`), off ₱17.23, outside tolerance. Mode stays `aggregate_only`; nothing shows.

**Verdict:** clearing the reversed payment off the balance is worth doing for accuracy (correct, net-consistent `derivedCredit`), but it is **not** the fix for the disappearing-advance bug. The stale, unreconcilable downpayment remainings (Finding 3) are the real blocker either way.

## Finding 3 — the real blocker: EBT downpayment remainings are stale and unreconcilable

- EBT claims **10,150.92** remaining across the 5 downpayments.
- Ledger-true floating credit is **5,021.14** gross (or **4,081.77** net — the displayed credit balance).
- EBT overstates by ~**5,130**.
- **No subset** of `{3,217.60, 3,899.00, 2,134.42, 200.00, 699.90}` sums to 5,021.14 (brute-forced; closest 4,798.90) **or** to 4,081.77 (closest 4,099.00).

So even a perfect subset algorithm cannot reconcile — the inputs themselves are wrong.

## Finding 4 — per-row true remaining cannot be reconstructed from the ledger

> **⚠️ OVERTURNED by [Finding 6](#finding-6).** This finding concluded per-row remaining is unrecoverable **from the ledger**. True — but it *is* recoverable from the balance table's **"Total Payment"** column, which our API wasn't returning. The aggregate-only conclusion below no longer holds. Kept for the record.

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

### Finding 4b — finance-confirmed phantom (ACR0534441): pruning it does NOT reconcile the unit

Finance (later interview) confirmed that **`ACR0534441` is fully applied in the ledger and should not surface** — i.e. it is a phantom, exactly what the reconciler already suspects. Two things were tested: (a) is the claim true, and (b) does removing it let the remaining water advances surface.

**(a) The phantom claim is correct — verified from its refdocs.** `ACR0534441` (₱4,000 paid) is referenced by four credit memos, one of which is **solely** its own:

| Credit memo | credit | shared with | 
|---|---|---|
| CM-24-02-02056 | 1,654.66 | **sole (ACR0534441 only)** |
| CM-23-10-02625 | 3,665.29 | ACR0495696 |
| CM-24-01-00565 | 3,930.22 | ACR0532287 |
| CM-25-10-12459 | 883.40 | ACR0544409 |

Every allocation exceeds the ₱4,000 paid — naive-full **10,133.57**, fair all-payment split **5,894.11**, and even the sole memo alone (1,654.66) already beats EBT's implied "applied" of 782.40. The row is unambiguously consumed; its EBT `dueamount` of 3,217.60 is 100% stale. **Finance is right.**

**(b) Removing the phantom does not surface the rest.** Replayed with `ACR0534441` dropped from the candidate list, against both derivedCredit targets (adjustment kept = 5,021.14; adjustment removed from balance = 4,081.77):

| Candidate set | candidateSum | vs 5,021.14 | vs 4,081.77 | mode |
|---|---|---|---|---|
| All 5 rows | 10,150.92 | no (closest 4,798.90) | no (closest 4,099.00) | `aggregate_only` |
| **Remove ACR0534441** | 6,933.32 | no (closest 4,798.90) | no (closest 4,099.00) | `aggregate_only` |
| Remove ACR0534441 + ACR0544409 | 3,034.32 | no | no (now *below* target) | `aggregate_only` |

The closest subsets (4,798.90 / 4,099.00) **never contained `ACR0534441`**, so removing it is a no-op for the match. Worse, pruning eventually pushes `candidateSum` *below* `derivedCredit`, flipping the failure from "overstated" to "shortfall" — still `aggregate_only`, still nothing shown.

**Why pruning can't win.** The floating credit is not cleanly located in these rows. By fair (all-payment) credit-memo split, the *true* remaining is: `ACR0534441` **0** (phantom ✓), `ACR0544409` 0, `ACR0621965` 0, `ACR654632-2S` 200, `ACR573509-F` **8,218.75** (indeterminate — its single memo `CM-25-12-13218` is shared with `ACR573509-E`). Total true remaining ranges from **200** (naive) to **8,418.75** (all-split) depending on how shared memos are allocated — and **no** consistent allocation lands on the ~4,081.77 the account actually holds. Confirming one phantom is correct data hygiene, but the remaining rows are individually indeterminate, so the aggregate credit still cannot be attributed to specific rows. This **reinforces Finding 4**: only the aggregate is trustworthy; the fix is the synthetic aggregate line (solution 1), not row-pruning.

### Finding 5 — human error or EBT bug? (stale downpayment `dueamount` column)

> **⚠️ PARTLY OVERTURNED by [Finding 6](#finding-6).** The verdict here ("EBT bug: `dueamount` doesn't decrement") is half right: `dueamount` (SAP "Balance") *is* stale, but EBT **does** track the correct current remaining — in the **"Total Payment"** column our API never fetched. So it's not an EBT decrement bug; it's a **wrong-column bug on our side**. The specific per-row "ledger reality" cells below (esp. ACR573509-F "fully consumed") are wrong — see Finding 6 and the ACR573509 chain trace. Kept for the record.

**Question (verbatim):**

> I am still confused about UO-00934's case. I want to figure out which rows in the ledger are causing problems. Is it a human error by the finance team (like in UO-01166 LR's case where there is an extra credit row?) Or is this confirmed an EBT bug? please help me figure it out. how come finance team says ACR0544409, ACR0621965, ACR654632-2S and ACR573509-F should be surfaced in the app even though you say 3/4 of those are already exhausted... is this an oversight from our algorithm of a misunderstanding of the finance team?

**Answer:**

Reconciled the whole account. Here's the decisive picture.

#### The one number you can trust

**Ledger running balance = −4,081.77.** Negative = account in credit. That's the resident's *true* floating credit, computed by EBT's own running ledger. Authoritative. Everything else gets measured against it.

#### What EBT's balance table claims vs truth

EBT's downpayment `dueamount` column (the "still floating" per-payment number) sums to **10,150.92**. True credit is 4,081.77. So the column **overstates by exactly 6,069.15** — that's the 6,069.15 asked about earlier. It's the total stale amount, not a real payment.

| payment | EBT says floating | ledger reality |
|---|---|---|
| ACR0534441 | 3,217.60 | 0 (finance-confirmed fully applied) |
| ACR0544409 | 3,899.00 | partly consumed |
| ACR0621965 | 2,134.42 | `dueamount == amount` → EBT decremented **nothing** |
| ACR654632-2S | 200.00 | truly floating (no CM touches it) |
| ACR573509-F | 699.90 | CM-25-12-13218 = 16,437.50 matches paymentNet exactly → ledger says **fully consumed**, dues not water |

#### Verdict on the three questions

**1. Human error or EBT bug?** → **EBT bug.** Not the clean single-row human error of UO-01166. There you could point at one duplicate credit line. Here the defect is *distributed and inconsistent*: EBT decrements the downpayment `dueamount` for some payments (ACR0534441, ACR0544409, ACR573509-F) but leaves others at full original (ACR0621965 untouched, ACR654632-2S untouched) even though credit memos reference them. A correctly-working system would drop each `dueamount` to 0 as its credit memos apply it. It doesn't. The remaining column is stale.

**2. Why finance says all 4 should surface** → Finance is reading that **same stale EBT column at face value.** Their logic: "ACR0534441 is phantom, so show the other four." But those four at face value sum to **6,933.32** — which exceeds the true credit (4,081.77) by 2,851.55. You can't surface 6,933 of advances when the account only holds 4,081 in credit. So finance is over-counting by trusting a column that's provably inflated (ACR0534441 is the proof: EBT said 3,217.60, finance itself admits it's 0).

**3. Algo oversight or finance misunderstanding?** → **Mostly finance misunderstanding, but the app isn't blameless either.** Neither extreme is right:
- Finance's "surface all 4 at full value" = wrong (over-counts by 2,851.55).
- App's current "surface nothing" (`aggregate_only`) = also wrong — the account *genuinely* holds 4,081.77 credit that should show somehow.
- The app is *correct* to refuse the 6,933.32; it's *incomplete* in that it can't localize the real 4,081.77 onto clean rows, because the stale/shared data won't partition. Closest any subset gets to 4,081.77 is 4,099.00 (ACR0544409 + ACR654632-2S), off by 17.23. Nothing lands exact.

#### Bottom line

Root cause = **EBT not zeroing downpayment `dueamount` when credit memos consume the advance** — a source-data bug, distributed across rows, not one human slip. Finance's expectation is built on that bad column. The algorithm correctly rejects the inflated total but can't reconstruct the genuine 4,081.77 into specific rows (shared credit memos make per-payment remaining unrecoverable — same wall as the CM-23-10-02625 split question). Fix belongs upstream (EBT must decrement the remainings); app-side, only an aggregate "4,081.77 unattributed credit" line is honest.

## Finding 6 — ROOT CAUSE: we reconcile on the wrong EBT column ("Balance"/`dueamount` instead of "Total Payment")

*Documented Jul 8, 2026. This overturns Findings 4 and 5 and resolves the open bug for UO-00934.*

### What was found

SAP's **Incoming Payment – Customer** screen (the source view behind the EBT `/outstanding` endpoint) shows **three** money columns per row. Our API returns only **two** of them:

| SAP UI column | our API field | meaning | ACR0544409 |
|---|---|---|---|
| **Total** | `amount` | original document amount | −4,000.00 |
| **Balance** | `dueamount` ← we reconcile on this | a staler open-item figure (PDC-gross / original-net) | −3,899.00 (**stale**) |
| **Total Payment** | **not returned by the API** | the **actual current unapplied (floating) amount** | **−1,047.45 (correct)** |

Confirmed against the raw cached `/outstanding` response for UO-00934: it carries `amount` and `dueamount` **only**. The **Total Payment** column is absent from the feed. We never had the number that actually answers the question.

### The three columns for UO-00934

| docno | Total (`amount`) | Balance (`dueamount`, used now) | **Total Payment (true floating)** |
|---|---|---|---|
| OT-24-04-00009 (adjustment) | 939.37 | 939.37 | 939.37 |
| ACR0534441 | −4,000.00 | −3,217.60 | −3,217.60 *(still phantom, see below)* |
| ACR0544409 | −4,000.00 | −3,899.00 | **−1,047.45** |
| ACR0621965 | −2,134.42 | −2,134.42 | −2,134.42 |
| ACR654632-2S | −200.00 | −200.00 | −200.00 |
| ACR573509-F | −16,437.50 | −699.90 | −699.90 |

### The genuine advances' Total Payment sums to the true credit — exactly

```
ACR0544409     1,047.45
ACR0621965     2,134.42
ACR654632-2S     200.00
ACR573509-F      699.90
──────────────────────
SUM            4,081.77   ==  |ledger net|  ==  derivedCredit (net, adjustment excluded)
```

Exact to the centavo. The entire ₱2,851.55 "overstatement" chased across Findings 3–5 was **one row**: ACR0544409's `Balance` said 3,899.00 while its real floating (`Total Payment`) was 1,047.45. The `dueamount` column was stale for that row; `Total Payment` already had it right.

### Recompute with `Total Payment` as `candidateRemaining`

| | old (`Balance`/`dueamount`) | new (`Total Payment`) |
|---|---|---|
| candidateSum | 10,150.92 | 7,299.37 |
| target `derivedCredit` (net, adjustment excluded) | 4,081.77 | 4,081.77 |
| subset-sum result | closest 4,099.00, **no exact match** → `aggregate_only` (**shows nothing**) | **unique exact hit 4,081.77** → `subset` (**shows the 4 genuine advances**) |

Subset-sum over the Total Payment values finds **exactly one** matching combination — `{ACR0544409, ACR0621965, ACR654632-2S, ACR573509-F}` = 4,081.77 — and **automatically excludes the phantom ACR0534441** (adding it overshoots the target). Mode flips from `aggregate_only` to `subset`. **The bug resolves with no synthetic aggregate line.**

### Two caveats

1. **ACR0534441's `Total Payment` is still −3,217.60** — the one row finance flagged as fully-applied phantom is *not* zeroed even in this better column. It no longer blocks anything (subset-sum leaves it out), but it means Total Payment is not blindly trustworthy per-row: **keep the subset-sum step**; do not render rows at face value. If shown raw, ACR0534441 would surface as a bogus ₱3,217.60 advance.
2. **Net target is required.** The exact match needs `derivedCredit = 4,081.77`, which requires excluding the ADJUSTMENT invoice (OT-24-04-00009) from `sumOutstandingFees` (finance's ADJUSTMENT rule / Change 4). Against the gross 5,021.14 there is **no** subset. So the fix is two things together: (a) fetch `Total Payment`, (b) keep excluding adjustment rows.

### What this overturns

- **Finding 4** ("per-row true remaining cannot be reconstructed") — **wrong once the right column is available.** It's fully reconstructable; EBT tracks it in `Total Payment`. The ledger-only reconstruction failed because the ledger drops per-pair amounts (see the CM-23-10-02625 split question), but the balance table's `Total Payment` carries the resolved figure directly.
- **Finding 5** ("EBT bug: stale non-decrementing `dueamount`") — **recast.** EBT *does* decrement correctly, in `Total Payment`. `Balance`/`dueamount` is a different, staler figure. Not an EBT decrement bug — a **wrong-column bug on our side.** (One residual EBT data issue remains: ACR0534441 is stale even in `Total Payment`.)
- **The ACR573509-F chain trace is confirmed independently:** the chain solved F's leftover to **699.90**, and `Total Payment` for ACR573509-F is **699.90**. Two independent methods agree → F's advance is genuine, and Finding 5's "fully consumed" cell for F was the shared-CM false-exhaustion artifact.

### The fix (data plumbing, not app logic)

1. **Backend/API:** have the EBT `/outstanding` endpoint return the **Total Payment** column for downpayment rows (add a field, e.g. `totalpayment`, alongside `amount`/`dueamount`).
2. **App:** in `buildDownpaymentCandidates`, set `candidateRemaining` from `Total Payment` instead of `dueamount`.
3. Keep excluding ADJUSTMENT arinvoice rows from `sumOutstandingFees` (already Change 4).
4. Keep the subset-sum reconcile step (handles the residual phantom ACR0534441).

This single data change makes UO-00934 reconcile cleanly and almost certainly fixes other units stuck on `aggregate_only` for the same reason. **Next step is a backend ask to confirm and expose the column**, not an app-logic change.

## Why this is different from Changes 6 and 7

> **Note (Jul 8):** superseded in large part by [Finding 6](#finding-6) — this bug *does* now have an itemizable answer once `Total Payment` is fetched. The framing below described the state before that column was known.

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
