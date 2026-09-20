import { reactive, toRaw } from "vue";
import { z } from "zod";
import {
  seed,
  apply,
  find,
  reviewSchema,
  type Command,
  type Review,
} from "../shared/domain";
import {
  preparedExtraction,
  reconcile,
  type IntakeView,
} from "../shared/extraction";
export const workspace = reactive({
  data: seed(),
  mode: "sample" as "sample" | "live",
  key: "",
  busy: false,
  error: "",
  notice: "",
  intakes: [] as IntakeView[],
  epoch: 0,
});
export async function request(
  path: string,
  body?: unknown,
  key = workspace.key,
) {
  const r = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal: AbortSignal.timeout(120000),
  });
  let v;
  try {
    v = await r.json();
  } catch {
    throw Error(
      "The live API is unavailable here. Open the hosted demo or start the local server.",
    );
  }
  if (!r.ok) throw Error(v.error || "Request failed.");
  return v;
}
export async function run(fn: () => Promise<void>) {
  if (workspace.busy) return;
  workspace.busy = true;
  workspace.error = "";
  workspace.notice = "";
  try {
    await fn();
  } catch (e) {
    workspace.error =
      e instanceof z.ZodError
        ? e.issues[0]?.message
        : e instanceof Error
          ? e.message
          : "Please try again.";
  } finally {
    workspace.busy = false;
  }
}
export async function connect(key: string) {
  if (key.startsWith("sk-"))
    throw Error("Use the Origin demo key, not the OpenAI key.");
  const data = await request("session", {}, key);
  workspace.epoch++;
  workspace.key = key;
  workspace.data = data;
  workspace.mode = "live";
  await refreshRuns();
}
export function disconnect() {
  workspace.epoch++;
  workspace.mode = "sample";
  workspace.key = "";
  workspace.data = seed();
  workspace.intakes = [];
  workspace.error = "";
}
export async function execute(c: Command) {
  const epoch = workspace.epoch;
  if (workspace.mode === "sample") {
    workspace.data = apply(toRaw(workspace.data), c);
    if (c.type === "reset") workspace.intakes = [];
  } else {
    const data = await request("commands", {
      version: workspace.data.version,
      command: c,
    });
    if (epoch !== workspace.epoch) return;
    workspace.data = data;
    if (c.type === "reset") workspace.intakes = [];
  }
  workspace.notice = "Changes saved.";
}
export async function refresh() {
  if (workspace.mode === "live") {
    const epoch = workspace.epoch;
    const data = await request("workspace");
    if (epoch === workspace.epoch) workspace.data = data;
  }
}
export async function refreshRuns() {
  if (workspace.mode === "live") {
    const epoch = workspace.epoch;
    const v = await request("intakes");
    if (epoch === workspace.epoch) workspace.intakes = v;
  }
}
export async function startReview(id: string) {
  if (workspace.mode === "sample") {
    const a = find(workspace.data, id);
    const extraction = preparedExtraction(a.documents);
    const { draft, issues } = reconcile(extraction, a);
    workspace.intakes.unshift({
      id: crypto.randomUUID(),
      applicationId: id,
      revision: a.revision,
      checkpoint: crypto.randomUUID(),
      stage: issues.length ? "clarify" : "review",
      documents: structuredClone(toRaw(a.documents)),
      extraction,
      draft,
      issues,
      model: "Guided parser · no AI call",
    });
  } else {
    try {
      await request("intakes", { applicationId: id });
    } finally {
      await refreshRuns();
    }
  }
}
export async function resumeReview(
  view: IntakeView,
  action: "clarify" | "approve" | "retry",
  review?: Review,
) {
  if (workspace.mode === "sample") {
    const a = find(workspace.data, view.applicationId);
    if (a.revision !== view.revision)
      throw Error("Documents changed. Start a fresh review.");
    const v = workspace.intakes.find((r) => r.id === view.id)!;
    if (action === "clarify") {
      v.draft = reviewSchema.parse(review);
      v.stage = "review";
      v.checkpoint = crypto.randomUUID();
    } else if (action === "approve") {
      await execute({
        type: "verify",
        id: a.id,
        revision: view.revision,
        review: reviewSchema.parse(review),
      });
      v.stage = "complete";
    }
  } else {
    try {
      await request("intakes/" + view.id + "/resume", {
        checkpoint: view.checkpoint,
        action,
        review,
      });
    } finally {
      await refreshRuns();
      await refresh();
    }
  }
}
