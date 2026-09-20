import "dotenv/config";
import { Pool } from "pg";
import { z } from "zod";
import { Store } from "../server/store.js";
import { Intake } from "../server/intake.js";
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
  })
  .parse(process.env);
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  options: `-c search_path=${env.DATABASE_SCHEMA}`,
  max: 4,
  connectionTimeoutMillis: 10000,
});
try {
  const store = new Store(pool);
  await store.migrate();
  await new Intake(store, undefined, 30, 300, env.GRAPH_SCHEMA).setup();
  console.log("Origin application and graph schemas migrated.");
} finally {
  await pool.end();
}
