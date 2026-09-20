import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt,
  Command as Resume,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  find,
  ensureReview,
  reviewSchema,
  type Review,
  type SourceDocument,
} from "../shared/domain.js";
import {
  verifyExtraction,
  reconcile,
  type Extraction,
  type IntakeView,
} from "../shared/extraction.js";
import { Store, Conflict } from "./store.js";
import type { Extractor } from "./provider.js";
export class IntakeError extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}
const State = Annotation.Root({
  id: Annotation<string>(),
  owner: Annotation<string>(),
  applicationId: Annotation<string>(),
  documents: Annotation<SourceDocument[]>(),
  extraction: Annotation<Extraction>(),
  draft: Annotation<Partial<Review>>(),
  issues: Annotation<string[]>(),
  model: Annotation<string>(),
});
export class Intake {
  readonly saver: PostgresSaver;
  readonly graph;
  constructor(
    readonly store: Store,
    extractor?: Extractor,
    daily = 30,
    monthly = 300,
    readonly graphSchema = "origin_graph",
  ) {
    if (!/^[a-z_][a-z0-9_]*$/.test(graphSchema))
      throw Error("Invalid graph schema");
    if (
      ["LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2"].some((k) =>
        ["true", "1"].includes(process.env[k] || ""),
      )
    )
      throw Error("External tracing is disabled for this demo");
    this.saver = new PostgresSaver(store.pool, undefined, {
      schema: graphSchema,
    });
    this.graph = new StateGraph(State)
      .addNode("extract", async (s) => {
        if (!extractor)
          throw new IntakeError(
            "Live AI is not configured. Use manual document review.",
          );
        if (!(await store.reserve(daily, monthly)))
          throw new IntakeError(
            "AI allowance reached. Manual review remains available.",
            429,
          );
        try {
          const e = await extractor.extract(s.documents);
          return {
            extraction: verifyExtraction(e.result, s.documents),
            model: e.model,
          };
        } catch {
          throw new IntakeError(
            "Extraction failed verification. Retry explicitly or use manual review.",
            502,
          );
        }
      })
      .addNode("validate", async (s) => {
        const w = await store.read(s.owner);
        if (!w) throw new Conflict("Session expired.");
        return reconcile(s.extraction, find(w, s.applicationId));
      })
      .addNode("clarify", () => ({
        draft: reviewSchema.parse(interrupt({ kind: "clarify" })),
      }))
      .addNode("review", () => ({
        draft: reviewSchema.parse(interrupt({ kind: "review" })),
      }))
      .addNode("save", async (s) => {
        await store.saveReview(s.owner, s.id, reviewSchema.parse(s.draft));
        return {};
      })
      .addEdge(START, "extract")
      .addEdge("extract", "validate")
      .addConditionalEdges(
        "validate",
        (s) => (s.issues.length ? "clarify" : "review"),
        ["clarify", "review"],
      )
      .addEdge("clarify", "review")
      .addEdge("review", "save")
      .addEdge("save", END)
      .compile({ checkpointer: this.saver });
  }
  async setup() {
    await this.store.pool.query(
      `create schema if not exists ${this.graphSchema}; revoke all on schema ${this.graphSchema} from public`,
    );
    await this.saver.setup();
  }
  config(id: string) {
    return {
      configurable: { thread_id: id },
      recursionLimit: 12,
      callbacks: [],
    };
  }
  async locked<T>(owner: string, id: string, fn: () => Promise<T>) {
    await this.store.owned(owner, id);
    const c = await this.store.pool.connect();
    let locked = false;
    try {
      locked = (
        await c.query(
          "select pg_try_advisory_lock(hashtextextended($1,0)) as locked",
          [id],
        )
      ).rows[0].locked;
      if (!locked)
        throw new Conflict(
          "This review is processing. Refresh before continuing.",
        );
      await this.store.owned(owner, id);
      return await fn();
    } finally {
      if (locked)
        await c.query("select pg_advisory_unlock(hashtextextended($1,0))", [
          id,
        ]);
      c.release();
    }
  }
  async start(owner: string, applicationId: string) {
    const id = await this.store.start(owner, applicationId);
    return this.locked(owner, id, async () => {
      const row = await this.store.owned(owner, id);
      await this.graph.invoke(
        { id, owner, applicationId, documents: row.documents, issues: [] },
        this.config(id),
      );
      return this.view(owner, id);
    });
  }
  async view(owner: string, id: string): Promise<IntakeView> {
    const row = await this.store.owned(owner, id);
    const snapshot = await this.graph.getState(this.config(id));
    const s = snapshot.values as typeof State.State;
    const w = await this.store.read(owner);
    if (!w) throw new Conflict("Session expired.");
    const a = find(w, row.application_id);
    const stale =
      !row.completed &&
      (a.revision !== row.revision ||
        !["new", "review", "awaiting"].includes(a.stage));
    return {
      id,
      applicationId: row.application_id,
      revision: row.revision,
      checkpoint: snapshot.config?.configurable?.checkpoint_id || "",
      stage: row.completed
        ? "complete"
        : stale
          ? "stale"
          : snapshot.next.includes("clarify")
            ? "clarify"
            : snapshot.next.includes("review")
              ? "review"
              : "retry",
      documents: row.documents,
      extraction: s.extraction,
      draft: s.draft || {},
      issues: s.issues || [],
      model: s.model || "",
    };
  }
  async list(owner: string) {
    const rows = await this.store.scoped(
      owner,
      async (c) =>
        (
          await c.query(
            "select i.id from origin_intakes i join origin_sessions s on s.id=i.owner where i.owner=$1 and i.generation=s.data->>'generation' and s.expires_at>now() order by i.created_at desc limit 20",
            [owner],
          )
        ).rows,
    );
    return Promise.all(rows.map((r) => this.view(owner, r.id)));
  }
  async resume(
    owner: string,
    id: string,
    checkpoint: string,
    action: "clarify" | "approve" | "retry",
    review?: Review,
  ) {
    return this.locked(owner, id, async () => {
      const v = await this.view(owner, id);
      if (v.stage === "complete") return v;
      if (v.checkpoint !== checkpoint)
        throw new Conflict("Review changed in another tab. Refresh first.");
      if (v.stage === "stale")
        throw new Conflict("Documents changed. Start a new review.");
      if (action === "retry") {
        if (v.stage !== "retry")
          throw new Conflict("Complete the current review step.");
        await this.graph.invoke(
          v.checkpoint
            ? null
            : {
                id,
                owner,
                applicationId: v.applicationId,
                documents: v.documents,
                issues: [],
              },
          this.config(id),
        );
      } else {
        if (v.stage !== (action === "approve" ? "review" : "clarify"))
          throw new Conflict("Complete the current review step.");
        const w = await this.store.read(owner);
        if (!w) throw new Conflict("Session expired.");
        const a = find(w, v.applicationId);
        ensureReview(a);
        if (a.revision !== v.revision) throw new Conflict("Documents changed.");
        await this.graph.invoke(
          new Resume({ resume: reviewSchema.parse(review) }),
          this.config(id),
        );
      }
      return this.view(owner, id);
    });
  }
}
