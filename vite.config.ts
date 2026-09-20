import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    port: 5176,
    host: "127.0.0.1",
    proxy: { "/api": process.env.ORIGIN_API_TARGET || "http://127.0.0.1:8087" },
  },
});
