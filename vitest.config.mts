import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // El alias existe por compatibilidad con el scaffold. La convencion de este
    // proyecto son especificadores relativos con extension .ts (ver CLAUDE.md).
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // El bundle del blueprint vive dentro del proyecto: sin esta exclusion
    // vitest recolectaria los archivos de blueprints/*/workspace/tests/.
    exclude: [
      "blueprints/**",
      "**/node_modules/**",
      ".next/**",
      "tests/e2e/**",
      "playwright-report/**",
      "test-results/**",
    ],
    setupFiles: ["./tests/setup.ts"],
    // Las pruebas de integracion comparten una sola base Postgres: un solo
    // proceso evita que dos archivos hagan TRUNCATE al mismo tiempo.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
