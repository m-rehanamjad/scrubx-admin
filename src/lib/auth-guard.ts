import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./auth.ts";
import type { AdminRole, UserRole } from "../db/schema/index.ts";

export type { AdminRole, UserRole };

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  staff: 1,
};

/**
 * Retrieve the current session on the server.
 * Returns null if unauthenticated or invalid.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return session;
  } catch {
    return null;
  }
}

/**
 * Enforce that a request originates from an authenticated user.
 * Redirects to /login if no valid session is present.
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();

  if (!session || !session.user) {
    redirect("/login");
  }

  // Check ban status
  const user = session.user as typeof session.user & { banned?: boolean };
  if (user.banned) {
    redirect("/login?error=banned");
  }

  return session;
}

/**
 * Enforce role-based access control (RBAC) on the server.
 * Protects against privilege escalation and manipulated client state.
 */
export async function requireRole(allowedRoles: AdminRole[]): Promise<Session> {
  const session = await requireAuth();
  const user = session.user as typeof session.user & { role?: string };
  const userRole = (user.role as AdminRole) || "staff";

  if (!allowedRoles.includes(userRole)) {
    redirect("/login?error=forbidden");
  }

  return session;
}

/**
 * Require at least staff access (can view dashboard, orders, inventory).
 */
export async function requireStaff(): Promise<Session> {
  return requireRole(["super_admin", "admin", "staff"]);
}

/**
 * Require at least admin access (can create products, approve payments, adjust stock).
 */
export async function requireAdmin(): Promise<Session> {
  return requireRole(["super_admin", "admin"]);
}

/**
 * Require super_admin access (manage store settings, admin accounts, sensitive actions).
 */
export async function requireSuperAdmin(): Promise<Session> {
  return requireRole(["super_admin"]);
}

/**
 * Helper to check role hierarchy without throwing.
 */
export function hasMinimumRole(userRole: string | undefined, minimumRole: AdminRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY[userRole as AdminRole] || 0;
  const minLevel = ROLE_HIERARCHY[minimumRole] || 0;
  return userLevel >= minLevel;
}
