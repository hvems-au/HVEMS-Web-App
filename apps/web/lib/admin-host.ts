/** True when the request host is the HVEMS administration console's address (SoW §2.3). */
export function isAdminHost(host: string | null): boolean {
  const adminHost = process.env.ADMIN_HOST ?? "admin.localhost:3000";
  return !!host && host.toLowerCase() === adminHost.toLowerCase();
}
