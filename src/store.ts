import { reactive } from 'vue';

export type Stage = 'new' | 'review' | 'underwriting' | 'approved' | 'declined';
export type CreditTier = 'Excellent' | 'Good' | 'Fair' | 'Poor';
export type Product = 'Personal' | 'Auto' | 'Home Improvement' | 'Debt Consolidation' | 'Small Business';

export interface StageMeta {
  key: Stage;
  label: string;
  hint: string;
}
export const STAGES: StageMeta[] = [
  { key: 'new', label: 'New', hint: 'Submitted · awaiting intake' },
  { key: 'review', label: 'Document Review', hint: 'Verifying income & identity' },
  { key: 'underwriting', label: 'Underwriting', hint: 'Credit & risk decision' },
  { key: 'approved', label: 'Approved', hint: 'Cleared to fund' },
  { key: 'declined', label: 'Declined', hint: 'Did not meet criteria' },
];
const STAGE_ORDER: Stage[] = ['new', 'review', 'underwriting', 'approved', 'declined'];

export const PRODUCTS: Product[] = ['Personal', 'Auto', 'Home Improvement', 'Debt Consolidation', 'Small Business'];
export const TERM_OPTIONS = [24, 36, 48, 60];

export interface TimelineEvent {
  at: string;
  label: string;
}

export interface Application {
  id: string;
  applicant: string;
  email: string;
  product: Product;
  amountCents: number; // requested principal
  termMonths: number;
  purpose: string;
  creditScore: number;
  annualIncomeCents: number;
  monthlyDebtCents: number; // existing monthly debt obligations
  employmentYears: number;
  stage: Stage;
  submittedAt: string; // display date
  declineReason: string | null;
  events: TimelineEvent[];
}

// ---- seed ---------------------------------------------------------------

const FIRST = ['Marcus', 'Priya', 'Dale', 'Yuki', 'Andre', 'Sofia', 'Grace', 'Tobias', 'Elena', 'Rohan', 'Marta', 'Cody', 'Naomi', 'Iris', 'Bilal', 'Devon'];
const LAST = ['Ellison', 'Nair', 'Whitcomb', 'Tanaka', 'Osei', 'Marin', 'Bauer', 'Fenn', 'Duarte', 'Kapoor', 'Reyes', 'Voss', 'Okafor', 'Lindqvist', 'Haddad', 'Pierce'];
const PURPOSES: Record<Product, string> = {
  Personal: 'Medical expenses',
  Auto: 'Used vehicle purchase',
  'Home Improvement': 'Kitchen remodel',
  'Debt Consolidation': 'Consolidate credit cards',
  'Small Business': 'Working capital',
};

const STAGE_PLAN: Stage[] = ['approved', 'underwriting', 'declined', 'review', 'new', 'underwriting', 'approved', 'new', 'approved', 'review', 'new', 'declined', 'underwriting', 'approved', 'review', 'new'];
const SCORE = [768, 741, 592, 705, 684, 723, 798, 662, 752, 690, 636, 571, 708, 776, 655, 712];
const INCOME_K = [96, 120, 54, 88, 72, 110, 150, 63, 134, 80, 58, 47, 92, 128, 69, 105];
const DEBT = [1200, 1800, 1500, 900, 1100, 1600, 1400, 1350, 1700, 1000, 1250, 1600, 1150, 1900, 1300, 1450];
const AMOUNT_K = [25, 40, 18, 32, 22, 45, 60, 15, 50, 28, 20, 12, 35, 55, 24, 30];
const TERM = [48, 60, 36, 48, 36, 60, 60, 24, 60, 48, 36, 24, 48, 60, 36, 48];
const EMP_Y = [6, 9, 2, 4, 3, 8, 12, 1, 7, 5, 2, 1, 6, 10, 3, 5];
const DAYS_AGO = [1, 2, 4, 3, 0, 5, 6, 1, 3, 7, 2, 8, 4, 2, 5, 0];
const DECLINE_REASON: Record<number, string> = { 2: 'Credit score below 600 floor', 11: 'DTI exceeds 50% ceiling' };

function dateLabel(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function nowLabel(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function buildSeed(): Application[] {
  const out: Application[] = [];
  for (let i = 0; i < STAGE_PLAN.length; i++) {
    const product = PRODUCTS[i % PRODUCTS.length];
    const stage = STAGE_PLAN[i];
    const submittedAt = dateLabel(DAYS_AGO[i]);
    const first = FIRST[i];
    const last = LAST[i];

    const events: TimelineEvent[] = [{ at: submittedAt, label: 'Application submitted' }];
    const reached = STAGE_ORDER.indexOf(stage);
    if (reached >= 1) events.push({ at: dateLabel(Math.max(0, DAYS_AGO[i] - 1)), label: 'Documents received — moved to Document Review' });
    if (reached >= 2 || stage === 'declined') events.push({ at: dateLabel(Math.max(0, DAYS_AGO[i] - 2)), label: 'Sent to Underwriting' });
    if (stage === 'approved') events.push({ at: dateLabel(Math.max(0, DAYS_AGO[i] - 3)), label: 'Approved — cleared to fund' });
    if (stage === 'declined') events.push({ at: dateLabel(Math.max(0, DAYS_AGO[i] - 2)), label: `Declined — ${DECLINE_REASON[i] ?? 'Did not meet criteria'}` });

    out.push({
      id: `L-${10420 + i}`,
      applicant: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      product,
      amountCents: AMOUNT_K[i] * 100000,
      termMonths: TERM[i],
      purpose: PURPOSES[product],
      creditScore: SCORE[i],
      annualIncomeCents: INCOME_K[i] * 100000,
      monthlyDebtCents: DEBT[i] * 100,
      employmentYears: EMP_Y[i],
      stage,
      submittedAt,
      declineReason: stage === 'declined' ? (DECLINE_REASON[i] ?? 'Did not meet criteria') : null,
      events,
    });
  }
  return out;
}

export const applications = reactive<Application[]>(buildSeed());
let idSeq = 10420 + applications.length;

// ---- underwriting -------------------------------------------------------

export function creditTier(score: number): CreditTier {
  if (score >= 740) return 'Excellent';
  if (score >= 680) return 'Good';
  if (score >= 620) return 'Fair';
  return 'Poor';
}

const TIER_APR: Record<CreditTier, number> = { Excellent: 6.9, Good: 9.9, Fair: 14.9, Poor: 19.9 };
export function aprFor(app: Application): number {
  return TIER_APR[creditTier(app.creditScore)];
}

export function monthlyPaymentCents(principalCents: number, apr: number, termMonths: number): number {
  const r = apr / 100 / 12;
  if (r === 0) return Math.round(principalCents / termMonths);
  return Math.round((principalCents * r) / (1 - Math.pow(1 + r, -termMonths)));
}
export function estPaymentCents(app: Application): number {
  return monthlyPaymentCents(app.amountCents, aprFor(app), app.termMonths);
}

// Back-end DTI including the estimated payment on the requested loan.
export function dtiRatio(app: Application): number {
  const monthlyIncome = app.annualIncomeCents / 12;
  if (monthlyIncome <= 0) return 1;
  return (app.monthlyDebtCents + estPaymentCents(app)) / monthlyIncome;
}

export type Decision = 'Approve' | 'Refer' | 'Decline';
export interface Recommendation {
  decision: Decision;
  reasons: string[];
}

function worse(a: Decision, b: Decision): Decision {
  const rank: Record<Decision, number> = { Approve: 0, Refer: 1, Decline: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function recommendation(app: Application): Recommendation {
  const reasons: string[] = [];
  let decision: Decision = 'Approve';
  const score = app.creditScore;
  const dti = dtiRatio(app);

  if (score < 600) {
    decision = worse(decision, 'Decline');
    reasons.push(`Credit score ${score} below the 600 floor`);
  } else if (score < 660) {
    decision = worse(decision, 'Refer');
    reasons.push(`Credit score ${score} in the manual-review band (600–659)`);
  } else {
    reasons.push(`Credit score ${score} — ${creditTier(score)}`);
  }

  if (dti > 0.5) {
    decision = worse(decision, 'Decline');
    reasons.push(`DTI ${formatPct(dti)} exceeds the 50% ceiling`);
  } else if (dti > 0.43) {
    decision = worse(decision, 'Refer');
    reasons.push(`DTI ${formatPct(dti)} above the 43% guideline`);
  } else {
    reasons.push(`DTI ${formatPct(dti)} within guideline`);
  }

  if (app.employmentYears < 1) {
    decision = worse(decision, 'Refer');
    reasons.push('Employment under the 1-year threshold');
  }
  if (app.amountCents > app.annualIncomeCents * 0.6) {
    decision = worse(decision, 'Refer');
    reasons.push('Requested amount high relative to annual income');
  }
  return { decision, reasons };
}

// ---- actions ------------------------------------------------------------

export function stageLabel(stage: Stage): string {
  return STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export function moveStage(id: string, stage: Stage): void {
  const a = applications.find((x) => x.id === id);
  if (!a || a.stage === stage) return;
  a.stage = stage;
  if (stage !== 'declined') a.declineReason = null;
  a.events.push({ at: nowLabel(), label: `Moved to ${stageLabel(stage)}` });
}

export function decide(id: string, decision: 'approved' | 'declined', reason?: string): void {
  const a = applications.find((x) => x.id === id);
  if (!a) return;
  a.stage = decision;
  a.declineReason = decision === 'declined' ? (reason ?? 'Did not meet criteria') : null;
  a.events.push({
    at: nowLabel(),
    label: decision === 'approved' ? 'Approved — cleared to fund' : `Declined — ${a.declineReason}`,
  });
}

export interface NewApplicationInput {
  applicant: string;
  email: string;
  product: Product;
  amountCents: number;
  termMonths: number;
  purpose: string;
  creditScore: number;
  annualIncomeCents: number;
  monthlyDebtCents: number;
  employmentYears: number;
}

export function addApplication(input: NewApplicationInput): Application {
  idSeq += 1;
  const submittedAt = dateLabel(0);
  const appt: Application = {
    id: `L-${idSeq}`,
    ...input,
    applicant: input.applicant.trim(),
    email: input.email.trim(),
    purpose: input.purpose.trim(),
    stage: 'new',
    submittedAt,
    declineReason: null,
    events: [{ at: submittedAt, label: 'Application submitted at branch' }],
  };
  applications.unshift(appt);
  return appt;
}

// ---- formatting ---------------------------------------------------------

export function formatMoney(cents: number, decimals = 0): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
