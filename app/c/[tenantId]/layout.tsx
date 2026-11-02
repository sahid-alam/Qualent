import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { requireUserId, guardPage } from "../../../lib/auth/session.ts";
import { withTenant, withUser } from "../../../lib/db/client.ts";
import { profiles, tenants as tenantsTable } from "../../../lib/db/schema.ts";
import { listMyTenants } from "../../../lib/permissions.ts";
import { queueCounts } from "../../../lib/queries.ts";
import { BottomBar, Page, Sidebar, type NavItem } from "../../../components/shell";
import { signOutAction, toggleThemeAction } from "../../auth-actions";

const ROLE_LABEL: Record<string, string> = { platform_admin: "7Gence admin", owner: "Owner", admin: "Admin", manager: "Manager", agent: "Agent" };

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { can, membership } = await guardPage(tenantId, "leads.read");
  const userId = await requireUserId();

  const [tenants, counts, [tenant], [profile], store] = await Promise.all([
    listMyTenants(userId),
    queueCounts(tenantId, membership),
    withTenant(tenantId, (db) => db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId))),
    withUser(userId, (db) => db.select().from(profiles).where(eq(profiles.id, userId))),
    cookies(),
  ]);

  const base = `/c/${tenantId}`;
  const items: NavItem[] = [
    { href: `${base}/today`, label: "Today", icon: "today", badge: counts.needs, urgent: true, primary: true },
    { href: `${base}/leads`, label: "Leads", icon: "leads", badge: counts.unowned, primary: true, also: [`${base}/inbox`, `${base}/pipeline`] },
    { href: `${base}/reports`, label: "Reports", icon: "reports", primary: true },
    ...(can("settings.manage") ? ([{ href: `${base}/setup`, label: "Settings", icon: "setup", also: [`${base}/meta`, `${base}/automations`] }] satisfies NavItem[]) : []),
    { href: `${base}/more`, label: "More", icon: "more", primary: true, compactOnly: true },
  ];

  return (
    <div className="flex min-h-dvh gap-2.5 p-0 sm:p-2.5">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <Sidebar
        items={items}
        tenants={tenants.filter((item) => item.role !== "client_viewer")}
        currentTenant={tenantId}
        clientName={tenant.name}
        userName={profile?.name ?? ""}
        userRole={ROLE_LABEL[membership.role] ?? membership.role}
        theme={store.get("qualent_theme")?.value === "light" ? "light" : "dark"}
        toggleTheme={toggleThemeAction}
        signOut={signOutAction}
      />
      <Page>{children}</Page>
      <BottomBar items={items} />
    </div>
  );
}
