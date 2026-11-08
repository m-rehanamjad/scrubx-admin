import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

// Load environment variables for scripts & runtime if not already loaded by Next.js
if (typeof process !== "undefined" && typeof process.loadEnvFile === "function") {
  if (fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  } else if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  }
}

// 1. Strict Client/Server Boundary Guard
if (typeof window !== "undefined") {
  throw new Error(
    "Security Violation: Database client (src/db) cannot be imported in client-side components. Database operations are strictly server-only."
  );
}

// 2. Global Type Declaration for Connection Caching in Development
declare global {
  var __scrubx_postgres_client__: postgres.Sql | undefined;
}

const connectionString =
  process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

/**
 * Check whether the database connection string is configured in the environment.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL);
}

/**
 * Creates or retrieves the singleton postgres.js client instance.
 * - Uses singleton on globalThis in non-production to prevent connection leaks during Next.js HMR.
 * - Enforces prepare: false (required for Supabase PgBouncer / Supavisor transaction pooler).
 */
function getPostgresClient(): postgres.Sql {
  if (process.env.NODE_ENV !== "production" && globalThis.__scrubx_postgres_client__) {
    return globalThis.__scrubx_postgres_client__;
  }

  const client = postgres(connectionString || "postgresql://localhost:5432/postgres", {
    prepare: false, // Required for Supavisor / PgBouncer transaction mode (port 6543)
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30, // 30 minutes connection lifetime
    onnotice: () => {}, // Suppress noisy notice logs
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__scrubx_postgres_client__ = client;
  }

  return client;
}

export const client = getPostgresClient();

/**
 * Drizzle ORM instance with full schema and relations.
 */
export const db = drizzle(client, { schema });

export type Database = typeof db;
export * from "./schema/index.ts";
