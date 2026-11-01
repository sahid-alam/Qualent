import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import { brandStyle, type Brand } from "../../../lib/brand.ts";
import { currentUserId } from "../../../lib/auth/session.ts";
import { withTenant } from "../../../lib/db/client.ts";
import { tenants } from "../../../lib/db/schema.ts";
import { signOutAction } from "../../auth-actions";

export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }) {
  const brand = await loadBrand((await params).tenantId);
  return { title: brand?.name ?? "Report" };
}

async function loadBrand(tenantId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));
  if (!tenant) return null;
  return { ...(tenant.brand as Brand), name: (tenant.brand as Brand).name ?? tenant.name };
}

/** Client branding lives only here. The Workspace stays Qualent-branded. */
export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const brand = await loadBrand(tenantId);
  if (!brand) notFound();
  const theme = (await cookies()).get("qualent_theme")?.value === "light" ? "light" : "dark";
  const signedIn = !!(await currentUserId());

  return (
    <div data-theme={theme} style={brandStyle(brand) as CSSProperties} className="min-h-dvh bg-canvas p-2.5 text-fg">
      <div className="mx-auto grid max-w-[70rem] gap-2.5">
        <header className="flex items-center justify-between gap-3 rounded-panel border border-line bg-panel px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a stored data URL, so next/image adds nothing
              <img src={brand.logo} alt="" className="max-h-8 w-auto" />
            ) : (
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-(image:--gradient-accent) text-sm font-semibold text-on-accent">{brand.name[0]}</span>
            )}
            <p className="truncate text-md font-semibold tracking-tight">{brand.name}</p>
          </div>
          {signedIn && (
            <form action={signOutAction}>
              <button className="text-sm text-fg-muted hover:text-fg">Sign out</button>
            </form>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
