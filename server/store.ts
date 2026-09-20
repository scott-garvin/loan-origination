import { Pool, type PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import {
  apply,
  seed,
  find,
  ready,
  ensureReview,
  type Workspace,
  type Command,
  type Review,
} from "../shared/domain.js";
export class Conflict extends Error {}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export class Store {
  constructor(readonly pool: Pool) {}
  async migrate() {
    await this.pool.query(
      await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
    );
  }
  async scoped<T>(owner: string, action: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('origin.session',$1,true)", [owner]);
      const v = await action(c);
      await c.query("commit");
      return v;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async read(owner: string): Promise<Workspace | null> {
    return this.scoped(
      owner,
      async (c) =>
        (
          await c.query(
            "select data from origin_sessions where id=$1 and expires_at>now()",
            [owner],
          )
        ).rows[0]?.data ?? null,
    );
  }
  async create(owner: string) {
    const w = seed();
    await this.scoped(owner, (c) =>
      c.query("insert into origin_sessions(id,data) values($1,$2)", [owner, w]),
    );
    return w;
  }
  async command(
    owner: string,
    version: number,
    command: Command,
    borrowerId?: string,
  ) {
    return this.scoped(owner, async (c) => {
      const row = (
        await c.query(
          "select data from origin_sessions where id=$1 and expires_at>now() for update",
          [owner],
        )
      ).rows[0];
      if (!row || row.data.version !== version)
        throw new Conflict("Workspace changed. Refresh and review again.");
      if (
        borrowerId &&
        (!["document", "submit"].includes(command.type) ||
          !("id" in command) ||
          command.id !== borrowerId)
      )
        throw new Conflict(
          "This action is unavailable in the borrower portal.",
        );
      const next = apply(
        row.data,
        command,
        borrowerId ? "Borrower" : "Reviewer",
      );
      await c.query("update origin_sessions set data=$2 where id=$1", [
        owner,
        next,
      ]);
      if (command.type === "reset") {
        await c.query("delete from origin_invites where owner=$1", [owner]);
        await c.query("delete from origin_borrowers where owner=$1", [owner]);
      }
      return next;
    });
  }
  async invite(owner: string, id: string) {
    return this.scoped(owner, async (c) => {
      const row = (
        await c.query(
          "select data from origin_sessions where id=$1 and expires_at>now() for update",
          [owner],
        )
      ).rows[0];
      if (!row) throw new Conflict("Session expired.");
      find(row.data, id);
      await c.query(
        "delete from origin_invites where owner=$1 and application_id=$2",
        [owner, id],
      );
      const token = randomBytes(32).toString("hex");
      await c.query(
        "insert into origin_invites(token_hash,owner,application_id) values($1,$2,$3)",
        [digest(token), owner, id],
      );
      return token;
    });
  }
  async redeem(token: string) {
    const row = (
      await this.pool.query(
        "select owner from origin_invites where token_hash=$1",
        [digest(token)],
      )
    ).rows[0];
    if (!row) throw new Conflict("Invitation expired or already used.");
    return this.scoped(row.owner, async (c) => {
      const w = (
        await c.query(
          "select id from origin_sessions where id=$1 and expires_at>now() for update",
          [row.owner],
        )
      ).rows[0];
      if (!w) throw new Conflict("Invitation expired.");
      const invite = (
        await c.query(
          "delete from origin_invites where token_hash=$1 and expires_at>now() returning owner,application_id",
          [digest(token)],
        )
      ).rows[0];
      if (!invite) throw new Conflict("Invitation expired or already used.");
      const t = randomBytes(32).toString("hex");
      await c.query(
        "insert into origin_borrowers(token_hash,owner,application_id) values($1,$2,$3)",
        [digest(t), row.owner, invite.application_id],
      );
      return t;
    });
  }
  async borrower(token: string) {
    return (
      await this.pool.query(
        'select owner,application_id as "applicationId",expires_at as "expiresAt" from origin_borrowers where token_hash=$1 and expires_at>now()',
        [digest(token)],
      )
    ).rows[0] as
      { owner: string; applicationId: string; expiresAt: string } | undefined;
  }
  async logout(token: string) {
    await this.pool.query("delete from origin_borrowers where token_hash=$1", [
      digest(token),
    ]);
  }
  async owned(owner: string, id: string) {
    return this.scoped(owner, async (c) => {
      const row = (
        await c.query(
          "select i.* from origin_intakes i join origin_sessions s on s.id=i.owner where i.id=$1 and i.owner=$2 and i.generation=s.data->>'generation' and s.expires_at>now()",
          [id, owner],
        )
      ).rows[0];
      if (!row) throw new Conflict("Review unavailable, expired, or reset.");
      return row;
    });
  }
  async start(owner: string, applicationId: string) {
    return this.scoped(owner, async (c) => {
      const w = (
        await c.query(
          "select data from origin_sessions where id=$1 and expires_at>now() for update",
          [owner],
        )
      ).rows[0]?.data as Workspace | undefined;
      if (!w) throw new Conflict("Session expired.");
      const a = find(w, applicationId);
      ensureReview(a);
      if (!ready(a))
        throw new Conflict("Collect all three document types first.");
      const count = (
        await c.query(
          "select count(*)::int as n from origin_intakes where owner=$1",
          [owner],
        )
      ).rows[0].n;
      if (count >= 20)
        throw new Conflict("Review limit reached for this session.");
      const id = randomUUID();
      await c.query(
        "insert into origin_intakes(id,owner,application_id,generation,revision,documents) values($1,$2,$3,$4,$5,$6)",
        [
          id,
          owner,
          applicationId,
          w.generation,
          a.revision,
          JSON.stringify(a.documents),
        ],
      );
      return id;
    });
  }
  async saveReview(owner: string, id: string, review: Review) {
    return this.scoped(owner, async (c) => {
      const w = (
        await c.query(
          "select data from origin_sessions where id=$1 and expires_at>now() for update",
          [owner],
        )
      ).rows[0]?.data as Workspace | undefined;
      const r = (
        await c.query("select * from origin_intakes where id=$1 and owner=$2", [
          id,
          owner,
        ])
      ).rows[0];
      if (!w || !r || r.generation !== w.generation)
        throw new Conflict("Review expired or workspace reset.");
      if (r.completed) return;
      const n = apply(
        w,
        { type: "verify", id: r.application_id, revision: r.revision, review },
        "Reviewer",
        "AI-assisted document review",
      );
      await c.query("update origin_sessions set data=$2 where id=$1", [
        owner,
        n,
      ]);
      await c.query("update origin_intakes set completed=true where id=$1", [
        id,
      ]);
    });
  }
  async reserve(daily: number, monthly: number) {
    return this.scoped("quota", async (c) => {
      await c.query("select pg_advisory_xact_lock(7824104)");
      const r = (
        await c.query(
          "select coalesce(sum(attempts) filter(where day=(now() at time zone 'UTC')::date),0)::int as daily,coalesce(sum(attempts),0)::int as monthly from origin_usage where day>=date_trunc('month',now() at time zone 'UTC')::date",
        )
      ).rows[0];
      if (r.daily >= daily || r.monthly >= monthly) return false;
      await c.query(
        "insert into origin_usage(day,attempts) values((now() at time zone 'UTC')::date,1) on conflict(day) do update set attempts=origin_usage.attempts+1",
      );
      return true;
    });
  }
}
