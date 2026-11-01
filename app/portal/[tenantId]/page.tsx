import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUserId, guardPage } from "../../../lib/auth/session.ts";
import { withTenant } from "../../../lib/db/client.ts";
import { tenants } from "../../../lib/db/schema.ts";
import { campaignReport, leadSummary } from "../../../lib/reports.ts";
import { listAnalyses } from "../../../lib/settings.ts";
import { lastDays } from "../../../lib/time.ts";
import { CampaignReport, DateRange } from "../../../components/report-view";
import { Label, PageHeader, Panel } from "../../../components/ui";

/** Numbers only: this page has no access to individual leads. */
export default async function PortalPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { tenantId } = await params;
  if (!(await currentUserId())) redirect(`/portal/${tenantId}/login`);
  await guardPage(tenantId, "reports.client");

  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));
  const search = await searchParams;
  const range = { ...lastDays(30, tenant.timezone), ...(search.from && search.to ? { from: search.from, to: search.to } : {}) };
  const [report, summary, analyses] = await Promise.all([campaignReport(tenantId, range.from, range.to), leadSummary(tenantId, range.from, range.to), listAnalyses(tenantId, "approved")]);

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] content-start gap-5 rounded-panel border border-line bg-panel bg-(image:--wash-soft) bg-size-[100%_15rem] bg-no-repeat p-4 sm:px-7.5 sm:py-7">
      <PageHeader title="Results by campaign" subtitle="Which ads bring qualified leads, not just cheap ones." />
      <DateRange from={range.from} to={range.to} />
      <CampaignReport report={report} summary={summary} currency={tenant.currency} />
      {!!analyses.length && (
        <Panel className="grid gap-2">
          <Label>This week&apos;s recommendation</Label>
          <p className="max-w-[70ch] text-sm">{analyses[0].body}</p>
        </Panel>
      )}
    </main>
  );
}
