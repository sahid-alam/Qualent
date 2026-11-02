import { eq } from "drizzle-orm";
import { ArrowRight, Check, ChevronDown, ChevronLeft, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { guardPage } from "../../../../../lib/auth/session.ts";
import { withTenant } from "../../../../../lib/db/client.ts";
import { tenants } from "../../../../../lib/db/schema.ts";
import { getLead } from "../../../../../lib/leads/work.ts";
import { listFieldAgents, listQueue, listRoutableMembers } from "../../../../../lib/queries.ts";
import { hasAiModel, listCustomFields, listPipelines } from "../../../../../lib/settings.ts";
import { ActionForm, Submit } from "../../../../../components/forms";
import { Composer, StageSelect } from "../../../../../components/lead-tools";
import { Avatar, Banner, buttonClass, cx, Field, formatDateTime, inlineFieldClass, inputClass, Label, Pill, SOURCE_LABEL, TemperatureBadge, timeAgo } from "../../../../../components/ui";
import { addTaskAction, completeTaskAction, deliverAction, setFieldsAction } from "../../actions";

export const metadata = { title: "Lead · Qualent" };

const CALL_LABEL: Record<string, string> = { reached: "reached", no_answer: "no answer", wrong_number: "wrong number", call_back: "call back" };
const ACTIVITY_DOT: Record<string, string> = { assignment: "bg-info", stage: "bg-accent", delivery: "bg-good", ai: "bg-chart-5", system: "bg-fg-muted" };
const innerClass = "rounded-card border border-line bg-inner px-4 py-3.5";

function actorName(actor: string, names: Map<string, string>) {
  if (actor.startsWith("telegram:")) return names.get(actor.slice(9)) ?? "Client's agent";
  if (actor.startsWith("user:")) return "Staff";
  return { system: "Qualent", automation: "Automation", ai: "AI", seed: "Qualent" }[actor] ?? actor;
}

/** Notes from people on the team sit on one side; what came in from the lead sits on the other. */
function Bubble({ who, when, from, children }: { who: string; when: string; from: "lead" | "team"; children: ReactNode }) {
  const lead = from === "lead";
  return (
    <div className={cx("flex", lead ? "justify-start" : "justify-end")}>
      <div className="max-w-[78%] min-w-0">
        <p className={cx("mb-1.25 flex gap-2 text-2xs text-fg-muted", !lead && "justify-end")}>
          <span className="font-medium text-fg-soft">{who}</span>
          <span>{when}</span>
        </p>
        <div className={cx("rounded-[1.375rem] border px-4.25 py-3.25 text-base leading-relaxed whitespace-pre-line", lead ? "rounded-es-lg border-accent-line bg-(image:--gradient-highlight)" : "rounded-ee-lg border-line bg-control-hover")}>{children}</div>
      </div>
    </div>
  );
}

/** A closed-by-default section of the side panel, so only what's needed now takes up room. */
function Fold({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="group border-t border-line pt-3.5">
      <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 ps-1 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <Label>{title}</Label>
        <span className="flex items-center gap-1.5 text-xs text-fg-muted tabular-nums">
          {count || ""}
          <ChevronDown size={14} aria-hidden className="transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-2.5">{children}</div>
    </details>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ tenantId: string; leadId: string }> }) {
  const { tenantId, leadId } = await params;
  const { membership, can } = await guardPage(tenantId, "leads.read");
  const data = await getLead(tenantId, leadId, membership);
  if (!data) notFound();

  const [[tenant], pipelines, agents, people, fields, canDraft, queue] = await Promise.all([
    withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId))),
    listPipelines(tenantId),
    listFieldAgents(tenantId),
    listRoutableMembers(tenantId),
    listCustomFields(tenantId),
    hasAiModel(tenantId, "draft_reply"),
    listQueue(tenantId, membership, { tab: "needs" }),
  ]);
  const { lead, contact, stage, timeline, touches, tasks } = data;
  const pipeline = pipelines.find((item) => item.id === lead.pipelineId);
  const names = new Map([...agents, ...people].map((person) => [person.id, person.name]));
  const touch = touches[0];
  const phone = contact.phoneE164 ?? contact.phoneRaw;
  const openTasks = tasks.filter((task) => !task.doneAt);
  const answers = lead.custom.meta_answers as Record<string, string> | undefined;
  const tags = [...new Set((lead.custom.tags as string[] | undefined) ?? [])];
  const deliveredTo = lead.deliveredToMemberId ? names.get(lead.deliveredToMemberId) : null;
  const canDeliver = stage.kind === "qualified" && !deliveredTo;
  const name = contact.erasedAt ? "Erased contact" : (contact.name ?? contact.email ?? "Unknown");
  const when = (date: Date) => formatDateTime(date, tenant.timezone);

  const said = timeline.filter((item) => item.kind === "note" || item.kind === "call").reverse();
  const happened = timeline.filter((item) => item.kind !== "note" && item.kind !== "call");
  const position = queue.findIndex((row) => row.lead.id === leadId);
  const nextRow = position >= 0 ? queue[position + 1] : queue[0];
  const nextLink = nextRow && nextRow.lead.id !== leadId && (
    <Link href={`/c/${tenantId}/leads/${nextRow.lead.id}`} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
      Next: {nextRow.contact.name ?? "next lead"}
      <ArrowRight size={12} aria-hidden className="rtl:rotate-180" />
    </Link>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:h-[calc(100dvh-1.25rem)] lg:grid-cols-[minmax(0,1fr)_var(--w-detail)] lg:grid-rows-[minmax(0,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-panel bg-(image:--wash-hero) bg-size-[100%_18.75rem] bg-no-repeat">
        <header className="border-b border-line px-5 pt-5 pb-4.5 sm:px-6">
          <Link href={`/c/${tenantId}/leads`} className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <ChevronLeft size={14} aria-hidden className="rtl:rotate-180" />
            Leads
          </Link>
          <div className="flex flex-wrap items-center gap-3.5">
            <Avatar name={name} size="lg" />
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-2.25">
                <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
                <TemperatureBadge temperature={lead.temperature} score={lead.score} />
                {tags.map((tag) => <Pill key={tag}>{tag}</Pill>)}
              </div>
              <p className="mt-0.75 text-sm text-fg-muted">
                {lead.ownerMemberId ? `Owned by ${names.get(lead.ownerMemberId) ?? "someone"}` : "No owner yet"} · added {timeAgo(lead.createdAt)}
              </p>
            </div>
            {pipeline && <StageSelect tenantId={tenantId} leadId={leadId} stageId={lead.stageId} stages={pipeline.stages} />}
            {phone && !contact.phoneInvalid && (
              <a href={`tel:${phone}`} className={buttonClass("primary")}>
                <Phone size={14} aria-hidden />
                Call
              </a>
            )}
          </div>
        </header>

        {/* Reversed so a long history opens at the newest entry, right above the composer. */}
        <div className="relative flex min-h-48 flex-1 flex-col-reverse overflow-y-auto px-5 py-5.5 sm:px-6">
          <div className="grid max-w-165 gap-4">
            {lead.deliveryFailedAt && <Banner tone="bad">We couldn&apos;t deliver this lead on Telegram. The agent may have blocked the bot. Send it to someone else in the panel beside this.</Banner>}
            {lead.needsReview && <Banner>This phone and email belong to two different contacts. We kept the phone match. Check it&apos;s the right person.</Banner>}
            {contact.phoneInvalid && <Banner>We couldn&apos;t read this phone number: {contact.phoneRaw}. Check it before calling.</Banner>}

            {answers && (
              <Bubble who={name} when={when(lead.createdAt)} from="lead">
                <dl className="grid gap-1">
                  {Object.entries(answers).map(([key, value]) => (
                    <div key={key} className="flex flex-wrap gap-x-2"><dt className="text-fg-muted">{key.replaceAll("_", " ")}:</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </Bubble>
            )}
            {said.map((item) => {
              const fromTeam = item.kind === "call" || item.actor.startsWith("user:") || item.actor.startsWith("telegram:");
              return (
                <Bubble key={item.id} who={fromTeam ? actorName(item.actor, names) : name} when={when(item.occurredAt)} from={fromTeam ? "team" : "lead"}>
                  {item.kind === "call" ? <>Call, {CALL_LABEL[String(item.data.outcome)] ?? "logged"}{item.body ? `: ${item.body}` : ""}</> : (item.body ?? "Removed")}
                </Bubble>
              );
            })}
            {!said.length && !answers && <p className="text-sm text-fg-muted">Nothing here yet. Call them, then log how it went.</p>}
          </div>
        </div>

        <div className="border-t border-line p-3.5 sm:px-6 sm:py-4">
          <Composer tenantId={tenantId} leadId={leadId} phone={contact.phoneE164} canDraft={canDraft && !!phone} next={nextLink} />
        </div>
      </section>

      <aside aria-label="Lead detail" className="relative grid grid-cols-[minmax(0,1fr)] content-start gap-3.5 overflow-y-auto rounded-panel border border-line bg-sidebar px-4 py-4.5">
        {(canDeliver || deliveredTo || lead.deliveryFailedAt) && (
          <section id="deliver" className={cx(innerClass, "grid grid-cols-[minmax(0,1fr)] gap-2")}>
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="text-sm font-medium">{deliveredTo ? `Sent to ${deliveredTo}` : "Send to client's agent"}</h2>
              {deliveredTo && !lead.deliveryFailedAt && (
                <span className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full border border-good bg-good-soft px-2.75 text-2xs font-medium text-good">
                  <Check size={11} aria-hidden />
                  Sent
                </span>
              )}
            </div>
            <p className="text-xs leading-normal text-fg-muted">
              {deliveredTo
                ? lead.agentResponseAt
                  ? `${deliveredTo} responded ${timeAgo(lead.agentResponseAt)}.`
                  : `Sent ${timeAgo(lead.deliveredAt)}. Waiting for ${deliveredTo} to respond. If they don't, it moves to the next agent.`
                : "They get the name, phone and summary privately on Telegram. Skip this if the lead needs another call first."}
            </p>
            {(!deliveredTo || lead.deliveryFailedAt) && (
              <ActionForm action={deliverAction} hidden={{ tenantId, leadId }} className="grid grid-cols-[minmax(0,1fr)] gap-2">
                <label className="sr-only" htmlFor="agent">Agent</label>
                <select id="agent" name="memberId" defaultValue="" className={`${inlineFieldClass} w-full`}>
                  <option value="" className="bg-panel">Choose an agent…</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id} disabled={!agent.telegramChatId} className="bg-panel">
                      {agent.name}{agent.telegramChatId ? "" : " (Telegram not linked)"}
                    </option>
                  ))}
                </select>
                <Submit>Send</Submit>
              </ActionForm>
            )}
          </section>
        )}

        {lead.score !== null && (lead.summary || lead.scoreReason || lead.nextStep) && (
          <section className={cx(innerClass, "grid gap-2 text-sm leading-normal")}>
            <p className="text-fg-soft">{lead.summary ?? lead.scoreReason}</p>
            {lead.nextStep && <p className="text-accent">Next: {lead.nextStep}</p>}
          </section>
        )}

        <section>
          <dl className={cx(innerClass, "grid gap-2.5 text-sm")}>
            {[
              ["Phone", phone ?? "None"],
              ["Email", contact.email ?? "None"],
              ["Source", touch ? SOURCE_LABEL(touch.source) : "—"],
              ["Campaign", touch?.campaignId ?? touch?.utmCampaign ?? "—"],
            ].map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2.5">
                <dt className="shrink-0 text-fg-muted">{key}</dt>
                <dd dir={key === "Phone" || key === "Email" ? "ltr" : undefined} className="min-w-0 truncate text-end" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          {touches.length > 1 && <p className="mt-2 ps-1"><Pill>Came back {touches.length - 1} {touches.length === 2 ? "time" : "times"}</Pill></p>}
        </section>

        <section>
          <Label className="mb-2.5 ps-1">Follow-ups</Label>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 ps-1">
            {openTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">{task.title}<span className="block text-xs text-fg-muted">{when(task.dueAt)}</span></span>
                <ActionForm action={completeTaskAction} hidden={{ tenantId, taskId: task.id }}><Submit variant="ghost" size="sm">Done</Submit></ActionForm>
              </li>
            ))}
          </ul>
          <details className="mt-2 ps-1">
            <summary className="flex min-h-7 cursor-pointer list-none items-center text-sm text-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">+ Add a follow-up</summary>
            <ActionForm action={addTaskAction} hidden={{ tenantId, leadId }} className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2" resetOnOk>
              <label className="sr-only" htmlFor="task">What to do</label>
              <input id="task" name="title" placeholder="What to do" className={inputClass} />
              <label className="sr-only" htmlFor="due">Due</label>
              <input id="due" name="dueAt" type="datetime-local" required className={inputClass} />
              <Submit variant="secondary">Add</Submit>
            </ActionForm>
          </details>
        </section>

        {!!fields.length && (
          <Fold title="More details">
            <ActionForm action={setFieldsAction} hidden={{ tenantId, leadId }} className={cx(innerClass, "grid grid-cols-[minmax(0,1fr)] gap-3")}>
              {fields.map((field) => (
                <Field key={field.key} label={field.label}>
                  {field.type === "boolean" ? (
                    <select name={field.key} defaultValue={String(lead.custom[field.key] ?? "")} className={inputClass}>
                      <option value="" className="bg-panel">Not set</option>
                      <option value="true" className="bg-panel">Yes</option>
                      <option value="false" className="bg-panel">No</option>
                    </select>
                  ) : field.type === "select" ? (
                    <select name={field.key} defaultValue={String(lead.custom[field.key] ?? "")} className={inputClass}>
                      <option value="" className="bg-panel">Not set</option>
                      {field.options?.map((option) => <option key={option} value={option} className="bg-panel">{option}</option>)}
                    </select>
                  ) : (
                    <input name={field.key} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} defaultValue={String(lead.custom[field.key] ?? "")} className={inputClass} />
                  )}
                </Field>
              ))}
              <div><Submit variant="secondary" size="sm">Save</Submit></div>
            </ActionForm>
          </Fold>
        )}

        <Fold title="History" count={happened.length}>
          <ul className="grid gap-3 ps-1">
            {happened.map((item) => (
              <li key={item.id} className="flex gap-2.5">
                <span aria-hidden className={cx("mt-1.5 size-1.25 shrink-0 rounded-full", ACTIVITY_DOT[item.kind] ?? "bg-fg-muted")} />
                <span className="min-w-0 text-xs leading-normal text-fg-muted">
                  {item.kind === "assignment" ? <>{item.body === "assigned" ? "Assigned to" : item.body === "escalated" ? "Escalated to" : "Reassigned, no reply, to"} {names.get(String(item.data.memberId)) ?? "someone"}</> : (item.body ?? "Removed")}
                  <span className="block text-2xs">{actorName(item.actor, names)}, {when(item.occurredAt)}</span>
                </span>
              </li>
            ))}
            {!happened.length && <li className="text-xs text-fg-muted">Nothing yet.</li>}
          </ul>
          {contact.consentAt && <p className="mt-3 ps-1 text-xs text-fg-muted">Consent: {contact.consentSource}, {when(contact.consentAt)}</p>}
          {can("contacts.erase") && <Link href={`/c/${tenantId}/contacts/${contact.id}`} className="mt-1.5 block ps-1 text-xs text-fg-muted underline">Privacy: export or erase</Link>}
        </Fold>
      </aside>
    </div>
  );
}
