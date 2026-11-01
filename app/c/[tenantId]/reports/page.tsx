import { eq } from "drizzle-orm";
import { guardPage } from "../../../../lib/auth/session.ts";
import { withTenant } from "../../../../lib/db/client.ts";
import { tenants } from "../../../../lib/db/schema.ts";
import { campaignReport, teamReport } from "../../../../lib/reports.ts";
import { listAnalyses } from "../../../../lib/settings.ts";
import { lastDays } from "../../../../lib/time.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { CampaignReport, DateRange } from "../../../../components/report-view";
import { Label, LinkButton, PageHeader, Panel, Pill, TableWrap } from "../../../../components/ui";
import { approveAnalysisAction } from "../actions";

export const metadata = { title: "Reports · Qualent" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { tenantId } = await params;
  const { can } = await guardPage(tenantId, "reports.client");
  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));
  const search = await searchParams;
  const range = { ...lastDays(30, tenant.timezone), ...(search.from && search.to ? { from: search.from, to: search.to } : {}) };

  const report = await campaignReport(tenantId, range.from, range.to);
  const team = can("reports.team") ? await teamReport(tenantId, range.from, range.to) : null;
  const analyses = can("reports.team") ? await listAnalyses(tenantId) : [];
  const widest = Math.max(1, ...(team?.funnel.map((row) => row.leads) ?? [1]));

  return (
    <>
      <PageHeader title="Reports" subtitle="This is what the client sees, plus your team's numbers." actions={<LinkButton href={`/portal/${tenantId}`}>Open client view</LinkButton>} />
      <DateRange from={range.from} to={range.to} />
      <CampaignReport report={report} currency={tenant.currency} />

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
        <div className="grid gap-5 desk:grid-cols-2">
          <section className="grid content-start gap-2.5">
            <Label>Team</Label>
            <TableWrap>
              <thead><tr><th>Person</th><th className="num">Leads</th><th className="num">First reply</th></tr></thead>
              <tbody>
                {team.people.map((person) => (
                  <tr key={person.member_id}>
                    <td className="font-medium">{person.name}</td>
                    <td className="num">{person.leads}</td>
                    <td className="num">{person.avg_response_minutes === null ? "—" : `${person.avg_response_minutes} min`}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>
          <section className="grid content-start gap-2.5">
            <Label>Leads reaching each stage</Label>
            <ul className="grid gap-1.5">
              {team.funnel.map((row) => (
                <li key={row.stage_id} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-sm">
                  <span className="truncate text-fg-soft">{row.name}</span>
                  <span className="h-2.5 rounded-sm bg-(image:--gradient-bar-h)" style={{ width: `${Math.max((row.leads / widest) * 100, row.leads ? 2 : 0)}%` }} />
                  <span className="text-end tabular-nums">{row.leads}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
