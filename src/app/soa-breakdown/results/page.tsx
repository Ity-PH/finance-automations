"use client";

import { Suspense } from "react";
import TabNav from "@/components/TabNav";
import { ResidentBreakdownResults } from "@/components/billing/breakdowns/ResidentBreakdownResults";
import { SoaBreakdownCredentialsForm } from "@/components/billing/breakdowns/SoaBreakdownCredentialsForm";
import { useSoaBreakdownCredentials } from "@/components/providers/SoaBreakdownCredentialProvider";

export default function SoaBreakdownResultsPage() {
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
            <ResidentBreakdownResults />
          </Suspense>
        )}
      </div>
    </main>
  );
}
