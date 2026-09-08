# loan-origination — Origin

A **loan origination & underwriting pipeline** for a lending back office. **[Live demo →](https://scott-garvin.github.io/loan-origination/)**

Vue 3 + TypeScript + Vite. Loan applications move through a Kanban pipeline — **New → Document Review → Underwriting → Approved / Declined** — and each one carries a live underwriting scorecard.

- **Drag-and-drop pipeline** — move an application between stages by dragging its card; the drop is logged to the application's history.
- **Underwriting scorecard** — open any application for a decision drawer: estimated APR by credit tier, an amortized monthly payment, back-end **DTI** (including the new loan's payment), credit tier, and a **system recommendation** (Approve / Refer / Decline) with the reasons that drove it.
- **Decisioning** — advance, approve, or decline (with a reason) from the drawer; every action updates the board and the history timeline live.
- **Search & filter** across applicant, product, purpose, and ID; a validated **New application** modal adds to the pipeline.

The recommendation engine is real, if intentionally simple: credit-score bands, an amortization formula for the estimated payment, a DTI ceiling and guideline, plus employment and loan-to-income checks. Sample data only — no backend, no real applicant data.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Stack

Vue 3 (`<script setup lang="ts">`), TypeScript (strict), Vite. State is a small reactive store; the underwriting math (amortization, DTI, decision rules) is plain, testable TypeScript. Components and styling are hand-built (no UI framework). Deployed to GitHub Pages via GitHub Actions.

One of three deliberately different-shaped demos, alongside an [invoicing dashboard](https://github.com/scott-garvin/invoice-dashboard) and a [clinic check-in system](https://github.com/scott-garvin/clinic-scheduler) — a pipeline board, a dashboard, and a kiosk, to show range across product shapes.

Portfolio: [scott-garvin.github.io](https://scott-garvin.github.io)

## License

MIT — see [LICENSE](LICENSE).
