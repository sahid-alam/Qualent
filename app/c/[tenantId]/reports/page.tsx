import { eq } from "drizzle-orm";
import { guardPage } from "../../../../lib/auth/session.ts";
import { withTenant } from "../../../../lib/db/client.ts";
import { tenants } from "../../../../lib/db/schema.ts";
import { campaignReport, leadSummary, teamReport } from "../../../../lib/reports.ts";
import { listAnalyses } from "../../../../lib/settings.ts";
import { lastDays } from "../../../../lib/time.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { BarRow, CampaignReport, DateRange } from "../../../../components/report-view";
import { formatMinutes, Label, LinkButton, PageHeader, Panel, Pill, TableWrap } from "../../../../components/ui";
import { approveAnalysisAction } from "../actions";

export const metadata = { title: "Reports · Qualent" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { tenantId } = await params;
  const { can } = await guardPage(tenantId, "reports.client");
  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));
  const search = await searchParams;
  const range = { ...lastDays(30, tenant.timezone), ...(search.from && search.to ? { from: search.from, to: search.to } : {}) };

  const [report, summary] = await Promise.all([campaignReport(tenantId, range.from, range.to), leadSummary(tenantId, range.from, range.to)]);
  const team = can("reports.team") ? await teamReport(tenantId, range.from, range.to) : null;
  const analyses = can("reports.team") ? await listAnalyses(tenantId) : [];
  const widest = Math.max(1, ...(team?.funnel.map((row) => row.leads) ?? [1]));

  return (
    <>
      <PageHeader title="Reports" subtitle="This is what the client sees, plus your team's numbers." actions={<LinkButton href={`/portal/${tenantId}`}>Open client view</LinkButton>} />
      <DateRange from={range.from} to={range.to} />
      <CampaignReport report={report} summary={summary} currency={tenant.currency} />

      {!!analyses.length && (
        <Panel className="grid gap-3">
          <Label>Weekly ad analysis</Label>
          {analyses.map((analysis) => (
            <div key={analysis.id} className="grid gap-2 rounded-card bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-fg-muted">Week of {analysis.periodStart}</span>
                <Pill tone={analysis.status === "approved" ? "good" : "warn"}>{analysis.status === "approved" ? "Client can see this" : "Draft, client can't see this"}</Pill>
              </div>
              <p className="max-w-[70ch] text-sm">{analysis.body}</p>
              {analysis.status === "draft" && (
                <ActionForm action={approveAnalysisAction} hidden={{ tenantId, analysisId: analysis.id }}>
                  <Submit size="sm">Approve for the client</Submit>
                </ActionForm>
              )}
            </div>
          ))}
        </Panel>
      )}

      {team && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 desk:grid-cols-2">
          <section className="rounded-tile border border-line bg-card px-5.5 py-5">
            <h2 className="text-base font-medium">Leads reaching each stage</h2>
            <div className="mt-4 grid gap-3.25">
              {team.funnel.map((row) => <BarRow key={row.stage_id} label={row.name} value={row.leads} share={row.leads / widest} />)}
            </div>
          </section>
          <section className="grid content-start gap-2.5">
            <Label className="ps-1.5">Team</Label>
            <TableWrap>
              <thead><tr><th>Person</th><th className="num">Leads</th><th className="num">First reply</th></tr></thead>
              <tbody>
                {team.people.map((person) => (
                  <tr key={person.member_id}>
                    <td className="font-medium">{person.name}</td>
                    <td className="num">{person.leads}</td>
                    <td className="num">{formatMinutes(person.avg_response_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>
        </div>
      )}
    </>
  );
}
