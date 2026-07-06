import { describe, expect, it } from "vitest";
import {
  filterRowsByCategories,
  rowMatchesCategory,
} from "@/lib/utils/fee-categories";

describe("rowMatchesCategory", () => {
  it("routes primary fee codes to their own categories only", () => {
    expect(rowMatchesCategory({ code: "AD", resolvedCode: "AD" }, "dues")).toBe(
      true,
    );
    expect(rowMatchesCategory({ code: "AD", resolvedCode: "AD" }, "others")).toBe(
      false,
    );
    expect(rowMatchesCategory({ code: "WA", resolvedCode: "WA" }, "water")).toBe(
      true,
    );
    expect(rowMatchesCategory({ code: "WA", resolvedCode: "WA" }, "others")).toBe(
      false,
    );
  });

  it("includes miscellaneous fee codes in Others", () => {
    expect(rowMatchesCategory({ code: "SF", resolvedCode: "SF" }, "others")).toBe(
      true,
    );
    expect(rowMatchesCategory({ code: "CI", resolvedCode: "CI" }, "others")).toBe(
      true,
    );
  });

  it("includes utility interest in both Water and Others", () => {
    const row = { code: "IN", resolvedCode: "IN_WATER_OT" };

    expect(rowMatchesCategory(row, "water")).toBe(true);
    expect(rowMatchesCategory(row, "others")).toBe(true);
    expect(rowMatchesCategory(row, "dues")).toBe(false);
  });

  it("keeps dues and electricity interest out of Others", () => {
    expect(
      rowMatchesCategory({ code: "IN", resolvedCode: "IN_DUES" }, "others"),
    ).toBe(false);
    expect(
      rowMatchesCategory({ code: "IN", resolvedCode: "IN_ELEC" }, "others"),
    ).toBe(false);
  });

  it("includes unclassified interest and unknown codes in Others", () => {
    expect(rowMatchesCategory({ code: "IN", resolvedCode: "IN" }, "others")).toBe(
      true,
    );
    expect(rowMatchesCategory({ code: "ZZ", resolvedCode: "ZZ" }, "others")).toBe(
      true,
    );
  });
});

describe("filterRowsByCategories", () => {
  const rows = [
    { code: "AD", resolvedCode: "AD", id: "dues" },
    { code: "WA", resolvedCode: "WA", id: "water" },
    { code: "IN", resolvedCode: "IN_WATER_OT", id: "water-interest" },
    { code: "SF", resolvedCode: "SF", id: "sports" },
  ];

  it("returns all rows when no categories are selected", () => {
    expect(filterRowsByCategories(rows, new Set())).toHaveLength(4);
  });

  it("matches rows from any selected category", () => {
    const filtered = filterRowsByCategories(rows, new Set(["water", "others"]));

    expect(filtered.map((row) => row.id)).toEqual([
      "water",
      "water-interest",
      "sports",
    ]);
  });
});
