import { z } from "zod";
export const stages = [
  "new",
  "review",
  "awaiting",
  "underwriting",
  "approved",
  "declined",
] as const;
export const stageLabels: Record<Stage, string> = {
  new: "New applications",
  review: "Document review",
  awaiting: "Awaiting borrower",
  underwriting: "Decision review",
  approved: "Approved",
  declined: "Declined",
};
export type Stage = (typeof stages)[number];
export const products = [
  "Personal",
  "Auto",
  "Home improvement",
  "Debt consolidation",
] as const;
export const kinds = ["income", "employment", "liabilities"] as const;
export const kindLabels = {
  income: "Income statement",
  employment: "Employment letter",
  liabilities: "Debt summary",
};
export const text = z.string().trim().min(1).max(160);
export const money = z.number().int().min(0).max(100000000);
export const inputSchema = z
  .object({
    name: text,
    product: z.enum(products),
    amountCents: money.min(100000),
    termMonths: z.union([
      z.literal(24),
      z.literal(36),
      z.literal(48),
      z.literal(60),
    ]),
    annualIncomeCents: money.min(100),
    monthlyDebtCents: money,
    purpose: z.string().trim().min(3).max(300),
  })
  .strict();
export const documentSchema = z
  .object({
    kind: z.enum(kinds),
    title: text,
    content: z.string().trim().min(20).max(12000),
  })
  .strict();
export type DocumentInput = z.infer<typeof documentSchema>;
export type SourceDocument = DocumentInput & {
  id: string;
  receivedAt: string;
  actor: string;
};
export const reviewSchema = z
  .object({
    annualIncomeCents: money.min(100),
    monthlyDebtCents: money,
    employer: text,
    note: z.string().trim().min(10).max(1000),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
export type Application = z.infer<typeof inputSchema> & {
  id: string;
  stage: Stage;
  revision: number;
  submittedAt: string;
  documents: SourceDocument[];
  requested: string;
  verified: (Review & { revision: number; at: string; method: string }) | null;
  decisionNote: string;
  events: { at: string; actor: string; text: string }[];
};
export type Workspace = {
  version: number;
  generation: string;
  applications: Application[];
};
export class RuleError extends Error {}
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), input: inputSchema }).strict(),
  z
    .object({ type: z.literal("document"), id: text, document: documentSchema })
    .strict(),
  z.object({ type: z.literal("submit"), id: text }).strict(),
  z
    .object({
      type: z.literal("request"),
      id: text,
      note: z.string().trim().min(10).max(600),
    })
    .strict(),
  z
    .object({
      type: z.literal("verify"),
      id: text,
      revision: z.number().int(),
      review: reviewSchema,
    })
    .strict(),
  z.object({ type: z.literal("advance"), id: text }).strict(),
  z
    .object({
      type: z.literal("decision"),
      id: text,
      decision: z.enum(["approved", "declined"]),
      note: z.string().trim().min(10).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("reopen"),
      id: text,
      note: z.string().trim().min(10).max(600),
    })
    .strict(),
  z.object({ type: z.literal("reset") }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export function find(w: Workspace, id: string) {
  const a = w.applications.find((a) => a.id === id);
  if (!a) throw new RuleError("Application unavailable in this workspace.");
  return a;
}
export function ensureReview(a: Application) {
  if (!["new", "review", "awaiting"].includes(a.stage))
    throw new RuleError(
      "Reopen this application before changing its documents.",
    );
}
export function ready(a: Application) {
  return kinds.every((k) => a.documents.some((d) => d.kind === k));
}
export function apply(
  w: Workspace,
  raw: Command,
  actor = "Reviewer",
  method = "Manual review",
): Workspace {
  const c = commandSchema.parse(raw);
  if (c.type === "reset") return { ...seed(), version: w.version + 1 };
  const n = structuredClone(w);
  const at = new Date().toISOString();
  if (c.type === "create") {
    if (n.applications.length >= 30)
      throw new RuleError(
        "This demo supports 30 applications. Reset to start again.",
      );
    n.applications.unshift({
      ...c.input,
      id: crypto.randomUUID(),
      stage: "new",
      revision: 0,
      submittedAt: at,
      documents: [],
      requested: "",
      verified: null,
      decisionNote: "",
      events: [{ at, actor, text: "Application opened" }],
    });
  } else {
    const a = find(n, c.id);
    let event = "";
    if (c.type === "document") {
      ensureReview(a);
      a.documents = a.documents.filter((d) => d.kind !== c.document.kind);
      a.documents.push({
        ...c.document,
        id: crypto.randomUUID(),
        receivedAt: at,
        actor,
      });
      a.revision++;
      a.verified = null;
      event = kindLabels[c.document.kind] + " received";
    }
    if (c.type === "submit") {
      ensureReview(a);
      if (!ready(a))
        throw new RuleError("Add all three document types before submitting.");
      a.stage = "review";
      a.requested = "";
      event = "Documents submitted for review";
    }
    if (c.type === "request") {
      ensureReview(a);
      a.stage = "awaiting";
      a.revision++;
      a.requested = c.note;
      a.verified = null;
      event = "Requested clarification: " + c.note;
    }
    if (c.type === "verify") {
      ensureReview(a);
      if (!ready(a))
        throw new RuleError("All three document types are required.");
      if (c.revision !== a.revision)
        throw new RuleError("Documents changed. Start a fresh review.");
      a.revision++;
      a.verified = { ...c.review, revision: a.revision, at, method };
      a.stage = "review";
      a.requested = "";
      event = method + " completed. Facts confirmed by reviewer.";
    }
    if (c.type === "advance") {
      if (
        a.stage !== "review" ||
        !a.verified ||
        a.verified.revision !== a.revision
      )
        throw new RuleError(
          "Confirm current document facts before decision review.",
        );
      a.stage = "underwriting";
      event = "Sent to decision review";
    }
    if (c.type === "decision") {
      if (
        a.stage !== "underwriting" ||
        !a.verified ||
        a.verified.revision !== a.revision
      )
        throw new RuleError("Complete document and decision review first.");
      a.stage = c.decision;
      a.decisionNote = c.note;
      event = "Simulated " + c.decision + " decision recorded: " + c.note;
    }
    if (c.type === "reopen") {
      if (!["approved", "declined", "underwriting"].includes(a.stage))
        throw new RuleError("This application is already open for review.");
      a.stage = "review";
      a.revision++;
      a.verified = null;
      a.decisionNote = "";
      event = "Reopened for review: " + c.note;
    }
    a.events.push({ at, actor, text: event });
  }
  n.version++;
  return n;
}
export const formatMoney = (v: number, dp = 0) =>
  (v / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
export function parseMoney(v: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v.trim()))
    throw new RuleError("Enter a valid USD amount.");
  return money.parse(Math.round(Number(v) * 100));
}
export function payment(principal: number, apr: number, months: number) {
  if (!Number.isFinite(apr) || apr < 0 || months <= 0)
    throw new RuleError("Invalid payment inputs.");
  const r = apr / 1200;
  return Math.round(
    r === 0
      ? principal / months
      : (principal * r) / (1 - Math.pow(1 + r, -months)),
  );
}
export function metrics(a: Application) {
  const income = a.verified?.annualIncomeCents ?? a.annualIncomeCents;
  const debt = a.verified?.monthlyDebtCents ?? a.monthlyDebtCents;
  const monthly = payment(a.amountCents, 9.9, a.termMonths);
  return {
    monthly,
    apr: 9.9,
    dti: income > 0 ? (debt + monthly) / (income / 12) : null,
    verified: !!a.verified,
  };
}
export function exampleDocuments(
  name = "Alex Morgan",
  conflict = false,
): DocumentInput[] {
  return [
    {
      kind: "income",
      title: "September pay statement",
      content: `FICTIONAL DEMO DOCUMENT\nEmployee: ${name}\nEmployer: Cedar Works\nGross pay: 4000.00 USD\nPay frequency: monthly\nPeriod: September 2026`,
    },
    {
      kind: "employment",
      title: "Employment confirmation",
      content: `FICTIONAL DEMO DOCUMENT\nEmployee: ${name}\nEmployer: Cedar Works\nGross pay: ${conflict ? "52000.00" : "48000.00"} USD\nPay frequency: annually\nStatus: Full-time\nRole: Operations coordinator`,
    },
    {
      kind: "liabilities",
      title: "Monthly obligations",
      content: `FICTIONAL DEMO DOCUMENT\nApplicant: ${name}\nMonthly debt: 650.00 USD\nIncludes existing installment and revolving minimum payments.\nThis is a prepared fictional statement, not a credit report.`,
    },
  ];
}
export function seed(): Workspace {
  const names = [
    "Alex Morgan",
    "Jamie Ellis",
    "Taylor Quinn",
    "Casey Brooks",
    "Riley Parker",
    "Jordan Lane",
    "Avery Reed",
    "Drew Hayes",
  ];
  const ss: Stage[] = [
    "review",
    "new",
    "awaiting",
    "underwriting",
    "review",
    "approved",
    "new",
    "declined",
  ];
  return {
    version: 0,
    generation: crypto.randomUUID(),
    applications: names.map((name, i) => {
      const at = new Date(Date.now() - (i + 1) * 86400000).toISOString();
      const docs =
        i === 1 || i === 6
          ? []
          : exampleDocuments(name, i === 0).map((d) => ({
              ...d,
              id: crypto.randomUUID(),
              receivedAt: at,
              actor: "Demo fixture",
            }));
      const verified = ["underwriting", "approved", "declined"].includes(ss[i])
        ? {
            annualIncomeCents: 4800000,
            monthlyDebtCents: 65000,
            employer: "Cedar Works",
            note: "Prepared fictional review for the demonstration.",
            revision: docs.length,
            at,
            method: "Prepared example",
          }
        : null;
      return {
        id: "OR-" + (2401 + i),
        name,
        product: products[i % 4],
        amountCents: (12 + i * 3) * 100000,
        termMonths: 48,
        purpose:
          "Fictional " +
          [
            "home project",
            "vehicle purchase",
            "personal project",
            "debt consolidation",
          ][i % 4],
        annualIncomeCents: 4800000,
        monthlyDebtCents: 65000,
        stage: ss[i],
        revision: docs.length,
        submittedAt: at,
        documents: docs,
        requested:
          ss[i] === "awaiting"
            ? "Please confirm the employer name and provide an updated employment letter."
            : "",
        verified,
        decisionNote: ["approved", "declined"].includes(ss[i])
          ? "Prepared example decision for this fictional application."
          : "",
        events: [
          { at, actor: "Demo fixture", text: "Fictional application prepared" },
        ],
      };
    }),
  };
}
export function borrowerView(w: Workspace, id: string) {
  const a = find(w, id);
  return {
    version: w.version,
    application: {
      id: a.id,
      name: a.name,
      product: a.product,
      amountCents: a.amountCents,
      termMonths: a.termMonths,
      purpose: a.purpose,
      stage: a.stage,
      documents: a.documents,
      requested: a.requested,
    },
  };
}
export type BorrowerView = ReturnType<typeof borrowerView>;
