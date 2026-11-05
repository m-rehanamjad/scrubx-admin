import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const {
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password,
  ADMIN_NAME: name = "Store Admin",
} = process.env;
const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!url || !email || !password || password.length < 12)
  throw new Error(
    "Set DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD (12+ characters) in your local environment.",
  );
const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
try {
  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    if (
      (await tx`SELECT id FROM ba_user WHERE email = ${email.toLowerCase()}`)
        .length
    )
      throw new Error("User already exists. No role or password was changed.");
    const id = randomUUID();
    await tx`INSERT INTO ba_user (id, name, email, role, email_verified) VALUES (${id}, ${name}, ${email.toLowerCase()}, 'admin', true)`;
    await tx`INSERT INTO ba_account (id, account_id, provider_id, user_id, password) VALUES (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})`;
  });
  console.log(
    "Administrator created. Remove ADMIN_PASSWORD from your environment now.",
  );
} finally {
  await sql.end();
}
