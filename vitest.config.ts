import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The tests, kept apart from `vite.config.ts` so the federation plugin is not
 * part of them: the view is tested as the component it is, rendered into a
 * DOM, and the server module as the bundle that ships.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    // Packing the tarball and building a NestJS module both take a moment on
    // a cold runner.
    testTimeout: 30_000,
  },
});
