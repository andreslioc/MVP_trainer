#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
corepack enable --install-directory "$HOME/.local/bin"
corepack prepare pnpm@11.22.0 --activate

BUNDLE_DIR="blueprints/super-store-sales-os"
test -d "$BUNDLE_DIR/workspace"

while IFS= read -r source; do
  relative="${source#${BUNDLE_DIR}/workspace/}"
  target="./${relative}"
  if [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    cp "$source" "$target"
  fi
done < <(find "$BUNDLE_DIR/workspace" -type f -print)

chmod +x scripts/check-supabase-cli.sh
pnpm supabase:check 2>/dev/null || scripts/check-supabase-cli.sh

if [ ! -f package.json ] || [ ! -f src/app/layout.tsx ] || [ ! -f src/app/page.tsx ] || [ ! -f src/app/globals.css ]; then
  scaffold_dir="$(mktemp -d)"
  trap 'rm -rf "$scaffold_dir"' EXIT
  pnpm create next-app@16.3.1 "$scaffold_dir/app" --ts --tailwind --biome --app --src-dir --import-alias '@/*' --use-pnpm --yes
  cp "$scaffold_dir/app/package.json" package.json
  cp "$scaffold_dir/app/postcss.config.mjs" postcss.config.mjs
  mkdir -p src/app
  test -f src/app/layout.tsx || cp "$scaffold_dir/app/src/app/layout.tsx" src/app/layout.tsx
  test -f src/app/page.tsx || cp "$scaffold_dir/app/src/app/page.tsx" src/app/page.tsx
  test -f src/app/globals.css || cp "$scaffold_dir/app/src/app/globals.css" src/app/globals.css
fi

node <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

packageJson.packageManager = "pnpm@11.22.0";
packageJson.engines = { ...packageJson.engines, node: ">=24.19.0 <25" };
packageJson.scripts = {
  ...packageJson.scripts,
  dev: "next dev",
  build: "next build",
  typecheck: "tsc --noEmit",
  lint: "biome check .",
  format: "biome check --write .",
  test: "vitest run",
  "test:e2e": "playwright test",
  "db:up": "docker compose up -d --wait",
  "db:down": "docker compose down",
  "db:reset": "docker compose down -v && docker compose up -d --wait",
  "db:generate": "drizzle-kit generate",
  "db:generate:custom": "drizzle-kit generate --custom",
  "db:migrate": "drizzle-kit migrate",
  "db:migrate:test": "DRIZZLE_TARGET=test drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx scripts/seed.ts",
  "env:local": "tsx scripts/write-env-local.ts",
  "env:local:supabase": "supabase status -o env > .supabase-status.env && tsx scripts/write-env-local.ts --from-supabase",
  "supabase:check": "bash scripts/check-supabase-cli.sh",
  "supabase:start": "pnpm supabase:check && supabase start",
  "supabase:stop": "supabase stop",
};

fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
NODE

pnpm add --save-exact next@16.3.1 react@19.2.8 react-dom@19.2.8 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 drizzle-orm@0.45.2 postgres@3.4.9 @supabase/supabase-js@2.112.3 @supabase/ssr@0.12.4 @anthropic-ai/sdk@0.117.1 zod@4.4.3 react-hook-form@7.85.0 @hookform/resolvers@5.9.1 @tanstack/react-query@5.101.4
pnpm add --save-dev --save-exact typescript@6.0.3 @types/node@24.13.3 @types/react@19.2.18 @types/react-dom@19.2.4 @biomejs/biome@2.5.9 drizzle-kit@0.31.10 vitest@4.1.11 @playwright/test@1.62.1 tsx@4.23.12
node <<'NODE'
const fs = require("node:fs");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const pinned = {
  dependencies: {
    "@anthropic-ai/sdk": "0.117.1",
    "@hookform/resolvers": "5.9.1",
    "@supabase/ssr": "0.12.4",
    "@supabase/supabase-js": "2.112.3",
    "@tanstack/react-query": "5.101.4",
    "@tailwindcss/postcss": "4.3.3",
    "drizzle-orm": "0.45.2",
    next: "16.3.1",
    postgres: "3.4.9",
    react: "19.2.8",
    "react-dom": "19.2.8",
    "react-hook-form": "7.85.0",
    tailwindcss: "4.3.3",
    zod: "4.4.3",
  },
  devDependencies: {
    "@biomejs/biome": "2.5.9",
    "@playwright/test": "1.62.1",
    "@types/node": "24.13.3",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "drizzle-kit": "0.31.10",
    tsx: "4.23.12",
    typescript: "6.0.3",
    vitest: "4.1.11",
  },
};

packageJson.dependencies = { ...packageJson.dependencies, ...pinned.dependencies };
packageJson.devDependencies = { ...packageJson.devDependencies, ...pinned.devDependencies };
for (const name of Object.keys(pinned.dependencies)) delete packageJson.devDependencies[name];
for (const name of Object.keys(pinned.devDependencies)) delete packageJson.dependencies[name];
fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
pnpm install --lockfile-only
pnpm approve-builds --all
pnpm install --frozen-lockfile

pnpm env:local
git init
git config user.name >/dev/null 2>&1 || git config user.name "Super Store Builder"
git config user.email >/dev/null 2>&1 || git config user.email "builder@super-store.local"
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "chore: bootstrap Super Store Sales OS"
fi
