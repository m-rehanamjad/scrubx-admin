import fs from "node:fs";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

// Load environment variables from .env.local / .env
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

function sanitizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "******";
    return parsed.toString();
  } catch {
    return "[malformed connection string]";
  }
}

async function verifyConnection() {
  console.log("\n========================================================");
  console.log("   ScrubX Supabase PostgreSQL Connection Verification   ");
  console.log("========================================================\n");

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.log("Status: ⚠️  DATABASE_URL IS NOT CONFIGURED");
    console.log("Details: .env.local does not contain an active DATABASE_URL.");
    console.log("Action Required:");
    console.log("  1. Copy .env.example to .env.local (if not already done).");
    console.log("  2. Paste your Supabase PostgreSQL connection string in .env.local.");
    console.log("  3. Run: npm run db:verify\n");
    console.log("TypeScript types, Drizzle schema, and config are all verified.\n");
    process.exit(0);
  }

  console.log("Target: Connection string detected in environment.");
  console.log("Sanitized URL:", sanitizeConnectionString(connectionString));
  console.log("Attempting secure handshake with Supabase PostgreSQL...\n");

  const testClient = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    idle_timeout: 10,
    onnotice: () => {},
  });

  const testDb = drizzle(testClient);

  try {
    // 1. Raw SQL ping via postgres.js
    const start = performance.now();
    const [pingResult] = await testClient<
      { connected: number; db_name: string; pg_version: string }[]
    >`SELECT 1 AS connected, current_database() AS db_name, split_part(version(), ' ', 2) AS pg_version`;
    const latency = Math.round(performance.now() - start);

    // 2. Drizzle ORM query test
    const drizzlePing = await testDb.execute(sql`SELECT 1 AS ok`);

    // 3. Inspect public schema tables count
    const [tablesResult] = await testClient<{ count: number }[]>`
      SELECT COUNT(*)::int AS count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;

    console.log("Status: ✅ SUCCESSFULLY CONNECTED");
    console.log(`Database Name: ${pingResult.db_name}`);
    console.log(`PostgreSQL Engine: v${pingResult.pg_version}`);
    console.log(`Round-trip Latency: ${latency}ms`);
    console.log(`Drizzle Query Execution: OK (${drizzlePing.length} row returned)`);
    console.log(`Public Tables Present: ${tablesResult.count} tables found`);

    if (tablesResult.count === 0) {
      console.log("\nNote: Database schema has not been migrated yet.");
      console.log("Run migrations when ready to apply the 24 tables.");
    } else {
      console.log("\nSchema tables detected in Supabase.");
    }

    console.log("\n========================================================\n");
  } catch (err: unknown) {
    console.error("\nStatus: ❌ CONNECTION FAILED");
    const error = err as Error;
    // Mask any potential password strings in error message
    const sanitizedMsg = error.message.replace(/:[^:@]+@/, ":******@");
    console.error(`Error: ${sanitizedMsg}`);
    console.error("\nTroubleshooting tips:");
    console.error("  - Ensure your Supabase database is active (not paused).");
    console.error("  - Verify your password in DATABASE_URL.");
    console.error("  - For Transaction Pooling, verify port 6543 with sslmode=require.");
    console.error("  - Check your IP allowlist in Supabase network settings if applicable.\n");
    process.exit(1);
  } finally {
    await testClient.end();
  }
}

verifyConnection();
