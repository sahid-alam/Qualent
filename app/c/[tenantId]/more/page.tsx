import { cookies } from "next/headers";
import Link from "next/link";
import { guardPage, requireUserId } from "../../../../lib/auth/session.ts";
import { listMyTenants } from "../../../../lib/permissions.ts";
import { buttonClass, Label, PageHeader } from "../../../../components/ui";
import { signOutAction, toggleThemeAction } from "../../../auth-actions";

export const metadata = { title: "More · Qualent" };

const rowClass = "flex min-h-11 items-center rounded-row border border-line bg-card px-4 py-2.5 hover:border-line-hover";

/** What doesn't fit in the phone's bottom bar and the narrow rail. */
export default async function MorePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { can } = await guardPage(tenantId, "leads.read");
  const tenants = (await listMyTenants(await requireUserId())).filter((tenant) => tenant.role !== "client_viewer");
  const dark = (await cookies()).get("qualent_theme")?.value !== "light";

  return (
    <>
      <PageHeader title="More" />
      {can("settings.manage") && (
        <nav aria-label="More" className="grid gap-2">
          <Link href={`/c/${tenantId}/setup`} className={rowClass}>Settings</Link>
        </nav>
      )}
      {tenants.length > 1 && (
        <section className="grid gap-2">
          <Label>Switch client</Label>
          {tenants.map((tenant) => (
            <Link key={tenant.id} href={`/c/${tenant.id}/today`} aria-current={tenant.id === tenantId ? "page" : undefined} className={`${rowClass} aria-[current=page]:border-accent-line aria-[current=page]:text-accent`}>
              {tenant.name}
            </Link>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={toggleThemeAction}><button className={buttonClass()}>{dark ? "Light mode" : "Dark mode"}</button></form>
        <form action={signOutAction}><button className={buttonClass("ghost")}>Sign out</button></form>
      </div>
    </>
  );
}
