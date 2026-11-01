import { and, asc, eq } from "drizzle-orm";
import { withPlatform, withTenant, withUser } from "./db/client.ts";
import { members, profiles, tenants, type Role } from "./db/schema.ts";

export type Action =
  | "leads.read"
  | "leads.write"
  | "leads.export"
  | "contacts.erase"
  | "settings.manage"
  | "connections.manage"
  | "reports.team"
  | "reports.client";

const STAFF: Action[] = ["leads.read", "leads.write", "reports.client"];

const PERMISSIONS: Record<Role, readonly Action[]> = {
  manager: [...STAFF, "leads.export", "contacts.erase", "settings.manage", "connections.manage", "reports.team"],
  agent: STAFF,
  client_viewer: ["reports.client"],
  // No login. Acts only through Telegram.
  field_agent: [],
};

export function can(role: Role | "platform_admin", action: Action) {
  return role === "platform_admin" || PERMISSIONS[role].includes(action);
}

export class ForbiddenError extends Error {}

export type Membership = { tenantId: string; memberId: string | null; role: Role | "platform_admin"; recordScope: "all" | "assigned" };

/** Call with the user id from the verified session. Throws if not allowed. */
export async function requireMember(userId: string, tenantId: string, action: Action): Promise<Membership> {
  const [profile] = await withUser(userId, (db) => db.select().from(profiles).where(eq(profiles.id, userId)));
  if (profile?.isPlatformAdmin) return { tenantId, memberId: null, role: "platform_admin", recordScope: "all" };

  const [member] = await withTenant(tenantId, (db) =>
    db
      .select()
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.active, true))),
  );
  if (!member || !can(member.role, action)) throw new ForbiddenError(action);
  return { tenantId, memberId: member.id, role: member.role, recordScope: member.recordScope };
}

export function listMemberships(userId: string) {
  return withUser(userId, (db) => db.select().from(members).where(eq(members.userId, userId)));
}

export function isPlatformAdmin(userId: string) {
  return withUser(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    return !!profile?.isPlatformAdmin;
  });
}

/** The clients this person can open, for the switcher and the first redirect. */
export async function listMyTenants(userId: string) {
  if (await isPlatformAdmin(userId)) {
    const rows = await withPlatform((db) => db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(asc(tenants.name)));
    return rows.map((row) => ({ ...row, role: "platform_admin" as const }));
  }
  const memberships = (await listMemberships(userId)).filter((row) => row.active);
  const rows = [];
  for (const membership of memberships) {
    const [tenant] = await withTenant(membership.tenantId, (db) =>
      db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, membership.tenantId)),
    );
    rows.push({ ...tenant, role: membership.role });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
