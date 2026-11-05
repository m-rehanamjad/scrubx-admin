import "server-only";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import {
  baUser,
  baSession,
  baAccount,
  baVerification,
  baRateLimit,
} from "@/db/schema";
import { configureAuth } from "./auth-config";
function createAuth() {
  return configureAuth(
    drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: baUser,
        session: baSession,
        account: baAccount,
        verification: baVerification,
        rateLimit: baRateLimit,
      },
    }),
  );
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
