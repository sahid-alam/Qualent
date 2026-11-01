import { guardPage } from "../../../../lib/auth/session.ts";
import { capiHealth } from "../../../../lib/capi/send.ts";
import { listPipelines, setupStatus } from "../../../../lib/settings.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { Banner, Field, inlineFieldClass, inputClass, Label, LinkButton, PageHeader, Panel, Stat, timeAgo } from "../../../../components/ui";
import { testEventAction, updateStageAction } from "../actions";

export const metadata = { title: "Meta results · Qualent" };

export default async function MetaPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await guardPage(tenantId, "settings.manage");
  const [health, pipelines, status] = await Promise.all([capiHealth(tenantId), listPipelines(tenantId), setupStatus(tenantId)]);
  const stages = pipelines[0]?.stages ?? [];
  const count = (key: string) => health.status[key] ?? 0;

  return (
    <>
      <PageHeader title="Meta results" subtitle="Whether Meta is getting your results, so it can find more people like your best leads." />

      {status.dataset.state === "todo" && (
        <Banner action={<LinkButton size="sm" href={`/c/${tenantId}/setup`}>Go to setup</LinkButton>}>
          No Meta dataset is connected, so results aren&apos;t being sent yet.
        </Banner>
      )}
      {status.dataset.state === "problem" && <Banner tone="bad">Meta rejected the dataset connection: {status.dataset.detail}</Banner>}
      {status.page.state !== "todo" && stages.some((stage) => !stage.capiEnabled) && (
        <Banner>
          {stages.filter((stage) => !stage.capiEnabled).map((stage) => stage.name).join(", ")} {stages.filter((stage) => !stage.capiEnabled).length === 1 ? "is" : "are"} off. This client uses Meta forms, and Meta needs every stage, including the first, or it may stop optimizing for quality.
        </Banner>
      )}
      {!health.meetsLeadVolume && (
        <Banner>
          {health.leadsLast30Days} leads in the last 30 days. Meta&apos;s lead optimization needs about 200 a month. Events still send, but Meta may not optimize on them yet.
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-4">
        <Stat label="Leads, last 30 days" value={health.leadsLast30Days} note="Meta needs about 200" />
        <Stat label="Won rate" value={`${(health.conversionRate * 100).toFixed(1)}%`} note="Best between 1% and 40%" />
        <Stat label="Events sent" value={count("sent")} note={health.lastSentAt ? `Last ${timeAgo(new Date(health.lastSentAt))}` : "None yet"} />
        <Stat label="Failed or too late" value={count("failed") + count("expired")} note={count("no_connection") ? `${count("no_connection")} waiting for a connection` : undefined} />
      </div>

      <Panel className="grid gap-3">
        <div className="grid gap-1">
          <Label>What we tell Meta</Label>
          <p className="text-sm text-fg-muted">Every stage is sent by default. For Meta form leads, Meta needs every stage, including the first, so turning one off may stop optimization.</p>
        </div>
        <ul className="grid gap-2">
          {stages.map((stage) => (
            <li key={stage.id}>
              <ActionForm action={updateStageAction} hidden={{ tenantId, stageId: stage.id }} className="flex flex-wrap items-center gap-3 rounded-row bg-card px-4 py-2.5">
                <span className="w-24 font-medium">{stage.name}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="capiEnabled" defaultChecked={stage.capiEnabled} className="size-4 accent-(--accent)" />
                  Send to Meta
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="agentButton" defaultChecked={stage.agentButton} className="size-4 accent-(--accent)" />
                  Telegram button
                </label>
                <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
                  <span className="whitespace-nowrap text-fg-muted">Event name</span>
                  <input name="capiEventName" defaultValue={stage.capiEventName ?? stage.name} className={`${inlineFieldClass} w-full min-w-0`} />
                </label>
                <Submit variant="secondary" size="sm">Save</Submit>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="grid max-w-2xl gap-3">
        <Label>Send a test event</Label>
        <p className="text-sm text-fg-muted">Copy the test code from the Test events tab in Meta&apos;s Events Manager. This sends a fake event and never touches live results.</p>
        <ActionForm action={testEventAction} hidden={{ tenantId }} className="grid gap-3">
          <Field label="Test code"><input name="code" required placeholder="TEST12345" className={inputClass} /></Field>
          <div><Submit variant="secondary">Send test event</Submit></div>
        </ActionForm>
      </Panel>
    </>
  );
}
