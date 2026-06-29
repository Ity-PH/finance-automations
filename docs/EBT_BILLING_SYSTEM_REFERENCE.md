# EBT Billing System Reference

Ported from `Two-Serendra-Superapp/ebt_files/EBT_BILLING_SYSTEM_REFERENCE.md`.

## Data Sources

- Ledger is transaction history with running balance. Final ledger balance is authoritative net balance.
- Balance table is current open items. `arinvoice` rows are outstanding fees. `downpayment` rows are payments with remaining unapplied credit.
- `dueamount` is remaining amount. Use it for open invoice display and partial settlement display.

## External API Endpoints

- `GET /outstanding?bpcode=&district=`
- `GET /past-ledger?bpcode=&district=&date_from=&date_to=`
- `GET /electricity/ledger?bpcode=&district=&date_from=&date_to=`
- `GET /queue`

All authenticated calls use `X-API-Key`.

## Document Types

- `ARINVOICE`: fee charged to resident.
- `INCOMINGPAYMENT`: payment received from resident.
- `CREDITMEMO`: reconciliation record linking payments to invoices.
- `ARCREDITMEMO`: invoice reversal credit.
- `JOURNALVOUCHER`: closure record for reversals.
- `OB`: opening balance.

## Logic Preserved In This Port

- Outstanding dues balance, electricity balance, and combined balance.
- Downpayment rows are displayed as uncredited payments.
- Historical payments use incoming payment credits, negated for display.
- Historical fees use AR invoice debits.
- Electricity ledger rows are merged into historical ledger rows and deduped by `docno`.
- Interest code resolution splits `IN` into `IN_DUES`, `IN_WATER_OT`, and `IN_ELEC`.
- Fee categories are Dues & Equity, Water, Electricity, and Others.

## Known EBT Gotchas

- Some towers have buggy `downpayment.dueamount` values. Treat downpayment rows as display context, not authoritative net-balance math.
- Net balance should come from final ledger balance.
- Balance table and ledger can lag each other. Future hardening should union balance-table open invoices with ledger invoices that have no `refdocs`.
- Reversed invoices are closed through `ARCREDITMEMO + JOURNALVOUCHER` and should not be counted as outstanding fees.
- A row can be partially settled. `dueamount < amount` means only the remainder is still open.

## Manual Test Fixture

```txt
bpcode: UO-00799
district: HR
unitNo: 3506
```
