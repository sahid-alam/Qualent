import { and, count, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { requireUserId, guardPage } from "../../../lib/auth/session.ts";
import { withTenant, withUser } from "../../../lib/db/client.ts";
import { leads, profiles } from "../../../lib/db/schema.ts";
import { listMyTenants } from "../../../lib/permissions.ts";
import { BottomBar, Page, Sidebar, type NavItem } from "../../../components/shell";
import { signOutAction, toggleThemeAction } from "../../auth-actions";

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { can } = await guardPage(tenantId, "leads.read");
  const userId = await requireUserId();

  const [tenants, [{ waiting }], [profile], store] = await Promise.all([
    listMyTenants(userId),
    withTenant(tenantId, (db) => db.select({ waiting: count() }).from(leads).where(and(isNull(leads.ownerMemberId), eq(leads.status, "open")))),
    withUser(userId, (db) => db.select().from(profiles).where(eq(profiles.id, userId))),
    cookies(),
  ]);

  const base = `/c/${tenantId}`;
  const items: NavItem[] = [
    { href: `${base}/today`, label: "Today", icon: "today", primary: true },
    { href: `${base}/inbox`, label: "New leads", icon: "inbox", badge: waiting, primary: true },
    { href: `${base}/pipeline`, label: "Pipeline", icon: "pipeline", primary: true },
    { href: `${base}/leads`, label: "All leads", icon: "leads", primary: true },
    { href: `${base}/reports`, label: "Reports", icon: "reports" },
    ...(can("settings.manage")
      ? ([
          { href: `${base}/automations`, label: "Automations", icon: "automations" },
          { href: `${base}/meta`, label: "Meta results", icon: "meta" },
          { href: `${base}/setup`, label: "Client setup", icon: "setup" },
        ] satisfies NavItem[])
      : []),
    { href: `${base}/more`, label: "More", icon: "more", primary: true, compactOnly: true },
  ];

  return (
    <div className="flex min-h-dvh gap-2.5 p-0 sm:p-2.5">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <Sidebar
        items={items}
        tenants={tenants.filter((tenant) => tenant.role !== "client_viewer")}
        currentTenant={tenantId}
        userName={profile?.name ?? ""}
        theme={store.get("qualent_theme")?.value === "light" ? "light" : "dark"}
        toggleTheme={toggleThemeAction}
        signOut={signOutAction}
      />
      <Page>{children}</Page>
      <BottomBar items={items} />
    </div>
  );
}
