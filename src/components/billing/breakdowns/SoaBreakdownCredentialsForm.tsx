"use client";

import { FormEvent, useState } from "react";
import {
  type BreakdownCredentials,
  useSoaBreakdownCredentials,
} from "@/components/providers/SoaBreakdownCredentialProvider";

const emptyDraft: BreakdownCredentials = {
  bpcode: "",
  district: "HR",
};

export function SoaBreakdownCredentialsForm() {
  const { viewBreakdown } = useSoaBreakdownCredentials();
  const [draft, setDraft] = useState<BreakdownCredentials>(emptyDraft);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.bpcode.trim()) return;
    viewBreakdown(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
        Customer Details
      </h2>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Customer No.
          </span>
          <input
            value={draft.bpcode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, bpcode: event.target.value }))
            }
            className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            District
          </span>
          <select
            value={draft.district}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                district: event.target.value as "LR" | "HR",
              }))
            }
            className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
          >
            <option value="HR">HR</option>
            <option value="LR">LR</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={!draft.bpcode.trim()}
        className={`mt-4 w-full py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
          draft.bpcode.trim()
            ? "cursor-pointer bg-black text-white hover:bg-gray-800"
            : "cursor-not-allowed bg-gray-100 text-gray-300"
        }`}
      >
        View Breakdown
      </button>
    </form>
  );
}
