import { guardPage } from "../../../../lib/auth/session.ts";
import { listCampaigns, listInbox, listRoutableMembers } from "../../../../lib/queries.ts";
import { AddLead } from "../../../../components/add-lead";
import { ActionForm, SelectAll, Submit } from "../../../../components/forms";
import { Empty, inlineFieldClass, LeadsTabs, PageHeader, PersonLink, SOURCE_LABEL, TableWrap, Temperature, timeAgo } from "../../../../components/ui";
import { bulkEditAction } from "../actions";

export const metadata = { title: "New leads · Qualent" };

export default async function InboxPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership } = await guardPage(tenantId, "leads.read");
  const [rows, people, campaigns] = await Promise.all([listInbox(tenantId, membership), listRoutableMembers(tenantId), listCampaigns(tenantId)]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Nobody owns these yet. Oldest first, because waiting longest means most at risk."
        actions={<AddLead tenantId={tenantId} campaigns={campaigns} />}
      />
      <LeadsTabs tenantId={tenantId} active="new" showNew={membership.recordScope !== "assigned"} />
      {!rows.length ? (
        <Empty
          clear
          title={membership.recordScope === "assigned" ? "Your manager handles new leads" : "No leads are waiting"}
          body={membership.recordScope === "assigned" ? "Leads assigned to you appear on your Today list." : "Set up who gets leads in Settings, and most will go straight to a person."}
        />
      ) : (
        <ActionForm action={bulkEditAction} hidden={{ tenantId }} className="group grid gap-3" resetOnOk>
          <TableWrap>
            <thead>
              <tr>
                <th className="w-8"><SelectAll name="leadIds[]" /></th>
                <th>Name</th>
                <th>Source</th>
                <th>Campaign</th>
                <th>Score</th>
                <th className="num">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lead, contact, touch }) => (
                <tr key={lead.id} className="hover:bg-hover">
                  <td>
                    <input type="checkbox" name="leadIds[]" value={lead.id} aria-label={`Select ${contact.name ?? "lead"}`} className="size-4 accent-(--accent)" />
                  </td>
                  <td><PersonLink href={`/c/${tenantId}/leads/${lead.id}`} name={contact.name ?? contact.phoneE164 ?? contact.email ?? "Unknown"} /></td>
                  <td className="text-fg-soft">{touch ? SOURCE_LABEL(touch.source) : ""}</td>
                  <td className="text-fg-soft">{touch?.campaignId ?? "—"}</td>
                  <td><Temperature temperature={lead.temperature} score={lead.score} /></td>
                  <td className="num text-fg-soft">{timeAgo(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="ps-1 text-sm text-fg-muted group-has-[input[type=checkbox]:checked]:hidden">Tick leads to assign them.</p>
          <div className="hidden flex-wrap items-center gap-2 group-has-[input[type=checkbox]:checked]:flex">
            <label className="sr-only" htmlFor="owner">Assign to</label>
            <select id="owner" name="ownerMemberId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
              <option value="" className="bg-panel">Assign to…</option>
              {people.map((person) => (
                <option key={person.id} value={person.id} className="bg-panel">{person.name}</option>
              ))}
            </select>
            <Submit variant="secondary">Assign</Submit>
          </div>
        </ActionForm>
      )}
    </>
  );
}
