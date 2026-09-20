import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool } from "pg";
import supertest from "supertest";
import { Store } from "../server/store";
import { Intake } from "../server/intake";
import { createApp } from "../server/app";
import { preparedExtraction } from "../shared/extraction";
import { exampleDocuments } from "../shared/domain";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/origin_test")
  throw Error("Use the isolated origin_test database.");
const pool = new Pool({ connectionString: url, max: 10 });
const store = new Store(pool);
let calls = 0;
const extractor = {
  async extract(docs: Parameters<typeof preparedExtraction>[0]) {
    calls++;
    return { result: preparedExtraction(docs), model: "fixture" };
  },
};
const intake = new Intake(store, extractor, 30, 300);
const key = "test-origin-key-not-a-secret";
const app = createApp(store, { key, intake, ai: true });
const auth = { Authorization: "Bearer " + key };
const review = {
  annualIncomeCents: 4800000,
  monthlyDebtCents: 65000,
  employer: "Cedar Works",
  note: "Income reconciled using source records for this fictional file.",
};
async function login() {
  const a = supertest.agent(app);
  const r = await a.post("/api/session").set(auth).send({});
  expect(r.status).toBe(200);
  return a;
}
beforeAll(async () => {
  await store.migrate();
  await intake.setup();
});
beforeEach(async () => {
  await pool.query(
    "truncate origin_sessions,origin_intakes,origin_invites,origin_borrowers,origin_usage cascade",
  );
  calls = 0;
});
afterAll(() => pool.end());
it("requires a demo key, scopes private workspaces, rejects cross-session runs", async () => {
  expect((await supertest(app).get("/api/workspace")).status).toBe(401);
  const a = await login(),
    b = await login();
  const s = await a
    .post("/api/intakes")
    .set(auth)
    .send({ applicationId: "OR-2401" });
  expect(s.status).toBe(200);
  expect(
    (
      await b
        .post("/api/intakes/" + s.body.id + "/resume")
        .set(auth)
        .send({ checkpoint: s.body.checkpoint, action: "clarify", review })
    ).status,
  ).toBe(409);
  expect((await b.get("/api/intakes").set(auth)).body).toHaveLength(0);
});
it("persists a clarification interrupt, resumes after service restart, and saves once", async () => {
  const a = await login();
  const s = await a
    .post("/api/intakes")
    .set(auth)
    .send({ applicationId: "OR-2401" });
  expect(s.body.stage).toBe("clarify");
  expect(calls).toBe(1);
  expect(
    (
      await a
        .post("/api/intakes/" + s.body.id + "/resume")
        .set(auth)
        .send({ checkpoint: s.body.checkpoint, action: "approve", review })
    ).status,
  ).toBe(409);
  const restarted = new Intake(store, extractor);
  const cookie = (await a.get("/api/workspace").set(auth)).body;
  expect(cookie.applications[0].verified).toBeNull();
  const run = (
    await pool.query("select owner from origin_intakes where id=$1", [
      s.body.id,
    ])
  ).rows[0];
  const resumed = await restarted.resume(
    run.owner,
    s.body.id,
    s.body.checkpoint,
    "clarify",
    review,
  );
  expect(resumed.stage).toBe("review");
  expect(calls).toBe(1);
  const done = await restarted.resume(
    run.owner,
    s.body.id,
    resumed.checkpoint,
    "approve",
    review,
  );
  expect(done.stage).toBe("complete");
  const one = (await store.read(run.owner))!;
  await restarted.resume(
    run.owner,
    s.body.id,
    resumed.checkpoint,
    "approve",
    review,
  );
  expect((await store.read(run.owner))!.version).toBe(one.version);
  expect(one.applications[0].verified?.employer).toBe("Cedar Works");
  expect(one.applications[0].stage).toBe("review");
});
it("rejects stale checkpoints, changed documents, and runs invalidated by reset", async () => {
  const a = await login();
  const s = await a
    .post("/api/intakes")
    .set(auth)
    .send({ applicationId: "OR-2401" });
  expect(
    (
      await a
        .post("/api/intakes/" + s.body.id + "/resume")
        .set(auth)
        .send({ checkpoint: "old", action: "clarify", review })
    ).status,
  ).toBe(409);
  await a
    .post("/api/commands")
    .set(auth)
    .send({
      version: 0,
      command: {
        type: "document",
        id: "OR-2401",
        document: exampleDocuments()[0],
      },
    })
    .expect(200);
  expect(
    (
      await a
        .post("/api/intakes/" + s.body.id + "/resume")
        .set(auth)
        .send({ checkpoint: s.body.checkpoint, action: "clarify", review })
    ).status,
  ).toBe(409);
  await a
    .post("/api/commands")
    .set(auth)
    .send({ version: 1, command: { type: "reset" } })
    .expect(200);
  expect((await a.get("/api/intakes").set(auth)).body).toHaveLength(0);
  expect(
    (
      await a
        .post("/api/intakes/" + s.body.id + "/resume")
        .set(auth)
        .send({ checkpoint: s.body.checkpoint, action: "retry" })
    ).status,
  ).toBe(409);
});
it("requires explicit retry and enforces database-backed AI quotas before provider calls", async () => {
  await pool.query(
    "insert into origin_usage(day,attempts) values((now() at time zone 'UTC')::date,30)",
  );
  const a = await login();
  expect(
    (await a.post("/api/intakes").set(auth).send({ applicationId: "OR-2401" }))
      .status,
  ).toBe(429);
  expect(calls).toBe(0);
  expect((await a.get("/api/intakes").set(auth)).body[0].stage).toBe("retry");
});
it("invites one borrower, binds identity server-side, and revokes on reset", async () => {
  const staff = await login(),
    borrower = supertest.agent(app),
    other = supertest.agent(app);
  const invite = (
    await staff
      .post("/api/invites")
      .set(auth)
      .send({ applicationId: "OR-2402" })
  ).body.invite;
  await borrower.post("/api/borrower/redeem").send({ invite }).expect(200);
  await other.post("/api/borrower/redeem").send({ invite }).expect(409);
  let v = (await borrower.get("/api/borrower/session")).body;
  expect(v.application.id).toBe("OR-2402");
  expect(v.application).not.toHaveProperty("verified");
  expect(v).not.toHaveProperty("applications");
  expect(
    (
      await borrower
        .post("/api/borrower/documents")
        .send({ version: v.version, document: exampleDocuments()[0] })
    ).status,
  ).toBe(401);
  const headers = { "X-Portal-Session": v.sessionTag };
  await borrower
    .post("/api/borrower/documents")
    .set(headers)
    .send({
      version: v.version,
      document: exampleDocuments()[0],
      applicationId: "OR-2401",
    })
    .expect(422);
  await borrower
    .post("/api/borrower/documents")
    .set(headers)
    .send({ version: v.version, document: exampleDocuments()[0] })
    .expect(200);
  let w = (await staff.get("/api/workspace").set(auth)).body;
  expect(
    w.applications.find((a: { id: string }) => a.id === "OR-2402").documents,
  ).toHaveLength(1);
  await staff
    .post("/api/commands")
    .set(auth)
    .send({ version: w.version, command: { type: "reset" } })
    .expect(200);
  await borrower.get("/api/borrower/session").expect(401);
});
it("rejects stale versions and requires the manual decision workflow", async () => {
  const a = await login();
  await a
    .post("/api/commands")
    .set(auth)
    .send({
      version: 0,
      command: {
        type: "decision",
        id: "OR-2401",
        decision: "approved",
        note: "Attempt to skip the review.",
      },
    })
    .expect(422);
  await a
    .post("/api/commands")
    .set(auth)
    .send({
      version: 0,
      command: { type: "verify", id: "OR-2401", revision: 3, review },
    })
    .expect(200);
  await a
    .post("/api/commands")
    .set(auth)
    .send({ version: 0, command: { type: "advance", id: "OR-2401" } })
    .expect(409);
  await a
    .post("/api/commands")
    .set(auth)
    .send({ version: 1, command: { type: "advance", id: "OR-2401" } })
    .expect(200);
  await a
    .post("/api/commands")
    .set(auth)
    .send({
      version: 2,
      command: {
        type: "decision",
        id: "OR-2401",
        decision: "approved",
        note: "Reviewer confirmed the fictional record.",
      },
    })
    .expect(200);
});
it("enforces row-level ownership under a role that cannot bypass RLS", async () => {
  await pool.query(
    "do $$ begin if not exists(select 1 from pg_roles where rolname='origin_test_reader') then create role origin_test_reader nologin; end if; end $$; grant usage on schema public to origin_test_reader; grant select on origin_sessions,origin_intakes to origin_test_reader;",
  );
  await store.create("owner-a");
  await store.create("owner-b");
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role origin_test_reader");
    await c.query("select set_config('origin.session','owner-a',true)");
    expect((await c.query("select id from origin_sessions")).rows).toEqual([
      { id: "owner-a" },
    ]);
    await c.query("rollback");
  } finally {
    c.release();
  }
});
it('clears stale borrower authority after a different invitation is redeemed and after expiry',async()=>{
 const staff=await login(),borrower=supertest.agent(app);
 const first=(await staff.post('/api/invites').set(auth).send({applicationId:'OR-2401'})).body.invite;
 await borrower.post('/api/borrower/redeem').send({invite:first}).expect(200);
 const old=(await borrower.get('/api/borrower/session')).body;
 const second=(await staff.post('/api/invites').set(auth).send({applicationId:'OR-2402'})).body.invite;
 await borrower.post('/api/borrower/redeem').send({invite:second}).expect(200);
 await borrower.post('/api/borrower/documents').set('X-Portal-Session',old.sessionTag).send({version:old.version,document:exampleDocuments()[0]}).expect(401);
 const current=(await borrower.get('/api/borrower/session')).body;expect(current.application.id).toBe('OR-2402');
 await pool.query("update origin_borrowers set expires_at=now()-interval '1 second'");await borrower.get('/api/borrower/session').expect(401);
});
it('failed extraction stays retryable and a verified retry does not skip human review',async()=>{
 const a=await login();const w=(await a.get('/api/workspace').set(auth)).body;
 const owner=(await pool.query('select id from origin_sessions')).rows[0].id;
 const broken=new Intake(store,{async extract(docs){const result=preparedExtraction(docs);result.documents[0].employer.quote='not in source';return {result,model:'bad-fixture'};}});
 await expect(broken.start(owner,w.applications[0].id)).rejects.toThrow('verification');
 const list=await intake.list(owner);expect(list[0].stage).toBe('retry');
 const fixed=await intake.resume(owner,list[0].id,list[0].checkpoint,'retry');expect(fixed.stage).toBe('clarify');expect((await store.read(owner))!.applications[0].verified).toBeNull();
});
