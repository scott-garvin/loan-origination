import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import { z } from "zod";
import { Store } from "./store.js";
import { Intake } from "./intake.js";
import { OpenAIExtractor } from "./provider.js";
import { createApp } from "./app.js";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_SCHEMA: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default("public"),
    GRAPH_SCHEMA: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default("origin_graph"),
    MIGRATE_ON_START: z.enum(["true", "false"]).default("true"),
    DEMO_ACCESS_KEY: z.string().min(24),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini-2025-04-14"),
    MAX_AI_DAILY: z.coerce.number().int().min(0).default(30),
    MAX_AI_MONTHLY: z.coerce.number().int().min(0).default(300),
    PORT: z.coerce.number().default(8087),
  })
  .parse(process.env);
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  options: `-c search_path=${env.DATABASE_SCHEMA}`,
  max: 6,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
const store = new Store(pool);
const intake = new Intake(
  store,
  env.OPENAI_API_KEY
    ? new OpenAIExtractor(env.OPENAI_API_KEY, env.OPENAI_MODEL)
    : undefined,
  env.MAX_AI_DAILY,
  env.MAX_AI_MONTHLY,
  env.GRAPH_SCHEMA,
);
if (env.MIGRATE_ON_START === "true") {
  await store.migrate();
  await intake.setup();
} else await pool.query("select 1 from origin_sessions limit 0");
const app = createApp(store, {
  key: env.DEMO_ACCESS_KEY,
  intake,
  secure: process.env.NODE_ENV === "production",
  ai: !!env.OPENAI_API_KEY,
});
app.use(express.static("dist"));
const server = app.listen(env.PORT, "0.0.0.0", () =>
  console.log(`Origin ready on ${env.PORT}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  });
