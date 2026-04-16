/**
 * Admin check based on server-loaded role from profiles table.
 * No longer uses hardcoded email list.
 */
export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}
