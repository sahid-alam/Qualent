import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import { listCampaigns, listInbox, listRoutableMembers } from "../../../../lib/queries.ts";
import { AddLead } from "../../../../components/add-lead";
import { ActionForm, SelectAll, Submit } from "../../../../components/forms";
import { Empty, inlineFieldClass, PageHeader, SOURCE_LABEL, TableWrap, Temperature, timeAgo } from "../../../../components/ui";
import { bulkAssignAction } from "../actions";

export const metadata = { title: "New leads · Qualent" };

export default async function InboxPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await guardPage(tenantId, "leads.read");
  const [rows, people, campaigns] = await Promise.all([listInbox(tenantId), listRoutableMembers(tenantId), listCampaigns(tenantId)]);

  return (
    <>
      <PageHeader
        title="New leads"
        subtitle="Leads nobody owns yet, oldest first. Waiting the longest means most at risk."
        actions={<AddLead tenantId={tenantId} campaigns={campaigns} />}
      />
      {!rows.length ? (
        <Empty title="No leads are waiting" body="New leads with no owner appear here. Set up who gets leads in Client setup, and most will go straight to a person." />
      ) : (
        <ActionForm action={bulkAssignAction} hidden={{ tenantId }} className="grid gap-3" resetOnOk>
          <TableWrap>
            <thead>
              <tr>
                <th className="w-8"><SelectAll name="leadIds[]" /></th>
                <th>Name</th>
                <th>Source</th>
                <th>Campaign</th>
                <th>AI</th>
                <th className="num">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lead, contact, touch }) => (
                <tr key={lead.id} className="hover:bg-hover">
                  <td>
                    <input type="checkbox" name="leadIds[]" value={lead.id} aria-label={`Select ${contact.name ?? "lead"}`} className="size-4 accent-(--accent)" />
                  </td>
                  <td><Link href={`/c/${tenantId}/leads/${lead.id}`} className="font-medium hover:underline">{contact.name ?? contact.phoneE164 ?? contact.email}</Link></td>
                  <td className="text-fg-soft">{touch ? SOURCE_LABEL(touch.source) : ""}</td>
                  <td className="text-fg-soft">{touch?.campaignId ?? "—"}</td>
                  <td><Temperature temperature={lead.temperature} score={lead.score} /></td>
                  <td className="num text-fg-soft">{timeAgo(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="owner">Assign to</label>
            <select id="owner" name="ownerMemberId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
              <option value="" className="bg-panel">Assign ticked leads to…</option>
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
