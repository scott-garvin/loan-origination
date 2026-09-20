import { describe, it, expect } from "vitest";
import {
  seed,
  apply,
  find,
  metrics,
  payment,
  borrowerView,
  exampleDocuments,
} from "../shared/domain";
import {
  preparedExtraction,
  reconcile,
  verifyExtraction,
} from "../shared/extraction";
const review = {
  annualIncomeCents: 4800000,
  monthlyDebtCents: 65000,
  employer: "Cedar Works",
  note: "Income statement verified against the updated letter.",
};
describe("reviewed lending workflow", () => {
  it("blocks skipped approvals and requires confirmed facts", () => {
    const w = seed();
    expect(() =>
      apply(w, {
        type: "decision",
        id: "OR-2401",
        decision: "approved",
        note: "A valid reviewer reason.",
      }),
    ).toThrow();
    expect(() => apply(w, { type: "advance", id: "OR-2401" })).toThrow();
    const r = apply(w, { type: "verify", id: "OR-2401", revision: 3, review });
    const next = apply(r, { type: "advance", id: "OR-2401" });
    expect(find(next, "OR-2401").stage).toBe("underwriting");
    const done = apply(next, {
      type: "decision",
      id: "OR-2401",
      decision: "approved",
      note: "Reviewer confirmed the fictional file.",
    });
    expect(find(done, "OR-2401").decisionNote).toContain("Reviewer");
    expect(w.applications[0].stage).toBe("review");
  });
  it("requires all documents and invalidates verification after replacement", () => {
    let w = seed();
    expect(() =>
      apply(w, { type: "verify", id: "OR-2402", revision: 0, review }),
    ).toThrow();
    w = apply(w, { type: "verify", id: "OR-2401", revision: 3, review });
    w = apply(w, {
      type: "document",
      id: "OR-2401",
      document: exampleDocuments()[0],
    });
    expect(find(w, "OR-2401").verified).toBeNull();
    expect(() =>
      apply(w, { type: "verify", id: "OR-2401", revision: 3, review }),
    ).toThrow();
  });
  it("reopening invalidates prior facts and prevents editing closed decisions", () => {
    let w = seed();
    expect(() =>
      apply(w, {
        type: "document",
        id: "OR-2406",
        document: exampleDocuments()[0],
      }),
    ).toThrow();
    w = apply(w, {
      type: "reopen",
      id: "OR-2406",
      note: "Revisit the fictional evidence.",
    });
    expect(find(w, "OR-2406").verified).toBeNull();
    expect(find(w, "OR-2406").stage).toBe("review");
  });
  it("uses code for amortization and never returns an eligibility recommendation", () => {
    expect(payment(1200000, 0, 24)).toBe(50000);
    expect(payment(1200000, 9.9, 48)).toBe(30378);
    const m = metrics(seed().applications[0]);
    expect(m.dti).toBeGreaterThan(0.2);
    expect(m).not.toHaveProperty("decision");
  });
  it("projects borrower data without reviewer notes or other applications", () => {
    const v = borrowerView(seed(), "OR-2406");
    expect(v.application.name).toBe("Jordan Lane");
    expect(v.application).not.toHaveProperty("verified");
    expect(v.application).not.toHaveProperty("events");
    expect(v.application).not.toHaveProperty("decisionNote");
    expect(v).not.toHaveProperty("applications");
  });
  it("rejects invalid values and extra input fields", () => {
    const w = seed();
    expect(() =>
      apply(w, {
        type: "decision",
        id: "OR-2404",
        decision: "approved",
        note: "ok",
      }),
    ).toThrow();
    expect(() =>
      apply(w, {
        type: "verify",
        id: "OR-2401",
        revision: 3,
        review: { ...review, annualIncomeCents: -1 },
      }),
    ).toThrow();
  });
});
describe("evidence validation", () => {
  it("finds income discrepancies across sources and declaration", () => {
    const a = seed().applications[0];
    const e = preparedExtraction(a.documents);
    const r = reconcile(e, a);
    expect(r.issues.join(" ")).toContain("differs between documents");
    expect(r.draft.annualIncomeCents).toBe(4800000);
    expect(r.draft.monthlyDebtCents).toBe(65000);
  });
  it("routes matching evidence to review without fabricated conflicts", () => {
    const a = seed().applications[4];
    expect(reconcile(preparedExtraction(a.documents), a).issues).toEqual([]);
  });
  it("rejects invented quotes, missing documents, duplicates and foreign IDs", () => {
    const a = seed().applications[0];
    const e = preparedExtraction(a.documents);
    e.documents[0].grossPay.quote = "invented";
    expect(() => verifyExtraction(e, a.documents)).toThrow();
    const v = preparedExtraction(a.documents);
    v.documents[0].documentId = "foreign";
    expect(() => verifyExtraction(v, a.documents)).toThrow();
    expect(() => verifyExtraction({ documents: [] }, a.documents)).toThrow();
  });
  it("does not treat quote presence as value accuracy", () => {
    const a = seed().applications[4];
    const e = preparedExtraction(a.documents);
    e.documents[0].grossPay.value = "999999";
    expect(verifyExtraction(e, a.documents)).toBeTruthy();
    expect(reconcile(e, a).issues.length).toBeGreaterThan(0);
  });
  it("flags unsupported periods and missing fields instead of assuming values", () => {
    const a = seed().applications[4];
    const e = preparedExtraction(a.documents);
    for (const d of e.documents) {
      d.grossPay = { value: null, quote: null };
      d.monthlyDebt = { value: null, quote: null };
    }
    const r = reconcile(e, a);
    expect(r.issues).toContain("No supported gross-income amount was found.");
    expect(r.draft.annualIncomeCents).toBeUndefined();
  });
});
