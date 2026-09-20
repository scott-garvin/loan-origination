import { Pool } from "pg";
import { Store } from "../server/store.js";
import { Intake } from "../server/intake.js";
import { createApp } from "../server/app.js";
import { preparedExtraction } from "../shared/extraction.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/origin_test")
  throw Error("Only origin_test is allowed");
const pool = new Pool({ connectionString: url, max: 8 });
const store = new Store(pool);
await store.migrate();
const intake = new Intake(store, {
  async extract(docs) {
    return { result: preparedExtraction(docs), model: "test-fixture" };
  },
});
await intake.setup();
createApp(store, {
  key: "test-origin-key-not-a-secret",
  intake,
  ai: true,
}).listen(8088, "127.0.0.1", () => console.log("Test API ready"));
