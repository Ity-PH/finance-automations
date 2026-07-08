# How the App Decides Which Advance Payments to Show

*A plain-language guide to the "Uncredited Payments" reconciliation, written for the finance team. No programming knowledge needed.*

*All real-unit figures in this document were pulled live from the EBT on **July 8, 2026** and re-checked through the app's actual reconciliation logic on the same day.*

---

## 1. The problem this solves

When a resident pays ahead of their charges — an **advance payment** (the "ACR…" receipts, called *downpayments* in the EBT) — that money sits on the account until it is **applied** against dues, water, or other charges as they fall due.

The EBT keeps a list of these advance payments, and beside each one an amount meaning *"this much is still unapplied."*

**The catch: that "still unapplied" figure is frequently wrong.** The EBT often keeps showing an advance as unapplied long after it was actually used up. If the app simply displayed those figures, residents would routinely see phantom credit — money that looks available but was spent on charges years ago.

So the app does what any accountant would do: **it does not take the labels at face value; it reconciles them against the Statement of Account.**

---

## 2. The one number the app always trusts

Two figures from the Statement of Account (the ledger) are reliable, because they reflect every posted charge and payment:

1. **Open charges** — everything the resident still owes today (the unpaid invoices on the balance table).
2. **Running balance** — the final balance at the bottom of the ledger.

From these, one subtraction gives the truth:

> **True unapplied advance = Open charges − Running balance**

Think of it this way: if the resident owes ₱10,000 in open charges but the ledger says their account only stands at ₱7,000, then ₱3,000 of advance money must already be sitting on the account, not yet formally applied. That ₱3,000 is provable regardless of what any advance-payment label claims.

This trusted total is the anchor for everything below. The labels never override it.

*(Two bookkeeping details, handled automatically: a **negative** A/R credit memo — a genuine reversal, like a cancelled Pet ID fee — is netted against the open charges; and old **positive** "Reversed A/R Invoice" credit-memo rows from past cleanups are set aside entirely, because they are artifacts that never touched the running balance. UO-00803 below shows both.)*

---

## 3. The three outcomes

Once the app knows the true total, it tries to point at the **specific advance-payment items** that hold that money. Three things can happen:

| Outcome | When | What the resident sees |
|---|---|---|
| **Show everything** ("all") | The listed items add up to the true total | Every advance, at its listed amount |
| **Show a matching combination** ("subset") | The items add up to *more* than the true total, but some combination of them equals it exactly | The matching items; the stale ones are hidden |
| **Show nothing** ("aggregate only") | No combination of items can explain the true total | "No uncredited payments" — even when real credit exists. *This is the known open bug.* |

One rule underlies all three: **the app only ever shows or hides whole items at their listed amounts.** It never invents an amount, never trims an item down, never displays a payment that isn't on the EBT's list. That honesty is what makes the "show nothing" case possible — more on that at the end.

---

## 4. Simple examples (round numbers)

### Example A — everything matches → show all

- Open charges: ₱10,000. Running balance: ₱2,000.
- **True advance = 10,000 − 2,000 = ₱8,000.**
- EBT lists two advances: ₱5,000 and ₱3,000. Together: ₱8,000. ✓

The labels agree with the ledger. **Both advances shown.** No detective work needed.

### Example B — one phantom → show the matching item, hide the phantom

- Open charges: ₱10,000. Running balance: ₱7,000.
- **True advance = ₱3,000.**
- EBT lists: ₱5,000 and ₱3,000. Together ₱8,000 — ₱5,000 **more** than the truth.

Something on the list is stale. The ₱3,000 item alone equals the truth, so the app concludes the ₱5,000 was already applied (its label just never got cleared). **Shows the ₱3,000, hides the ₱5,000.**

### Example C — a combination matches → show the combination

- **True advance = ₱6,000.**
- EBT lists three advances: ₱10,000, ₱5,000, ₱1,000 (total ₱16,000).

No single item equals ₱6,000, but **₱5,000 + ₱1,000 does** — exactly. The app shows those two and hides the ₱10,000 as stale. This is the *subset* method at work: find the combination of whole items that reproduces the trusted total.

### Example D — nothing fits → show nothing (the open bug)

- **True advance = ₱4,000.**
- EBT lists: ₱5,000 and ₱3,000.

Check every possibility: 5,000? No. 3,000? No. 5,000+3,000=8,000? No. There is **no combination of whole items** that makes ₱4,000. The truth would require *part* of an item (say, 4,000 out of the 5,000) — but the app refuses to guess which part of which item, because a wrong guess would tell finance a specific receipt is or isn't spent when nobody actually knows.

So it shows **"No uncredited payments"** — even though ₱4,000 of real credit exists. Safe, but misleading. (The clearest real unit that hits this is UO-00934 LR. UO-01166 LR also ends up showing nothing, but for a different and fixable reason — a bounced check in the ledger — covered in Section 8.)

---

## 5. The subset method, step by step

When the listed items total **more** than the true advance (Examples B and C), the app runs this checklist, in order, stopping at the first step that works:

**Step 1 — Look for proof of consumption in the ledger.**
Every time an advance is applied to charges, the ledger records a **credit memo** — an application record naming both the advance and the invoices it settled. For each listed advance, the app adds up all the credit memos that reference it. If those applications add up to the full amount originally paid, that advance is **proven consumed** — a phantom, whatever its label says.

**Step 2 — Does the rest add up?**
Set the proven-consumed items aside. If the remaining items now sum exactly to the true total → done. Show the remainder, hide the phantoms. *(This is what happens on UO-00050 below.)*

**Step 3 — Try every combination.**
If the remainder still doesn't match, the app tries **every possible combination** of the not-yet-consumed items, looking for one that sums to the true total (to the centavo). Like reconciling a bank statement by figuring out which outstanding checks explain the difference — it tests all of them. Found → show that combination, hide the rest.

**Step 4 — Trim the most suspect items.**
Still nothing: drop the most overstated-looking items one at a time and re-check.

**Step 5 — Re-try with everything, including the "proven consumed."**
The proof in Step 1 has one known blind spot: when a single credit memo was funded by **two** advances at once, its full amount gets counted against *each* of them, which can falsely brand a still-unapplied advance as consumed. So before giving up, the app re-runs the combination search over the **entire** list, phantom flags ignored. (This safeguard was added after unit UO-00432, where a shared credit memo wrongly hid a genuinely floating ₱4,044.32 advance.)

**Step 6 — Give up.**
No combination anywhere matches → "No uncredited payments" (Example D, the open bug).

Two principles run through every step:

- **The ledger total is the referee.** Item labels are the suspects, never the judge.
- **Whole items only.** The app will hide a listed item or show it at its full listed amount, nothing in between.

---

## 6. Real unit 1 — UO-00050 HR: the subset method catching a phantom

*(Live EBT data, July 8, 2026.)*

The EBT lists three advance payments on this account:

| Advance payment | Date paid | EBT says still unapplied |
|---|---|---|
| ACR0543409 — "Association Dues" | 11/28/2023 | ₱9,324.00 |
| ACR683649-2S — "Water Jan 2026 & interest" | 03/14/2026 | ₱3,956.43 |
| ACR701642-2S — "05–06/2026 dues & equity, partial" | 06/09/2026 | ₱1,293.57 |
| **Total claimed** | | **₱14,574.00** |

**Step 1 — What does the resident actually owe?** Three open charges: 06/2026 dues ₱5,250.00 + 07/2026 dues ₱5,250.00 + 07/2026 equity ₱420.00 = **₱10,920.00**. *(The account also carries five 2023 "Reversed A/R Invoice" credit-memo rows — old cleanup artifacts, set aside as always.)*

**Step 2 — What is the running balance?** The ledger bottoms out at **₱5,670.00**.

**Step 3 — True unapplied advance** = 10,920.00 − 5,670.00 = **₱5,250.00**.

The list claims ₱14,574 but the ledger proves only ₱5,250. Overstated by ₱9,324 — suspiciously, exactly the amount of the oldest item.

**Step 4 — The evidence pass.** The ledger shows the November 2023 payment ACR0543409 was applied against the October and November 2023 dues shortly after it was received — credit memos totaling the full ₱9,324. **Proven consumed.** Its label sat stale for two and a half years.

**Step 5 — Does the rest add up?**

> 3,956.43 + 1,293.57 = **₱5,250.00** — the true total, to the centavo. ✓

**Result:** the app shows the two genuine advances (₱3,956.43 and ₱1,293.57) and hides the ₱9,324 phantom. The resident sees exactly their real ₱5,250 of advance credit — not the inflated ₱14,574 the raw labels would have shown.

Verified July 8, 2026 by running the account through the app's reconciliation: outcome **subset**, displayed `ACR683649-2S` + `ACR701642-2S`, hidden `ACR0543409` (marked consumed by ledger evidence).

---

## 7. Real unit 2 — UO-00803 LR: everything matches, after careful netting

*(Live EBT data, July 8, 2026. Figures differ from the July 6 write-up of this unit because a ₱5,940 payment — ACR707565-2S — posted on July 6 and settled the June dues and equity.)*

This one shows the "all" outcome, plus the two netting rules from Section 2 working on a real account.

The EBT lists two advance payments:

| Advance payment | Date paid | EBT says still unapplied |
|---|---|---|
| ACR695473-2S — "Interest on previous balances (WA & OT)" | 05/11/2026 | ₱532.31 |
| ACR697392-2S — "05/2026 dues balance & over" | 05/19/2026 | ₱0.79 |
| **Total claimed** | | **₱533.10** |

**Step 1 — Open charges, with netting.** The balance table holds:

| Item | Amount | Treatment |
|---|---|---|
| Pet ID (SU-26-06-01775) | +500.00 | real open charge — count it |
| Water May 2026 (WA-26-06-04910) | +1,168.32 | real open charge — count it |
| Pet ID reversal (ARCM-26-07-00180, 07/02/2026) | −500.00 | genuine reversal — **net it against the charges** |
| Four 2023 "Reversed A/R Invoice" rows | +28,334.78, +158,351.12, +170.92, +472.88 | artifacts — **set aside entirely** |

Net open charges = 500.00 + 1,168.32 − 500.00 = **₱1,168.32**. (The Pet ID fee and its reversal cancel — the resident doesn't really owe it.)

Why the two treatments differ: the −500 reversal is *in* the running balance (posted 07/02/2026), so it must be netted here too or the math double-counts. The 2023 positive rows never touched the running balance — counting them would inflate "what's owed" to nearly ₱190,000 and wreck the reconciliation. *(An early version of the app made exactly that mistake on this very unit, which hid both advances below; the rule was corrected on July 6, 2026.)*

**Step 2 — Running balance:** **₱635.22**.

**Step 3 — True unapplied advance** = 1,168.32 − 635.22 = **₱533.10**.

**Step 4 — Compare with the list:** 532.31 + 0.79 = **₱533.10**. Exact match. ✓

**Result:** labels agree with the ledger, no detective work needed — **both advances shown**, nothing hidden. Verified July 8, 2026 through the app's reconciliation: outcome **all**.

Worth noticing how fragile this was: get either netting rule wrong and the trusted total shifts, the ₱533.10 match breaks, and two perfectly real advances vanish from the screen. Reconciliation lives and dies on those centavo-exact comparisons.

---

## 8. Where the method reaches its limit

Sometimes the app shows "No uncredited payments" even though real credit exists. There are **two very different reasons** this happens, and telling them apart matters:

- **A genuine limit of the method** — the true total simply can't be expressed as a combination of whole items on the list (the truth needs a *fraction* of an item, and the app refuses to guess which fraction). *UO-00934 below.*
- **A data error at the source that only looks like a limit** — the trusted total itself is wrong because the ledger has a mistake in it. Here the method is working correctly; it's the input that's broken. Fix the ledger and it resolves on its own. *UO-01166 below.*

### UO-00934 LR — the labels overstated, no combination fits (a genuine limit)

Here the resident is genuinely in credit — the headline correctly shows **₱4,081.77** in their favour — yet the Payments tab shows nothing.

> **True unapplied advance = ₱5,021.14** gross (₱4,081.77 after one offset, below).

The EBT lists five advances totalling far more:

| Advance payment | EBT says unapplied |
|---|---|
| ACR0534441 (water, 2023) | 3,217.60 |
| ACR0544409 (water, 2023) | 3,899.00 |
| ACR0621965 (water, 2025) | 2,134.42 |
| ACR654632-2S (water) | 200.00 |
| ACR573509-F (dues/equity) | 699.90 |
| **List total** | **10,150.92** |

The list (₱10,150.92) overstates the truth (₱5,021.14) by about ₱5,130 — but no combination of those five figures lands on ₱5,021.14 (closest is ₱4,798.90), nor on the net ₱4,081.77 (closest ₱4,099.00). And the ledger evidence can't rescue it either: the same credit memos are shared across several advances, so the proof-of-consumption step wrongly brands nearly everything as consumed. The truth is known; it just can't be pinned to specific items.

*(One "charge" on this account — a ₱939.37 "Adjustment" — is really a reversed payment, not a fee. Finance asked whether dropping "Adjustment" rows would fix the display; tested on live data, it does not: there is only one such row, so it moves the numbers by at most ₱939, nowhere near the ₱5,130 gap. The outcome stays "show nothing.")*

For UO-00934 the method is at a genuine dead end — it knows the correct total (₱4,081.77) but can't honestly itemize it. Whether it should display that total as a single summary line ("Unapplied advance — unallocated") instead of showing nothing is the open question with finance; see the "OPEN BUG" section of `soa_breakdown_changes (as of jul 6 2026).md`.

### UO-01166 LR — looks like a limit, but it's a bounced check (fixable at source)

This resident is paying off one large water charge (₱46,463.76) in equal monthly installments of **₱3,930.57**. They have paid **seven**, so their true advance credit is **7 × 3,930.57 = ₱27,513.99**. Yet the Payments tab shows nothing — and at first this looks like the same dead end as UO-00934. It isn't.

**What actually happened:** the 1st installment was paid by a check that **bounced**. Finance re-entered the payment under a new reference number (the "…-2SWA" one) with the corrected check details — but the **original bounced payment was never reversed** in the ledger. So the ledger still credits that 1st installment *twice*.

Because the trusted total is computed *from* the ledger (open charges minus running balance), that double credit inflates it by exactly one installment:

| | Amount |
|---|---|
| What the ledger currently implies (8 installments) | ₱31,444.56 |
| What the resident actually paid (7 installments) | ₱27,513.99 |
| Difference — the un-reversed bounced check | **₱3,930.57** |

The EBT's advance list correctly holds only the **seven real** installments (the bounced one isn't listed). So the app hunts for eight installments' worth of credit against a seven-installment list, no combination fits, and it shows nothing. **The method is working correctly — its input is wrong.**

**The fix is at the source:** finance reverses the bounced check in the EBT ledger (posts the offsetting entry the bounce should have carried). The trusted total then drops to the correct ₱27,513.99, which matches the seven listed installments exactly, and they all surface normally — **no change to the app needed.**

So of the two units, only **UO-00934** is a true limitation of the method. **UO-01166** is a data-entry error that merely mimics one.

---

## 9. One-paragraph summary

The app never trusts the EBT's per-payment "still unapplied" labels, because they go stale. Instead it computes the provable truth from the Statement of Account — open charges minus running balance — and then tries to express that trusted total using the advance payments on the EBT's list, whole items only. When the labels agree, it shows everything (UO-00803). When they overstate, it uses ledger evidence and combination-testing to show the genuine items and hide the phantoms (UO-00050). And when no honest combination exists, it currently shows nothing at all — which is safe, but hides real money (UO-00934, the genuine open bug). A separate case, UO-01166, shows nothing for a different reason entirely — a bounced check left un-reversed in the ledger inflates the trusted total — and is fixed at the source, not in the app.
