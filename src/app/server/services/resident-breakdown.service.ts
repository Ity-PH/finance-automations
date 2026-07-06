import {
  billingBreakdownRepository,
  type BalanceApiRow,
  type ElectricityApiRow,
  type LedgerApiRow,
} from "@/app/server/repositories/billing-breakdown.repo";
import {
  computePastLedgerDateRange,
  reconcileLane,
  toUncreditedPaymentRows,
  type ReconcileLaneResult,
} from "@/lib/billing/floating-balance";
import { codeFromDocNo, resolveInterestCode } from "@/lib/utils/code-utils";
import { isAdjustmentArinvoiceRemarks } from "@/lib/utils/balance-row-utils";
import { parseApiDate } from "@/lib/utils/breakdown-date-utils";
import {
  formatCurrency,
  parseMoney,
} from "@/lib/utils/breakdown-format-utils";
import type { ServiceResponse } from "@/types/service";
import type {
  BreakdownKind,
  ResidentBreakdownRow,
  ResidentLedgerResponse,
} from "@/lib/schema/resident-breakdown.schema";

type UnitCredentials = { bpcode: string; district: string; unitNo: string };

type GetFeesParams = UnitCredentials & {
  dateFrom?: string;
  dateTo?: string;
  includeElectricity: boolean;
  balanceOnly: boolean;
  outstandingView: boolean;
};

type GetPastLedgerParams = UnitCredentials & {
  dateFrom: string;
  dateTo: string;
  kind: BreakdownKind;
};

class ResidentBreakdownService {
  async getFees(
    params: GetFeesParams,
  ): Promise<ServiceResponse<ResidentLedgerResponse>> {
    try {
      const { bpcode, district, unitNo } = params;
      const start = params.dateFrom ? parseApiDate(params.dateFrom) : null;
      const end = params.dateTo ? parseApiDate(params.dateTo) : null;

      if (params.outstandingView) {
        const today = new Date();
        const fiveYearsAgo = new Date(today);
        fiveYearsAgo.setFullYear(today.getFullYear() - 5);
        const elecDateFrom = `${String(fiveYearsAgo.getMonth() + 1).padStart(2, "0")}/${String(fiveYearsAgo.getDate()).padStart(2, "0")}/${fiveYearsAgo.getFullYear()}`;
        const elecDateTo = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

        const [outstandingData, electricityLedgerRows] = await Promise.all([
          billingBreakdownRepository.fetchOutstanding(bpcode, district),
          billingBreakdownRepository
            .fetchElectricityLedger(bpcode, district, elecDateFrom, elecDateTo)
            .catch(() => [] as LedgerApiRow[]),
        ]);

        const {
          balance: balanceRows,
          electricity: electricityRows,
          ledger: ledgerRows,
        } = outstandingData;

        const duesFeeRows = balanceRows.filter(
          (row) => (row.type ?? "").toLowerCase() === "arinvoice",
        );
        const duesPaymentRows = balanceRows.filter(
          (row) => (row.type ?? "").toLowerCase() === "downpayment",
        );
        const electricityFeeRows = electricityRows.filter(
          (row) => (row.type ?? "").toLowerCase() === "arinvoice",
        );
        const electricityPaymentRows = electricityRows.filter(
          (row) => (row.type ?? "").toLowerCase() === "downpayment",
        );

        let duesReconciliation = reconcileLane({
          feeRows: duesFeeRows,
          paymentCandidateRows: duesPaymentRows,
          ledgerRows,
          source: "ledger",
        });
        let electricityReconciliation = reconcileLane({
          feeRows: electricityFeeRows,
          paymentCandidateRows: electricityPaymentRows,
          ledgerRows: electricityLedgerRows,
          source: "electricity",
        });

        let pastLedgerFetched = false;
        let pastLedgerRange: { dateFrom: string; dateTo: string } | undefined;

        if (
          duesReconciliation.needsPastLedger ||
          electricityReconciliation.needsPastLedger
        ) {
          const candidatesForRange = [
            ...(duesReconciliation.needsPastLedger ? duesPaymentRows : []),
            ...(electricityReconciliation.needsPastLedger
              ? electricityPaymentRows
              : []),
          ];
          const feeRowsForRange = [
            ...(duesReconciliation.needsPastLedger ? duesFeeRows : []),
            ...(electricityReconciliation.needsPastLedger
              ? electricityFeeRows
              : []),
          ];

          pastLedgerRange = computePastLedgerDateRange(
            candidatesForRange,
            feeRowsForRange,
          );
          const pastLedger = await billingBreakdownRepository.fetchPastLedger(
            bpcode,
            district,
            pastLedgerRange.dateFrom,
            pastLedgerRange.dateTo,
          );
          pastLedgerFetched = true;

          if (duesReconciliation.needsPastLedger) {
            duesReconciliation = reconcileLane({
              feeRows: duesFeeRows,
              paymentCandidateRows: duesPaymentRows,
              ledgerRows,
              pastLedgerRows: pastLedger.ledger,
              source: "ledger",
            });
          }

          if (electricityReconciliation.needsPastLedger) {
            electricityReconciliation = reconcileLane({
              feeRows: electricityFeeRows,
              paymentCandidateRows: electricityPaymentRows,
              ledgerRows: electricityLedgerRows,
              pastLedgerRows: pastLedger.electricityLedger,
              source: "electricity",
            });
          }
        }

        this.logFloatingBalanceReconciliation(
          "dues",
          bpcode,
          duesReconciliation,
          pastLedgerFetched,
          pastLedgerRange,
        );
        this.logFloatingBalanceReconciliation(
          "electricity",
          bpcode,
          electricityReconciliation,
          pastLedgerFetched,
          pastLedgerRange,
        );

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

        const lastLedgerRow = [...ledgerRows]
          .reverse()
          .find((row) => row.balance);
        const duesBalance = parseMoney(lastLedgerRow?.balance);

        const lastElecLedgerRow = [...electricityLedgerRows]
          .reverse()
          .find((row) => row.balance);
        const electricityBalance = parseMoney(lastElecLedgerRow?.balance);
        const combinedBalance = duesBalance + electricityBalance;

        const lastBalanceRow = this.getLastArinvoiceBalanceRow(balanceRows);
        const lastElecBalanceRow = this.getLastArinvoiceRow(electricityRows);

        const lastPaymentRow = [...ledgerRows]
          .reverse()
          .find(
            (row) => (row.doctype ?? "").toLowerCase() === "incomingpayment",
          );
        const lastElecPaymentRow = [...electricityLedgerRows]
          .reverse()
          .find(
            (row) => (row.doctype ?? "").toLowerCase() === "incomingpayment",
          );

        return {
          success: true,
          data: {
            rows: params.balanceOnly ? [] : normalizedRows,
            meta: {
              unitNo,
              bpcode,
              balance: formatCurrency(combinedBalance),
              dueDate: lastBalanceRow?.duedate ?? lastBalanceRow?.docdate ?? "",
              lastPaymentAmount: "0.00",
              lastPaymentDate: lastPaymentRow?.docdate ?? "",
              duesBalance: formatCurrency(duesBalance),
              electricityBalance: formatCurrency(electricityBalance),
              duesDueDate:
                lastBalanceRow?.duedate ?? lastBalanceRow?.docdate ?? "",
              electricityDueDate:
                lastElecBalanceRow?.duedate ??
                lastElecBalanceRow?.docdate ??
                "",
              duesLastPaymentDate: lastPaymentRow?.docdate ?? "",
              electricityLastPaymentDate: lastElecPaymentRow?.docdate ?? "",
              duesDerivedFloatingCredit: formatCurrency(
                duesReconciliation.derivedCredit,
              ),
              electricityDerivedFloatingCredit: formatCurrency(
                electricityReconciliation.derivedCredit,
              ),
              duesFloatingCreditReconciliation: duesReconciliation.mode,
              electricityFloatingCreditReconciliation:
                electricityReconciliation.mode,
            },
          },
        };
      }

      const {
        balance: balanceRows,
        electricity: electricityRows,
        ledger: ledgerRows,
      } = await billingBreakdownRepository.fetchOutstanding(bpcode, district);
      const normalizedRows = this.normalizeBalanceRows(balanceRows, start, end);

      if (params.includeElectricity || params.balanceOnly) {
        normalizedRows.push(
          ...this.normalizeElectricityRows(electricityRows, start, end),
        );
      }

      const lastLedgerRow = [...ledgerRows]
        .reverse()
        .find((row) => row.balance);
      const outstandingBalance = parseMoney(lastLedgerRow?.balance);
      const lastBalanceRow = this.getLastArinvoiceBalanceRow(balanceRows);

      return {
        success: true,
        data: {
          rows: params.balanceOnly ? [] : normalizedRows,
          meta: {
            unitNo,
            bpcode,
            balance: formatCurrency(outstandingBalance),
            dueDate: lastBalanceRow?.duedate ?? lastBalanceRow?.docdate ?? "",
            lastPaymentAmount: "0.00",
            lastPaymentDate: "",
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch resident fees.";
      return { success: false, error: message };
    }
  }

  async getPastLedger(
    params: GetPastLedgerParams,
  ): Promise<ServiceResponse<ResidentLedgerResponse>> {
    try {
      const { bpcode, district, unitNo } = params;
      const { ledger: ledgerRows, electricityLedger: electricityRows } =
        await billingBreakdownRepository.fetchPastLedger(
          bpcode,
          district,
          params.dateFrom,
          params.dateTo,
        );
      const normalizedRows = this.normalizeLedgerRows(ledgerRows, params.kind);

      const electricityNormalized = this.normalizeLedgerRows(
        electricityRows,
        params.kind,
        "electricity",
      );

      const existingDocNos = new Set(normalizedRows.map((row) => row.docno));
      for (const row of electricityNormalized) {
        if (!existingDocNos.has(row.docno)) {
          normalizedRows.push(row);
        }
      }

      normalizedRows.sort((a, b) => {
        const dateA =
          parseApiDate(a.docdate || a.duedate || "")?.getTime() ?? 0;
        const dateB =
          parseApiDate(b.docdate || b.duedate || "")?.getTime() ?? 0;
        return dateB - dateA;
      });

      return {
        success: true,
        data: {
          rows: normalizedRows,
          meta: this.buildLedgerMeta(ledgerRows, unitNo, bpcode),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch resident ledger.";
      return { success: false, error: message };
    }
  }

  async getHistoricalFees(
    credentials: UnitCredentials,
    dateFrom: string,
    dateTo: string,
  ): Promise<ServiceResponse<ResidentLedgerResponse>> {
    return this.getPastLedger({
      ...credentials,
      dateFrom,
      dateTo,
      kind: "fee",
    });
  }

  async getHistoricalPayments(
    credentials: UnitCredentials,
    dateFrom: string,
    dateTo: string,
  ): Promise<ServiceResponse<ResidentLedgerResponse>> {
    return this.getPastLedger({
      ...credentials,
      dateFrom,
      dateTo,
      kind: "payment",
    });
  }

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
      .map((row) => {
        const selectedAmount = row.dueamount || row.amount || "0";
        const amount = parseMoney(selectedAmount);
        const code = codeFromDocNo(row.docno ?? "");
        const remarks = row.remarks ?? "";

        return {
          source: "ledger",
          docdate: row.docdate ?? "",
          duedate: row.duedate ?? "",
          docno: row.docno ?? "",
          doctype: row.type ?? "",
          code,
          resolvedCode: resolveInterestCode(code, remarks, "ledger"),
          kind: "fee",
          amount,
          amountLabel: selectedAmount,
          remarks,
        };
      });
  }

  private normalizeElectricityRows(
    rows: ElectricityApiRow[],
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
      .map((row) => {
        const selectedAmount = row.dueamount || row.amount || "0";
        const amount = parseMoney(selectedAmount);

        return {
          source: "electricity",
          docdate: row.docdate ?? "",
          duedate: row.duedate ?? "",
          docno: row.docno ?? "",
          doctype: row.type ?? "",
          code: "EL",
          resolvedCode: "EL",
          kind: "fee",
          amount,
          amountLabel: selectedAmount,
          remarks: row.remarks ?? "",
        };
      });
  }

  private normalizeLedgerRows(
    rows: LedgerApiRow[],
    kind: BreakdownKind,
    source: "ledger" | "electricity" = "ledger",
  ): ResidentBreakdownRow[] {
    const normalizedRows: ResidentBreakdownRow[] = [];

    if (kind === "payment") {
      rows
        .filter(
          (row) => (row.doctype ?? "").toLowerCase() === "incomingpayment",
        )
        .forEach((row) => {
          const creditAmount = parseMoney(row.credit);
          const base = this.buildLedgerBase(row, source);

          if (creditAmount !== 0) {
            normalizedRows.push({
              ...base,
              kind: "payment",
              amount: -creditAmount,
              amountLabel: `-${row.credit ?? ""}`,
            });
          }
        });

      return normalizedRows;
    }

    rows
      .filter((row) => (row.doctype ?? "").toLowerCase() === "arinvoice")
      .forEach((row) => {
        const debitAmount = parseMoney(row.debit);
        const base = this.buildLedgerBase(row, source);

        if (debitAmount !== 0) {
          normalizedRows.push({
            ...base,
            kind: "fee",
            amount: debitAmount,
            amountLabel: row.debit ?? "",
          });
        }
      });

    return normalizedRows;
  }

  private buildLedgerBase(row: LedgerApiRow, source: "ledger" | "electricity") {
    const code = codeFromDocNo(row.docno ?? "");
    const remarks = row.remarks ?? "";

    return {
      source,
      docdate: row.docdate ?? "",
      docno: row.docno ?? "",
      doctype: row.doctype ?? "",
      code,
      resolvedCode: resolveInterestCode(code, remarks, source),
      balance: row.balance ?? "",
      remarks,
    };
  }

  private buildLedgerMeta(
    ledgerRows: LedgerApiRow[],
    unitNo: string,
    bpcode: string,
  ): ResidentLedgerResponse["meta"] {
    const lastLedgerRow = [...ledgerRows].reverse().find((row) => row.balance);
    const lastPaymentRow = [...ledgerRows]
      .reverse()
      .find((row) => parseMoney(row.credit) > 0);

    return {
      unitNo,
      bpcode,
      balance: lastLedgerRow?.balance ?? "0.00",
      dueDate: "",
      lastPaymentAmount: lastPaymentRow?.credit ?? "0.00",
      lastPaymentDate: lastPaymentRow?.docdate ?? "",
    };
  }

  private isArinvoice(row: { type?: string }): boolean {
    return (row.type ?? "").toLowerCase() === "arinvoice";
  }

  private getLastArinvoiceBalanceRow(
    rows: BalanceApiRow[],
  ): BalanceApiRow | undefined {
    return [...rows].reverse().find((row) => this.isArinvoice(row));
  }

  private getLastArinvoiceRow(
    rows: { type?: string; duedate?: string; docdate?: string }[],
  ): { type?: string; duedate?: string; docdate?: string } | undefined {
    return [...rows].reverse().find((row) => this.isArinvoice(row));
  }

  private isDownpayment(row: { type?: string }): boolean {
    return (row.type ?? "").toLowerCase() === "downpayment";
  }

  private normalizeDownpaymentRows(
    rows: BalanceApiRow[],
  ): ResidentBreakdownRow[] {
    return rows
      .filter((row) => this.isDownpayment(row))
      .map((row) => {
        const notYetApplied = row.dueamount || "0";
        const originalPaid = row.amount || "0";
        const amount = parseMoney(notYetApplied);
        const paidAmount = parseMoney(originalPaid);
        const code = codeFromDocNo(row.docno ?? "");
        const remarks = row.remarks ?? "";

        return {
          source: "ledger" as const,
          docdate: row.docdate ?? "",
          duedate: row.duedate ?? "",
          docno: row.docno ?? "",
          doctype: row.type ?? "",
          code,
          resolvedCode: resolveInterestCode(code, remarks, "ledger"),
          kind: "payment" as const,
          amount: -Math.abs(amount),
          amountLabel: `-${notYetApplied}`,
          paidAmount: Math.abs(paidAmount),
          remarks,
        };
      });
  }

  private normalizeElectricityDownpaymentRows(
    rows: ElectricityApiRow[],
  ): ResidentBreakdownRow[] {
    return rows
      .filter((row) => this.isDownpayment(row))
      .map((row) => {
        const notYetApplied = row.dueamount || "0";
        const originalPaid = row.amount || "0";
        const amount = parseMoney(notYetApplied);
        const paidAmount = parseMoney(originalPaid);

        return {
          source: "electricity" as const,
          docdate: row.docdate ?? "",
          duedate: row.duedate ?? "",
          docno: row.docno ?? "",
          doctype: row.type ?? "",
          code: "EL",
          resolvedCode: "EL",
          kind: "payment" as const,
          amount: -Math.abs(amount),
          amountLabel: `-${notYetApplied}`,
          paidAmount: Math.abs(paidAmount),
          remarks: row.remarks ?? "",
        };
      });
  }

  private logFloatingBalanceReconciliation(
    lane: "dues" | "electricity",
    bpcode: string,
    result: ReconcileLaneResult,
    pastLedgerFetched: boolean,
    pastLedgerRange?: { dateFrom: string; dateTo: string },
  ): void {
    console.info("[floating-balance]", {
      lane,
      bpcode,
      candidateSum: result.candidateSum,
      derivedCredit: result.derivedCredit,
      mode: result.mode,
      displayed: result.displayed.map((row) => row.docno),
      hidden: result.hidden.map((row) => row.docno),
      pastLedgerFetched,
      pastLedgerRange,
    });
  }

  private isInDateRange(
    row: { duedate?: string; docdate?: string },
    start: Date | null,
    end: Date | null,
  ): boolean {
    const rowDate = parseApiDate(row.duedate || row.docdate || "");
    if (!rowDate || !start || !end) return true;
    return rowDate >= start && rowDate <= end;
  }
}

export const residentBreakdownService = new ResidentBreakdownService();
