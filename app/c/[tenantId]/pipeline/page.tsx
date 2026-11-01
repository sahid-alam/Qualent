import { guardPage } from "../../../../lib/auth/session.ts";
import { listBoard, listCampaigns, listRoutableMembers } from "../../../../lib/queries.ts";
import { listPipelines } from "../../../../lib/settings.ts";
import { AddLead } from "../../../../components/add-lead";
import { Board } from "../../../../components/board";
import { Empty, LinkButton, PageHeader } from "../../../../components/ui";

export const metadata = { title: "Pipeline · Qualent" };

export default async function PipelinePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership } = await guardPage(tenantId, "leads.read");
  const [pipelines, { rows }, people, campaigns] = await Promise.all([
    listPipelines(tenantId),
    listBoard(tenantId, membership),
    listRoutableMembers(tenantId),
    listCampaigns(tenantId),
  ]);
  const pipeline = pipelines[0];
  const names = new Map(people.map((person) => [person.id, person.name]));
  const cards = rows
    .filter(({ lead }) => lead.pipelineId === pipeline?.id)
    .map(({ lead, contact }) => ({
      id: lead.id,
      stageId: lead.stageId,
      name: contact.name ?? contact.phoneE164 ?? contact.email ?? "Unknown",
      temperature: lead.temperature,
      score: lead.score,
      delivered: !!lead.deliveredToMemberId,
      owner: lead.ownerMemberId ? (names.get(lead.ownerMemberId) ?? null) : null,
    }));

  return (
    <>
      <PageHeader
        title={pipeline?.name ?? "Pipeline"}
        actions={
          <>
            <LinkButton href={`/c/${tenantId}/leads`}>Table view</LinkButton>
            <AddLead tenantId={tenantId} campaigns={campaigns} />
          </>
        }
      />
      {!pipeline ? (
        <Empty title="No pipeline yet" body="Create one in Client setup." />
      ) : (
        <Board tenantId={tenantId} cards={cards} stages={pipeline.stages.map(({ id, name, kind }) => ({ id, name, kind }))} />
      )}
    </>
  );
}
