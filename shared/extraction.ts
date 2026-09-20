import { z } from "zod";
import {
  parseMoney,
  reviewSchema,
  type SourceDocument,
  type Review,
  type Application,
} from "./domain.js";
const fact = z
  .object({
    value: z.string().max(160).nullable(),
    quote: z.string().max(500).nullable(),
  })
  .strict();
export const extractionSchema = z
  .object({
    documents: z
      .array(
        z
          .object({
            documentId: z.string(),
            employer: fact,
            grossPay: fact,
            frequency: fact,
            monthlyDebt: fact,
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export function verifyExtraction(
  raw: unknown,
  docs: SourceDocument[],
): Extraction {
  const e = extractionSchema.parse(raw);
  if (
    e.documents.length !== docs.length ||
    new Set(e.documents.map((d) => d.documentId)).size !== docs.length
  )
    throw Error("Document coverage is incomplete.");
  for (const d of e.documents) {
    const source = docs.find((s) => s.id === d.documentId);
    if (!source) throw Error("Unknown source document.");
    for (const f of [d.employer, d.grossPay, d.frequency, d.monthlyDebt]) {
      if (f.value === null) {
        if (f.quote !== null) throw Error("Missing value must have no quote.");
      } else if (!f.quote || !source.content.includes(f.quote))
        throw Error("Source quote is not present in the document.");
    }
  }
  return e;
}
export function reconcile(
  e: Extraction,
  a: Application,
): { draft: Partial<Review>; issues: string[] } {
  const issues: string[] = [];
  const incomes: number[] = [],
    debts: number[] = [],
    employers: string[] = [];
  for (const d of e.documents) {
    if (d.employer.value) employers.push(d.employer.value);
    if (d.grossPay.value) {
      const factor = (
        {
          weekly: 52,
          biweekly: 26,
          semimonthly: 24,
          monthly: 12,
          annually: 1,
        } as Record<string, number>
      )[d.frequency.value?.toLowerCase() || ""];
      try {
        if (!factor) throw Error();
        incomes.push(parseMoney(d.grossPay.value) * factor);
      } catch {
        issues.push("Confirm gross pay and payment frequency.");
      }
    }
    if (d.monthlyDebt.value !== null) {
      try {
        debts.push(parseMoney(d.monthlyDebt.value));
      } catch {
        issues.push("Confirm the monthly debt amount.");
      }
    }
  }
  if (!incomes.length)
    issues.push("No supported gross-income amount was found.");
  if (incomes.length > 1 && Math.max(...incomes) - Math.min(...incomes) > 100)
    issues.push(
      "Income differs between documents. Resolve the discrepancy with source evidence.",
    );
  if (incomes.some((v) => Math.abs(v - a.annualIncomeCents) > 100))
    issues.push("Document income differs from the application declaration.");
  if (!debts.length) issues.push("Monthly debt was not found.");
  if (new Set(debts).size > 1)
    issues.push("Debt amounts conflict between documents.");
  if (debts.some((v) => v !== a.monthlyDebtCents))
    issues.push("Document debt differs from the application declaration.");
  if (!employers.length) issues.push("Employer was not found.");
  if (new Set(employers.map((v) => v.toLowerCase().trim())).size > 1)
    issues.push("Employer names do not agree.");
  return {
    draft: {
      annualIncomeCents: incomes[0] || undefined,
      monthlyDebtCents: debts[0] ?? undefined,
      employer: employers[0] || "",
      note: "",
    },
    issues: [...new Set(issues)],
  };
}
export function preparedExtraction(docs: SourceDocument[]): Extraction {
  const get = (s: string, label: string) => {
    const line = s.split("\n").find((l) => l.startsWith(label + ": "));
    return line
      ? {
          value: line.slice(label.length + 2).replace(/ USD$/, ""),
          quote: line,
        }
      : { value: null, quote: null };
  };
  return verifyExtraction(
    {
      documents: docs.map((d) => ({
        documentId: d.id,
        employer: get(d.content, "Employer"),
        grossPay: get(d.content, "Gross pay"),
        frequency: get(d.content, "Pay frequency"),
        monthlyDebt: get(d.content, "Monthly debt"),
      })),
    },
    docs,
  );
}
export type IntakeView = {
  id: string;
  applicationId: string;
  revision: number;
  checkpoint: string;
  stage: "clarify" | "review" | "complete" | "retry" | "stale";
  documents: SourceDocument[];
  extraction?: Extraction;
  draft: Partial<Review>;
  issues: string[];
  model: string;
};
export { reviewSchema };
