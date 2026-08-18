import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env.ts";
import * as schema from "./schema.ts";

function openDatabase(url: string, prepare: boolean, max: number) {
  const queryClient = postgres(url, { max, prepare });
  return {
    db: drizzle(queryClient, { schema }),
    close: () => queryClient.end(),
  };
}

const appDatabase = openDatabase(env.DATABASE_URL, false, 10);

export const db = appDatabase.db;
export const closeDatabase = appDatabase.close;

export function openDirectDatabase(target: "dev" | "test" | "supabase" = "dev") {
  const url =
    target === "test"
      ? env.TEST_DATABASE_URL
      : target === "supabase"
        ? env.SUPABASE_LOCAL_DATABASE_URL
        : env.DIRECT_DATABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_LOCAL_DATABASE_URL no esta definida.");
  }
  return openDatabase(url, true, 1);
}
