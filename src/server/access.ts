import { isAdmin } from "@/lib/roles";
import "server-only";
import { getAuth } from "@/lib/auth";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireAdmin(headers: Headers, auth = getAuth()) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new HttpError(401, "Sign in to continue.");
  if (!isAdmin(session.user))
    throw new HttpError(403, "Administrator access required.");
  return session;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(process.env.BETTER_AUTH_URL!).origin)
    throw new HttpError(403, "Untrusted request origin.");
}
