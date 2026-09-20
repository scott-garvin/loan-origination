# Origin

Origin is a fictional lending workspace with a connected borrower portal and reviewed AI document intake. Collect documents, reconcile the evidence, confirm the facts, and record a simulated lending decision with a reason.

Vue and TypeScript power the interface. Express and PostgreSQL persist private demo workspaces. LangGraph runs the document-review workflow with PostgreSQL checkpoints. OpenAI extracts proposed facts and source quotes. It has no loan-decision tool.

[Live workspace](https://origin-production-9ae1.up.railway.app/) · [Browser sample](https://scott-garvin.github.io/loan-origination/)

The live workspace needs an Origin demo access key for persistent data and AI. Ask for a key; use fictional documents only.

## Try the workflow

1. Open Alex Morgan in **Document review**, then choose **AI review**.
2. Run the guided review. The income statement says $4,000 monthly, while the employment letter says $52,000 annually. Code flags the difference.
3. Inspect the source quotes. Enter the verified facts and explain how you resolved the discrepancy.
4. Continue to final review, then confirm and save the facts. These are separate actions.
5. On **Overview**, move the application to decision review. Record a simulated approval or decline with your own reason.
6. For borrower intake, open Jamie Ellis, choose **Documents**, then create a borrower invitation in live mode. The borrower can supply the three document types and submit them. Refresh the staff application to see the changes.

The browser sample works without credentials and resets on reload. Its guided extraction uses a deterministic parser for the supplied example format. It makes no AI calls. The standalone borrower sample is independent of the staff sample. Live mode connects them through PostgreSQL.

The **Origin demo access key** belongs in the key dialog. The **OpenAI API key** belongs in backend configuration only. Connecting creates a private 24-hour workspace cookie. The demo key stays in browser memory; enter it again after reload to reopen the existing workspace while its cookie is valid.

## Document intake

Supported input is pasted text or `.txt` / `.md` files up to 16 KB, with a 12,000-character limit per document. The demo accepts one income statement, one employment letter, and one debt summary. Replacing a document invalidates an older review. It does not parse PDFs, perform OCR, pull credit reports, or verify document authenticity. Use fictional data only.

```mermaid
flowchart LR
  B[Borrower documents] --> P[Private application]
  P --> E[OpenAI structured extraction]
  E --> V[Quote and consistency validation]
  V -->|Missing or conflicting facts| C[Clarification interrupt]
  V -->|Consistent facts| R[Final review interrupt]
  C --> R
  R -->|Human confirms| S[Save verified facts]
  S --> H[Separate human decision]
  DB[(PostgreSQL checkpoints)] --- C
  DB --- R
```

The model receives the three document texts and their IDs, types, and titles. It returns employer, gross pay, payment frequency, and monthly debt, each with a verbatim quote or null. No borrower directory, credit score, risk recommendation, or decision history is added to the prompt. Document text is untrusted input, never an instruction source.

The server validates the output schema, document coverage, document IDs, and exact quote presence. Code converts supported gross-pay periods to annual amounts and compares figures across documents and the original application. Conflicts and missing values route to clarification. Quote presence proves provenance, not correct interpretation or authenticity. A reviewer must check the values and record a note.

`StateGraph` uses extract, validate, clarify, review, and save nodes. Clarification and final review are durable interrupts. Refreshing or restarting the server resumes from PostgreSQL checkpoints without rerunning extraction. A failed extraction requires explicit retry and may consume another provider call. A per-run database advisory lock prevents concurrent resumes; checkpoint IDs reject stale tabs. The save transaction verifies session ownership, workspace generation, and application revision, and records completion atomically for idempotent approval. Another document change or fact review makes a pending run stale.

## Workflow controls

- Application changes use version checks and session-row locks. A stale browser must refresh before retrying.
- All three document types must be present before facts can be verified. Only verified, current facts can move into decision review.
- Only a reviewer in decision review can record an approval or decline, and both require a reason. Reopening clears verification. Every action records an actor and timestamp.
- The payment calculator is normal TypeScript: a fixed illustrative 9.9% APR, principal, and term produce principal-and-interest payments. Debt-to-income uses declared or reviewer-confirmed figures. It excludes fees and insurance and makes no eligibility recommendation.
- Borrower invitations are single-use, expire after 10 minutes, and open a 30-minute session bound to one application. Tokens are hashed in the database. The fragment is removed after redemption; the staff key never enters the borrower link.
- Borrower endpoints derive application identity from the session and accept only document submission and submit actions. They exclude reviewer notes, internal verified values, and other applications. A session tag rejects stale tabs after the browser changes borrower identities. Expiry and logout clear the portal view and drafts.
- Reset restores fixtures and revokes borrower invitations and sessions. Old graph runs become inaccessible through a workspace generation check; they are not physically purged.

## Limits and privacy

This is a synthetic portfolio demonstration, not a lending product approved for real borrower data, regulated decision-making, or compliance claims. No real messages, credit inquiries, offers, adverse-action notices, or funding occur. Real lending deployment would need production authentication and roles, applicable legal review, document handling controls, retention, monitoring, and vendor agreements.

The API limits request bodies to 64 KB and mutations to 50 per minute per process. Each workspace supports 30 applications and 20 intake runs. Shared PostgreSQL quotas default to 30 extraction calls per UTC day and 300 per month, including failed attempts. These are request caps, not dollar caps. The provider call has a 35-second timeout and 3,000 output-token limit, with no automatic retries. External LangSmith/LangChain tracing is disabled; startup rejects enabled tracing flags. The provider request uses `store: false`, which is not a claim of zero vendor retention.

Application sessions and intake rows use forced row-level security. The live runtime should use a restricted login and private schemas, never a database superuser. Graph checkpoints contain document text; they are backend-only and must not be exposed through a Data API. API ownership checks precede graph access. Invitation/session indexes and usage counters are backend-only tables with RLS enabled and accessed by the table owner. Expired data is inaccessible but not automatically physically purged. Add retention cleanup before any non-fictional use.

## Local setup

Requires Node 22.12+ and Docker.

```sh
npm ci
cp .env.example .env
docker compose up -d db
npm run dev:api
npm run dev
```

Open `http://127.0.0.1:5176/`. The API uses port 8087 and PostgreSQL uses 5447. Add the provider key to `.env` for live AI and replace the demo key before hosting. Docker Compose can also serve the complete app on port 8087 with `docker compose up --build`; that local-only configuration uses HTTP cookies. The production image defaults to secure cookies and needs HTTPS.

## Tests and delivery

```sh
docker compose exec db createdb -U origin origin_test
# Set TEST_DATABASE_URL=postgresql://origin:local-demo-only@127.0.0.1:5447/origin_test
npm test
npm run build
npm run build:server
npx playwright install chromium
npm run test:e2e
docker build -t origin-check .
```

Tests refuse databases not named `origin_test`. Unit and integration coverage includes state transitions, source verification, cross-session access, borrower permissions, stale writes, graph recovery, idempotent saves, quotas, and forced RLS under a restricted role. Browser tests exercise complete staff and borrower workflows on desktop and mobile using a deterministic provider fixture. GitHub Actions runs these checks, dependency auditing, and Docker builds without paid API keys. Separate CodeQL and Gitleaks jobs scan code and secrets. Dependabot handles dependency updates.

GitHub Pages builds the browser sample with `VITE_BASE_PATH=/loan-origination/`. The Docker service serves the frontend and API from the same origin with `/api/health`. `railway.json` configures one replica and the Docker build. The active-run and burst limits assume one app instance; use shared limits before scaling out.

For shared Supabase hosting, provision separate `origin_app` and `origin_graph` schemas and a restricted runtime login. Set `DATABASE_SCHEMA=origin_app`, `GRAPH_SCHEMA=origin_graph`, and `MIGRATE_ON_START=false`. Apply `scripts/migrate.ts` under an appropriate migration identity before release. The included Supabase root certificate is public; a hosted database URL should use `sslmode=verify-full&sslrootcert=server/certs/supabase-ca.crt`. Keep all secrets in runtime variables and ignored local files.

## Code map

| File | Responsibility |
|---|---|
| `shared/domain.ts` | Workflow rules, fixtures, payment math, borrower projection |
| `shared/extraction.ts` | Source quotes, period conversion, discrepancy detection |
| `server/provider.ts` | Bounded structured extraction request |
| `server/intake.ts` | LangGraph interrupts, checkpoint recovery, resume locks |
| `server/store.ts` | Scoped transactions, invitations, quotas, idempotent saves |
| `server/app.ts` | Staff and borrower authorization, API validation |
| `src/components/ReviewPanel.vue` | Evidence comparison, clarification, final review |
| `src/components/BorrowerPortal.vue` | Scoped document collection and submission |
| `tests/` and `e2e/` | Domain, integration, and responsive workflow tests |

[Portfolio](https://scott-garvin.github.io/) · [Ledgerly](https://github.com/scott-garvin/invoice-dashboard) · [Clera](https://github.com/scott-garvin/clinic-scheduler)
