import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { guardPage } from "../../../../../lib/auth/session.ts";
import { withTenant } from "../../../../../lib/db/client.ts";
import { tenants } from "../../../../../lib/db/schema.ts";
import { getLead } from "../../../../../lib/leads/work.ts";
import { listFieldAgents, listRoutableMembers } from "../../../../../lib/queries.ts";
import { hasAiModel, listCustomFields, listPipelines } from "../../../../../lib/settings.ts";
import { ActionForm, Submit } from "../../../../../components/forms";
import { LogCall, ReplyDraft } from "../../../../../components/lead-tools";
import { Banner, buttonClass, cx, Field, formatDateTime, inlineFieldClass, inputClass, Label, PageHeader, Panel, Pill, SOURCE_LABEL, Temperature, textareaClass, timeAgo } from "../../../../../components/ui";
import { addNoteAction, addTaskAction, completeTaskAction, deliverAction, moveStageAction, setFieldsAction } from "../../actions";

export const metadata = { title: "Lead · Qualent" };

const CALL_LABEL: Record<string, string> = { reached: "reached", no_answer: "no answer", wrong_number: "wrong number", call_back: "call back" };

function actorName(actor: string, names: Map<string, string>) {
  if (actor.startsWith("telegram:")) return names.get(actor.slice(9)) ?? "Client's agent";
  if (actor.startsWith("user:")) return "Staff";
  return { system: "Qualent", automation: "Automation", ai: "AI", seed: "Qualent" }[actor] ?? actor;
}

export default async function LeadPage({ params }: { params: Promise<{ tenantId: string; leadId: string }> }) {
  const { tenantId, leadId } = await params;
  const { membership, can } = await guardPage(tenantId, "leads.read");
  const data = await getLead(tenantId, leadId, membership);
  if (!data) notFound();

  const [[tenant], pipelines, agents, people, fields, canDraft] = await Promise.all([
    withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId))),
    listPipelines(tenantId),
    listFieldAgents(tenantId),
    listRoutableMembers(tenantId),
    listCustomFields(tenantId),
    hasAiModel(tenantId, "draft_reply"),
  ]);
  const { lead, contact, stage, timeline, touches, tasks } = data;
  const pipeline = pipelines.find((item) => item.id === lead.pipelineId);
  const names = new Map([...agents, ...people].map((person) => [person.id, person.name]));
  const touch = touches[0];
  const phone = contact.phoneE164 ?? contact.phoneRaw;
  const openTasks = tasks.filter((task) => !task.doneAt);
  const answers = lead.custom.meta_answers as Record<string, string> | undefined;
  const deliveredTo = lead.deliveredToMemberId ? names.get(lead.deliveredToMemberId) : null;
  const canDeliver = stage.kind === "qualified" && !deliveredTo;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
        <Link href={`/c/${tenantId}/leads`} className="hover:underline">All leads</Link>
      </nav>
      <PageHeader
        title={contact.erasedAt ? "Erased contact" : (contact.name ?? contact.email ?? "Unknown")}
        subtitle={
          <>
            {touch ? `${SOURCE_LABEL(touch.source)}${touch.campaignId ? `, campaign ${touch.campaignId}` : ""}, ` : ""}added {timeAgo(lead.createdAt)}
            {lead.ownerMemberId ? `, owned by ${names.get(lead.ownerMemberId) ?? "someone"}` : ", no owner yet"}
          </>
        }
        actions={
          <>
            <Temperature temperature={lead.temperature} score={lead.score} />
            {phone && !contact.phoneInvalid && <a href={`tel:${phone}`} className={buttonClass("primary")}>Call {phone}</a>}
          </>
        }
      />

      {lead.deliveryFailedAt && (
        <Banner tone="bad">We couldn&apos;t deliver this lead on Telegram. The agent may have blocked the bot. Send it to someone else below.</Banner>
      )}
      {lead.needsReview && <Banner>This phone and email belong to two different contacts. We kept the phone match. Check it&apos;s the right person.</Banner>}
      {contact.phoneInvalid && <Banner>We couldn&apos;t read this phone number: {contact.phoneRaw}. Check it before calling.</Banner>}

      <nav className="flex flex-wrap gap-1.5" aria-label="Stage">
        {pipeline?.stages.map((item) => {
          const current = item.id === lead.stageId;
          return (
            <ActionForm key={item.id} action={moveStageAction} hidden={{ tenantId, leadId, stageId: item.id }}>
              <button aria-current={current ? "step" : undefined} className={cx(buttonClass(current ? "primary" : "secondary", "sm"))}>{item.name}</button>
            </ActionForm>
          );
        })}
      </nav>

      <div className="grid gap-5 desk:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          {(canDeliver || deliveredTo || lead.deliveryFailedAt) && (
            <Panel className="grid gap-3 border-accent-line" >
              <div id="deliver" className="grid gap-1">
                <h2 className="text-md font-semibold">{deliveredTo ? `Sent to ${deliveredTo}` : "Send to client's agent"}</h2>
                <p className="text-sm text-fg-muted">
                  {deliveredTo
                    ? lead.agentResponseAt
                      ? `${deliveredTo} responded ${timeAgo(lead.agentResponseAt)}.`
                      : `Sent ${timeAgo(lead.deliveredAt)}. Waiting for ${deliveredTo} to respond. If they don't, it moves to the next agent.`
                    : "They get the name, phone and summary privately on Telegram. Skip this if the lead needs another call first."}
                </p>
              </div>
              {(!deliveredTo || lead.deliveryFailedAt) && (
                <ActionForm action={deliverAction} hidden={{ tenantId, leadId }} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="agent">Agent</label>
                  <select id="agent" name="memberId" defaultValue="" className={`${inlineFieldClass} max-w-64`}>
                    <option value="" className="bg-panel">Choose an agent…</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id} disabled={!agent.telegramChatId} className="bg-panel">
                        {agent.name}{agent.telegramChatId ? "" : " (Telegram not linked)"}
                      </option>
                    ))}
                  </select>
                  <Submit size="md">Send</Submit>
                </ActionForm>
              )}
            </Panel>
          )}

          <Panel className="grid gap-3">
            <Label>Log a call</Label>
            <LogCall tenantId={tenantId} leadId={leadId} />
          </Panel>

          <Panel className="grid gap-4">
            <Label>Timeline</Label>
            <ActionForm action={addNoteAction} hidden={{ tenantId, leadId }} className="grid gap-2" resetOnOk>
              <label className="sr-only" htmlFor="note">Add a note</label>
              <textarea id="note" name="body" rows={2} placeholder="Add a note. Paste only what the lead wrote, not other people's details." className={textareaClass} />
              <div><Submit variant="secondary" size="sm">Add note</Submit></div>
            </ActionForm>
            <ol className="grid gap-3 border-s border-line ps-4">
              {timeline.map((item) => (
                <li key={item.id} className="grid gap-0.5">
                  <p className="text-sm whitespace-pre-line text-fg">
                    {item.kind === "call" && <>Call, {CALL_LABEL[String(item.data.outcome)] ?? "logged"}{item.body ? `: ${item.body}` : ""}</>}
                    {item.kind === "assignment" && <>{item.body === "assigned" ? "Assigned to" : item.body === "escalated" ? "Escalated to" : "Reassigned, no reply, to"} {names.get(String(item.data.memberId)) ?? "someone"}</>}
                    {item.kind !== "call" && item.kind !== "assignment" && (item.body ?? "Removed")}
                  </p>
                  <p className="text-xs text-fg-muted">{actorName(item.actor, names)}, {formatDateTime(item.occurredAt, tenant.timezone)}</p>
                </li>
              ))}
              {!timeline.length && <li className="text-sm text-fg-muted">Nothing here yet.</li>}
            </ol>
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel className="grid gap-3">
            <Label>Summary</Label>
            {lead.summary ? (
              <dl className="grid gap-2.5 text-sm">
                <div><dt className="text-xs text-fg-muted">What we know</dt><dd>{lead.summary}</dd></div>
                {lead.nextStep && <div><dt className="text-xs text-fg-muted">Next step</dt><dd>{lead.nextStep}</dd></div>}
              </dl>
            ) : (
              <p className="text-sm text-fg-muted">Not scored yet. AI suggestions appear here once a model is switched on.</p>
            )}
            {answers && (
              <dl className="grid gap-1.5 text-sm">
                {Object.entries(answers).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3"><dt className="text-fg-muted">{key.replaceAll("_", " ")}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            )}
            {canDraft && phone && <ReplyDraft tenantId={tenantId} leadId={leadId} phone={contact.phoneE164} />}
          </Panel>

          <Panel className="grid gap-3">
            <Label>Tasks</Label>
            <ul className="grid gap-2">
              {openTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">{task.title}<span className="block text-xs text-fg-muted">{formatDateTime(task.dueAt, tenant.timezone)}</span></span>
                  <ActionForm action={completeTaskAction} hidden={{ tenantId, taskId: task.id }}><Submit variant="ghost" size="sm">Done</Submit></ActionForm>
                </li>
              ))}
              {!openTasks.length && <li className="text-sm text-fg-muted">No open tasks.</li>}
            </ul>
            <ActionForm action={addTaskAction} hidden={{ tenantId, leadId }} className="grid gap-2" resetOnOk>
              <label className="sr-only" htmlFor="task">Task</label>
              <input id="task" name="title" placeholder="Add a task" className={inputClass} />
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="due">Due</label>
                <input id="due" name="dueAt" type="datetime-local" required className={inputClass} />
                <Submit variant="secondary">Add</Submit>
              </div>
            </ActionForm>
          </Panel>

          {!!fields.length && (
            <Panel className="grid gap-3">
              <Label>Details</Label>
              <ActionForm action={setFieldsAction} hidden={{ tenantId, leadId }} className="grid gap-3">
                {fields.map((field) => (
                  <Field key={field.key} label={field.label}>
                    {field.type === "select" ? (
                      <select name={field.key} defaultValue={String(lead.custom[field.key] ?? "")} className={inputClass}>
                        <option value="" className="bg-panel">Not set</option>
                        {field.options?.map((option) => <option key={option} value={option} className="bg-panel">{option}</option>)}
                      </select>
                    ) : (
                      <input name={field.key} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} defaultValue={String(lead.custom[field.key] ?? "")} className={inputClass} />
                    )}
                  </Field>
                ))}
                <div><Submit variant="secondary" size="sm">Save details</Submit></div>
              </ActionForm>
            </Panel>
          )}

          <Panel className="grid gap-2.5 text-sm">
            <Label>Contact</Label>
            <p dir="ltr" className="text-start">{phone ?? "No phone"}</p>
            <p dir="ltr" className="text-start">{contact.email ?? "No email"}</p>
            {contact.consentAt && <p className="text-xs text-fg-muted">Consent: {contact.consentSource}, {formatDateTime(contact.consentAt, tenant.timezone)}</p>}
            {touch?.utmCampaign && <p className="text-xs text-fg-muted">UTM campaign: {touch.utmCampaign}</p>}
            {touches.length > 1 && <Pill>Came back {touches.length - 1} {touches.length === 2 ? "time" : "times"}</Pill>}
            {can("contacts.erase") && <Link href={`/c/${tenantId}/contacts/${contact.id}`} className="text-xs text-fg-muted underline">Privacy: export or erase</Link>}
          </Panel>
        </div>
      </div>
    </>
  );
}
