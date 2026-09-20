import express, { type ErrorRequestHandler } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  commandSchema,
  documentSchema,
  borrowerView,
  reviewSchema,
  RuleError,
} from "../shared/domain.js";
import { Store, Conflict, digest } from "./store.js";
import { Intake, IntakeError } from "./intake.js";
export function createApp(
  store: Store,
  options: { key: string; intake: Intake; secure?: boolean; ai?: boolean },
) {
  const app = express();
  app.disable("x-powered-by");
  if (options.key.length < 24) throw Error("Demo key too short");
  app.use("/api", (_q, r, next) => {
    r.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    next();
  });
  app.get("/api/health", (_q, r) =>
    r.json({ status: "ok", service: "origin", ai: !!options.ai }),
  );
  app.use("/api", express.json({ limit: "64kb" }));
  const hits: number[] = [];
  app.use("/api", (q, r, next) => {
    const now = Date.now();
    while (hits[0] < now - 60000) hits.shift();
    if (q.method !== "GET") {
      if (hits.length >= 50) {
        r.status(429).json({
          error: "Too many requests. Wait a minute and retry.",
        });
        return;
      }
      hits.push(now);
    }
    next();
  });
  const token = (q: express.Request, name: string) =>
    new RegExp("(?:^|;\\s*)" + name + "=([a-f0-9]{64})(?:;|$)").exec(
      q.headers.cookie || "",
    )?.[1] || "";
  const cookie = (name: string, value: string, age: number, path = "/api") =>
    `${name}=${value}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=${age}${options.secure ? "; Secure" : ""}`;
  const borrower = express.Router();
  borrower.post("/redeem", async (q, r) => {
    const { invite } = z
      .object({ invite: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(q.body);
    const t = await store.redeem(invite);
    r.setHeader(
      "Set-Cookie",
      cookie("origin_borrower", t, 1800, "/api/borrower"),
    );
    r.json({ ok: true });
  });
  borrower.use(async (q, r, next) => {
    const t = token(q, "origin_borrower");
    const s = await store.borrower(t);
    if (!s || !(await store.read(s.owner))) {
      r.status(401).json({
        error: "Borrower session expired. Open a new invitation.",
      });
      return;
    }
    r.locals.identity = s;
    r.locals.tag = digest(t).slice(0, 24);
    if (
      q.path !== "/session" &&
      q.headers["x-portal-session"] !== r.locals.tag
    ) {
      r.status(401).json({
        error: "Borrower identity changed. Reopen the portal.",
      });
      return;
    }
    next();
  });
  borrower.get("/session", async (_q, r) => {
    const s = r.locals.identity;
    r.json({
      ...borrowerView((await store.read(s.owner))!, s.applicationId),
      sessionTag: r.locals.tag,
      expiresAt: s.expiresAt,
    });
  });
  borrower.post("/documents", async (q, r) => {
    const s = r.locals.identity;
    const b = z
      .object({ version: z.number().int(), document: documentSchema })
      .strict()
      .parse(q.body);
    const w = await store.command(
      s.owner,
      b.version,
      { type: "document", id: s.applicationId, document: b.document },
      s.applicationId,
    );
    r.json(borrowerView(w, s.applicationId));
  });
  borrower.post("/submit", async (q, r) => {
    const s = r.locals.identity;
    const { version } = z
      .object({ version: z.number().int() })
      .strict()
      .parse(q.body);
    r.json(
      borrowerView(
        await store.command(
          s.owner,
          version,
          { type: "submit", id: s.applicationId },
          s.applicationId,
        ),
        s.applicationId,
      ),
    );
  });
  borrower.post("/logout", async (q, r) => {
    await store.logout(token(q, "origin_borrower"));
    r.setHeader(
      "Set-Cookie",
      cookie("origin_borrower", "", 0, "/api/borrower"),
    );
    r.json({ ok: true });
  });
  app.use("/api/borrower", borrower);
  app.use("/api", (q, r, next) => {
    if (
      !timingSafeEqual(
        Buffer.from(digest(q.headers.authorization || "")),
        Buffer.from(digest("Bearer " + options.key)),
      )
    ) {
      r.status(401).json({ error: "Enter a valid Origin demo access key." });
      return;
    }
    next();
  });
  const owner = (q: express.Request) => digest(token(q, "origin"));
  app.post("/api/session", async (q, r) => {
    z.object({}).strict().parse(q.body);
    const old = token(q, "origin");
    const existing = old ? await store.read(digest(old)) : null;
    const t = existing ? old : randomBytes(32).toString("hex");
    const w = existing || (await store.create(digest(t)));
    r.setHeader("Set-Cookie", cookie("origin", t, 86400));
    r.json(w);
  });
  app.use("/api", async (q, r, next) => {
    if (!(await store.read(owner(q)))) {
      r.status(401).json({ error: "Session expired. Reconnect to the demo." });
      return;
    }
    next();
  });
  app.get("/api/workspace", async (q, r) => r.json(await store.read(owner(q))));
  app.post("/api/commands", async (q, r) => {
    const b = z
      .object({ version: z.number().int(), command: commandSchema })
      .strict()
      .parse(q.body);
    r.json(await store.command(owner(q), b.version, b.command));
  });
  app.post("/api/invites", async (q, r) => {
    const b = z
      .object({ applicationId: z.string().max(160) })
      .strict()
      .parse(q.body);
    r.json({ invite: await store.invite(owner(q), b.applicationId) });
  });
  app.get("/api/intakes", async (q, r) =>
    r.json(await options.intake.list(owner(q))),
  );
  const active = new Set<string>();
  async function one(ownerId: string, fn: () => Promise<unknown>) {
    if (active.has(ownerId))
      throw new Conflict("A review is already processing.");
    active.add(ownerId);
    try {
      return await fn();
    } finally {
      active.delete(ownerId);
    }
  }
  app.post("/api/intakes", async (q, r) => {
    const b = z
      .object({ applicationId: z.string().max(160) })
      .strict()
      .parse(q.body);
    r.json(
      await one(owner(q), () =>
        options.intake.start(owner(q), b.applicationId),
      ),
    );
  });
  app.post("/api/intakes/:id/resume", async (q, r) => {
    const id = z.uuid().parse(q.params.id);
    const b = z
      .object({
        checkpoint: z.string().max(160),
        action: z.enum(["clarify", "approve", "retry"]),
        review: reviewSchema.optional(),
      })
      .strict()
      .parse(q.body);
    r.json(
      await one(owner(q), () =>
        options.intake.resume(owner(q), id, b.checkpoint, b.action, b.review),
      ),
    );
  });
  app.use("/api", (_q, r) =>
    r.status(404).json({ error: "Endpoint unavailable." }),
  );
  const errors: ErrorRequestHandler = (e, _q, r, _n) => {
    const status =
      e instanceof z.ZodError || e instanceof RuleError
        ? 422
        : e instanceof Conflict
          ? 409
          : e instanceof IntakeError
            ? e.status
            : e?.type === "entity.too.large"
              ? 413
              : e instanceof SyntaxError
                ? 400
                : 503;
    r.status(status).json({
      error:
        e instanceof z.ZodError
          ? e.issues[0]?.message
          : e instanceof RuleError ||
              e instanceof Conflict ||
              e instanceof IntakeError
            ? e.message
            : "Request could not be completed. Refresh and try again.",
    });
  };
  app.use(errors);
  return app;
}
