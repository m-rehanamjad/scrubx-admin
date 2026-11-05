import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
export function getSql() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL must be configured with your Supabase PostgreSQL connection string.",
    );
  return (client ??= postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
  }));
}
export function getDb() {
  return drizzle(getSql(), { schema });
}
