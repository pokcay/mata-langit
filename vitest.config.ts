import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Frontend unit tests run under Node (no DOM needed — the XLSX parser uses
// TextDecoder/File, both available as Node globals). The `@` alias mirrors
// vite.config.ts / tsconfig so test imports resolve the same way as the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app/frontend", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
})
