import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

async function runMigration() {
  console.log("\n========================================================");
  console.log("       ScrubX Database Schema Migration Runner         ");
  console.log("========================================================\n");

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.error("Error: DATABASE_URL is not set in .env.local.");
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), "supabase/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`Error: Migrations directory not found at ${migrationsDir}`);
    process.exit(1);
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log("No SQL migration files found in supabase/migrations/.");
    process.exit(0);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  try {
    // 1. Create migration journal table if it does not exist
    await client`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        name text PRIMARY KEY,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    // 2. Fetch already executed migrations
    const executedRows = await client<{ name: string }[]>`
      SELECT name FROM _app_migrations
    `;
    const executedSet = new Set(executedRows.map((r) => r.name));

    // If initial migration is not recorded but products table exists, baseline it
    if (!executedSet.has("20261105000000_initial_schema.sql")) {
      const [existingTable] = await client<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'products'
        ) as exists
      `;
      if (existingTable?.exists) {
        console.log("Baseline: 'products' table already exists. Marking '20261105000000_initial_schema.sql' as applied.");
        await client`INSERT INTO _app_migrations (name) VALUES ('20261105000000_initial_schema.sql') ON CONFLICT DO NOTHING`;
        executedSet.add("20261105000000_initial_schema.sql");
      }
    }

    console.log(`Discovered ${migrationFiles.length} migration file(s):`);
    for (const file of migrationFiles) {
      if (executedSet.has(file)) {
        console.log(`  - ${file} [Already Applied]`);
      } else {
        console.log(`  - ${file} [Pending]`);
      }
    }

    // 3. Execute pending migrations sequentially in a transaction
    for (const file of migrationFiles) {
      if (executedSet.has(file)) continue;

      const fullPath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(fullPath, "utf-8");
      console.log(`\nExecuting pending migration: ${file}...`);
      const start = performance.now();

      await client.begin(async (sql) => {
        await sql.unsafe(sqlContent);
        await sql`INSERT INTO _app_migrations (name) VALUES (${file})`;
      });

      const elapsed = Math.round(performance.now() - start);
      console.log(`  ✓ Successfully applied ${file} in ${elapsed}ms!`);
    }

    console.log("\nAll pending migrations applied successfully!");

    // Verify created tables
    const tables = await client<{ table_name: string }[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != '_app_migrations'
      ORDER BY table_name;
    `;

    console.log(`\nVerified ${tables.length} application tables in 'public' schema:`);
    console.log(tables.map((t) => `  - ${t.table_name}`).join("\n"));
    console.log("\n========================================================\n");
  } catch (err: unknown) {
    const error = err as Error;
    console.error("\nMigration Failed!");
    console.error(`Error: ${error.message.replace(/:[^:@]+@/, ":******@")}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
