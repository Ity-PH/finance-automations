import { z } from "zod";
import { parseApiDate } from "@/lib/utils/breakdown-date-utils";

export const BreakdownKindSchema = z.enum(["fee", "payment"]);

export const ResidentDateRangeSchema = z.enum([
  "lastMonth",
  "last3Months",
  "last6Months",
  "year",
  "all",
]);

export const DistrictSchema = z.enum(["LR", "HR"]);

export const ResidentBreakdownRowSchema = z.object({
  source: z.enum(["ledger", "electricity"]),
  docdate: z.string(),
  duedate: z.string().optional(),
  docno: z.string(),
  doctype: z.string(),
  code: z.string(),
  resolvedCode: z.string(),
  kind: BreakdownKindSchema,
  amount: z.number(),
  amountLabel: z.string(),
  paidAmount: z.number().optional(),
  balance: z.string().optional(),
  remarks: z.string(),
});

export const ResidentLedgerMetaSchema = z.object({
  unitNo: z.string(),
  bpcode: z.string(),
  balance: z.string(),
  dueDate: z.string(),
  lastPaymentAmount: z.string(),
  lastPaymentDate: z.string(),
  duesBalance: z.string().optional(),
  electricityBalance: z.string().optional(),
  duesDueDate: z.string().optional(),
  electricityDueDate: z.string().optional(),
  duesLastPaymentDate: z.string().optional(),
  electricityLastPaymentDate: z.string().optional(),
  duesDerivedFloatingCredit: z.string().optional(),
  electricityDerivedFloatingCredit: z.string().optional(),
  duesFloatingCreditReconciliation: z
    .enum(["all", "subset", "aggregate_only", "none"])
    .optional(),
  electricityFloatingCreditReconciliation: z
    .enum(["all", "subset", "aggregate_only", "none"])
    .optional(),
});

export const ResidentLedgerResponseSchema = z.object({
  rows: z.array(ResidentBreakdownRowSchema),
  meta: ResidentLedgerMetaSchema,
});

const booleanQueryParam = z.preprocess(
  (value) => value === "true",
  z.boolean(),
);
const apiDate = z.string().refine((value) => parseApiDate(value) !== null, {
  message: "Expected MM/DD/YYYY.",
});

export const ResidentFeesQuerySchema = z
  .object({
    bpcode: z.string().trim().min(1),
    district: DistrictSchema,
    unit_no: z.string().trim().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    include_electricity: booleanQueryParam.default(false),
    balance_only: booleanQueryParam.default(false),
    outstanding_view: booleanQueryParam.default(false),
  })
  .superRefine((value, ctx) => {
    if (value.balance_only || value.outstanding_view) return;

    if (!value.date_from || !parseApiDate(value.date_from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valid date_from is required in MM/DD/YYYY format.",
        path: ["date_from"],
      });
    }

    if (!value.date_to || !parseApiDate(value.date_to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valid date_to is required in MM/DD/YYYY format.",
        path: ["date_to"],
      });
    }
  });

export const ResidentLedgerQuerySchema = z.object({
  bpcode: z.string().trim().min(1),
  district: DistrictSchema,
  unit_no: z.string().trim().optional(),
  date_from: apiDate,
  date_to: apiDate,
  kind: BreakdownKindSchema,
});

export type District = z.infer<typeof DistrictSchema>;
export type BreakdownKind = z.infer<typeof BreakdownKindSchema>;
export type ResidentDateRange = z.infer<typeof ResidentDateRangeSchema>;
export type ResidentBreakdownRow = z.infer<typeof ResidentBreakdownRowSchema>;
export type ResidentLedgerMeta = z.infer<typeof ResidentLedgerMetaSchema>;
export type ResidentLedgerResponse = z.infer<
  typeof ResidentLedgerResponseSchema
>;
export type ResidentFeesQuery = z.infer<typeof ResidentFeesQuerySchema>;
export type ResidentLedgerQuery = z.infer<typeof ResidentLedgerQuerySchema>;
