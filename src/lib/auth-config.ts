import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
export function configureAuth(
  database: NonNullable<BetterAuthOptions["database"]>,
) {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters.");
  if (!process.env.BETTER_AUTH_URL)
    throw new Error("Set BETTER_AUTH_URL to the application's public origin.");
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [process.env.BETTER_AUTH_URL],
    database,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    plugins: [admin({ defaultRole: "customer", adminRoles: ["admin"] })],
  });
}
