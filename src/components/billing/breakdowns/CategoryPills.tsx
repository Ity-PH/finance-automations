"use client";

import {
  CATEGORIES,
  toggleCategory,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";

export type SourceFilterId = "non_electricity" | "electricity";

const SOURCE_FILTERS: { id: SourceFilterId; label: string }[] = [
  { id: "non_electricity", label: "Dues, Water, & Others" },
  { id: "electricity", label: "Electricity" },
];

export function rowMatchesSourceFilter(
  source: "ledger" | "electricity",
  filters: Set<SourceFilterId>,
): boolean {
  if (filters.size === 0) return true;
  return filters.has(source === "electricity" ? "electricity" : "non_electricity");
}

export function SourceFilterPills({
  selected,
  onChange,
}: {
  selected: Set<SourceFilterId>;
  onChange: (next: Set<SourceFilterId>) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {SOURCE_FILTERS.map((filter) => {
        const isActive = selected.has(filter.id);
        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => {
              const next = new Set(selected);
              if (next.has(filter.id)) {
                next.delete(filter.id);
              } else {
                next.add(filter.id);
              }
              onChange(next);
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              isActive
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

type CategoryPillsProps = {
  selectedCategories: Set<FeeCategoryId>;
  onChange: (next: Set<FeeCategoryId>) => void;
};

export function CategoryPills({
  selectedCategories,
  onChange,
}: CategoryPillsProps) {
  return (
    <div>
      {/* <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">
        Categories
      </label> */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((category) => {
          const isActive = selectedCategories.has(category.id);

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(toggleCategory(selectedCategories, category.id))}
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
