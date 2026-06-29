const BASE_URL = process.env.RESIDENT_BREAKDOWN_BASE_URL ?? "";
const API_KEY = process.env.RESIDENT_BREAKDOWN_API_KEY ?? "";

export type LedgerApiRow = {
  docdate?: string;
  docno?: string;
  doctype?: string;
  debit?: string;
  credit?: string;
  balance?: string;
  remarks?: string;
  refdocs?: string | string[];
};

export type BalanceApiRow = {
  type?: string;
  docno?: string;
  docdate?: string;
  duedate?: string;
  amount?: string;
  dueamount?: string;
  remarks?: string;
};

export type ElectricityApiRow = {
  type?: string;
  docno?: string;
  docdate?: string;
  duedate?: string;
  amount?: string;
  dueamount?: string;
  remarks?: string;
};

type OutstandingResponse = {
  balance: BalanceApiRow[];
  electricity: ElectricityApiRow[];
  ledger: LedgerApiRow[];
};

type PastLedgerResponse = {
  ledger: LedgerApiRow[];
  electricityLedger: LedgerApiRow[];
};

type QueueResponse = {
  depth?: number;
  queue_depth?: number;
  count?: number;
};

class BillingBreakdownRepository {
  async fetchOutstanding(
    bpcode: string,
    district: string,
  ): Promise<OutstandingResponse> {
    return this.fetchExternalJson(
      `/outstanding?bpcode=${encodeURIComponent(bpcode)}&district=${encodeURIComponent(district)}`,
    );
  }

  async fetchPastLedger(
    bpcode: string,
    district: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<PastLedgerResponse> {
    return this.fetchExternalJson(
      `/past-ledger?bpcode=${encodeURIComponent(bpcode)}&district=${encodeURIComponent(district)}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`,
    );
  }

  async fetchElectricityLedger(
    bpcode: string,
    district: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<LedgerApiRow[]> {
    return this.fetchExternalJson(
      `/electricity/ledger?bpcode=${encodeURIComponent(bpcode)}&district=${encodeURIComponent(district)}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`,
    );
  }

  async fetchQueueDepth(): Promise<number> {
    const data = await this.fetchExternalJson<QueueResponse>("/queue");
    return data.depth ?? data.queue_depth ?? data.count ?? 0;
  }

  private async fetchExternalJson<T>(path: string): Promise<T> {
    if (!BASE_URL || !API_KEY) {
      throw new Error(
        "Missing RESIDENT_BREAKDOWN_BASE_URL or RESIDENT_BREAKDOWN_API_KEY.",
      );
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-API-Key": API_KEY },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Breakdown API failed (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }
}

export const billingBreakdownRepository = new BillingBreakdownRepository();
