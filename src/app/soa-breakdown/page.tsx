"use client";

import TabNav from "@/components/TabNav";
import { ResidentBreakdownRequest } from "@/components/billing/breakdowns/ResidentBreakdownRequest";
import { SoaBreakdownCredentialsForm } from "@/components/billing/breakdowns/SoaBreakdownCredentialsForm";

export default function SoaBreakdownPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <TabNav />

      <header className="mb-10 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold tracking-tight">SOA Breakdown</h1>
        <p className="mt-1 text-sm text-gray-500">
          Standalone billing breakdown by UO code and district.
        </p>
      </header>

      <div className="space-y-8">
        <SoaBreakdownCredentialsForm />
        <ResidentBreakdownRequest />
      </div>
    </main>
  );
}
