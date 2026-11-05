import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";
const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL in .env.local.");
const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS public.scrubx_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE public.scrubx_migrations ENABLE ROW LEVEL SECURITY`;
  for (const name of (await readdir("supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const content = await readFile(`supabase/migrations/${name}`, "utf8");
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(76534982)`;
      if (
        (
          await tx`SELECT name FROM public.scrubx_migrations WHERE name = ${name}`
        ).length
      )
        return;
      await tx.unsafe(content);
      await tx`INSERT INTO public.scrubx_migrations (name) VALUES (${name})`;
      console.log(`Applied ${name}`);
    });
  }
} finally {
  await sql.end();
}
