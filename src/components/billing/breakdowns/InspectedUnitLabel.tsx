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
