"use client";

import { Suspense } from "react";
import TabNav from "@/components/TabNav";
import { ResidentBreakdownResults } from "@/components/billing/breakdowns/ResidentBreakdownResults";
import { SoaBreakdownCredentialsForm } from "@/components/billing/breakdowns/SoaBreakdownCredentialsForm";

export default function SoaBreakdownResultsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <TabNav />

      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">SOA History</h1>
        <p className="mt-1 text-sm text-gray-500">
          Historical fees and payments for saved credentials.
        </p>
      </header>

      <div className="space-y-8">
        <SoaBreakdownCredentialsForm />
        <Suspense fallback={<p className="text-sm text-gray-500">Loading history...</p>}>
          <ResidentBreakdownResults />
        </Suspense>
      </div>
    </main>
  );
}
