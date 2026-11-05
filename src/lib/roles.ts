export function isAdmin(
  user: { role?: string | null; banned?: boolean | null } | null | undefined,
): boolean {
  return user?.role === "admin" && !user.banned;
}
