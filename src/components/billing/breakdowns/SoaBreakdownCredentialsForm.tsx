"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  type BreakdownCredentials,
  useSoaBreakdownCredentials,
} from "@/components/providers/SoaBreakdownCredentialProvider";

export function SoaBreakdownCredentialsForm() {
  const { credentials, hasCredentials, isHydrated, saveCredentials } =
    useSoaBreakdownCredentials();
  const [draft, setDraft] = useState<BreakdownCredentials>(credentials);

  useEffect(() => {
    setDraft(credentials);
  }, [credentials]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.bpcode.trim()) return;
    saveCredentials(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Credentials
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Saved locally. Queries use this UO code and district until changed.
          </p>
        </div>
        {isHydrated && hasCredentials && (
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
            Saved
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px_120px]">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            UO Code
          </span>
          <input
            value={draft.bpcode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, bpcode: event.target.value }))
            }
            placeholder="UO-00799"
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

        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Unit No
          </span>
          <input
            value={draft.unitNo ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, unitNo: event.target.value }))
            }
            placeholder="3506"
            className="border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
          />
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
        Save Credentials
      </button>
    </form>
  );
}
