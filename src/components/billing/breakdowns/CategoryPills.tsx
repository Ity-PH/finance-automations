"use client";

import {
  CATEGORIES,
  toggleCategory,
  type FeeCategoryId,
} from "@/lib/utils/fee-categories";

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
