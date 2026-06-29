"use client";

import { CATEGORIES, toggleCategoryCodes } from "@/lib/utils/fee-categories";
import type { FeeCategory } from "@/lib/utils/fee-categories";

type CategoryPillsProps = {
  selectedCodes: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function CategoryPills({ selectedCodes, onChange }: CategoryPillsProps) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
        Categories
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((category: FeeCategory) => {
          const isActive =
            selectedCodes.size > 0 &&
            category.codes.every((code) => selectedCodes.has(code));

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(toggleCategoryCodes(selectedCodes, category))}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                isActive
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
