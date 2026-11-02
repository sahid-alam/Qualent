import { and, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import type { Brand } from "../../../../lib/brand.ts";
import { withTenant } from "../../../../lib/db/client.ts";
import { tenantDirectory } from "../../../../lib/db/schema.ts";
import { landingSnippet } from "../../../../lib/intake/snippet.ts";
import { aiSpendThisMonth, listCustomFields, listMembers, listPipelines, listRoutingRules, setupStatus } from "../../../../lib/settings.ts";
import { LinkTelegram, TestLead } from "../../../../components/setup-tools";
import { ActionForm, CopyButton, Submit } from "../../../../components/forms";
import { Field, inputClass, Label, LinkButton, PageHeader, Panel, Pill, SettingsTabs, textareaClass } from "../../../../components/ui";
import { ClientSettings, CustomFields, EditPerson, PipelineStages } from "./sections";
import { addPersonAction, addRuleAction, brandAction, deleteRuleAction, originsAction, saveConnectionAction, setPersonActiveAction } from "../actions";

export const metadata = { title: "Client setup · Qualent" };

type State = "done" | "todo" | "problem";

function Item({ title, state, detail, children, open }: { title: string; state: State; detail?: string | null; children: ReactNode; open?: boolean }) {
  const pill = { done: <Pill tone="good">Done</Pill>, todo: <Pill>To do</Pill>, problem: <Pill tone="bad">Needs attention</Pill> }[state];
  return (
    <details open={open} className="group rounded-card border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
        </span>
        {pill}
      </summary>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-line p-4">{children}</div>
    </details>
  );
}

function ConnectionForm({ tenantId, kind, idLabel, secretLabel, hint }: { tenantId: string; kind: string; idLabel: string; secretLabel: string; hint: string }) {
  return (
    <ActionForm action={saveConnectionAction} hidden={{ tenantId, kind }} className="grid max-w-lg gap-3">
      <p className="text-sm text-fg-muted">{hint}</p>
      <Field label={idLabel}><input name="externalId" required dir="ltr" className={inputClass} /></Field>
      <Field label="Name, to recognize it later"><input name="name" className={inputClass} /></Field>
      <Field label={secretLabel} hint="Stored encrypted, and never shown again."><input name="secret" type="password" autoComplete="off" required dir="ltr" className={inputClass} /></Field>
      <div><Submit variant="secondary" size="sm">Connect</Submit></div>
    </ActionForm>
  );
}

export default async function SetupPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership } = await guardPage(tenantId, "settings.manage");
  const [status, people, rules, [intake], pipelines, fields, aiSpent] = await Promise.all([
    setupStatus(tenantId),
    listMembers(tenantId),
    listRoutingRules(tenantId),
    withTenant(tenantId, (db) => db.select().from(tenantDirectory).where(and(eq(tenantDirectory.tenantId, tenantId), eq(tenantDirectory.kind, "intake_key")))),
    listPipelines(tenantId),
    listCustomFields(tenantId),
    aiSpendThisMonth(tenantId),
  ]);
  const intakeKey = intake?.key.replace("intake:", "") ?? "";
  const snippet = landingSnippet(process.env.APP_URL ?? "", intakeKey);
  const staff = people.filter((person) => person.role === "manager" || person.role === "agent");
  const brand = status.tenant.brand as Brand;
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "Removed";

  const states: State[] = [
    "done",
    status.page.state,
    status.dataset.state,
    status.adAccount.state,
    status.teamGroup,
    status.rules ? "done" : "todo",
    status.agentsLinked ? "done" : "todo",
  ];
  const finished = states.filter((state) => state === "done").length;

  return (
    <>
      <PageHeader title="Settings" actions={<LinkButton variant="ghost" size="sm" href="/clients/new">New client</LinkButton>} />
      <SettingsTabs tenantId={tenantId} active="setup" isAdmin={membership.role === "platform_admin"} />

      <div className="grid gap-1.5">
        <p className="text-sm text-fg-soft">{status.tenant.name}: {finished} of {states.length} done. You can start before everything is green.</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-inner" role="progressbar" aria-valuenow={finished} aria-valuemin={0} aria-valuemax={states.length} aria-label="Setup progress">
          <div className="h-full rounded-full bg-(image:--gradient-bar-h)" style={{ width: `${(finished / states.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <Label className="ps-1.5">Connect Meta</Label>
        <Item title="Meta page, for form leads" state={status.page.state} detail={status.page.detail}>
          <ConnectionForm tenantId={tenantId} kind="page" idLabel="Facebook Page ID" secretLabel="Page access token" hint="Form leads from this page arrive automatically, with a check every 15 minutes for any missed." />
        </Item>
        <Item title="Meta dataset, to send results" state={status.dataset.state} detail={status.dataset.detail}>
          <ConnectionForm tenantId={tenantId} kind="dataset" idLabel="Dataset (Pixel) ID" secretLabel="Conversions API token" hint="Qualent sends each stage to this dataset, so Meta learns which leads were good." />
        </Item>
        <Item title="Ad account, for spend" state={status.adAccount.state} detail={status.adAccountWarning ?? status.adAccount.detail}>
          <ConnectionForm tenantId={tenantId} kind="ad_account" idLabel="Ad account ID (act_…)" secretLabel="Access token" hint="Daily spend per campaign, used for cost per qualified lead." />
        </Item>

        <Label className="mt-3 ps-1.5">Get leads to people</Label>
        <Item title="Telegram team group" state={status.teamGroup} detail={status.telegramConfigured ? undefined : "The bot token isn't set yet, so links and alerts won't work."}>
          <p className="text-sm text-fg-muted">Open this link on a phone and choose the team group. It adds the bot there. The link works once and expires in 15 minutes.</p>
          <LinkTelegram tenantId={tenantId} label="Create group link" />
        </Item>

        <Item title="Who gets leads" state={status.rules ? "done" : "todo"} detail={status.rules ? `${status.rules} ${status.rules === 1 ? "rule" : "rules"}` : undefined}>
          <ul className="grid gap-1.5">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-dense bg-inner px-3 py-2 text-sm">
                <span>
                  {rule.conditions.length ? `Campaign ${String(rule.conditions[0].value)}` : "Everyone else"}: {rule.memberIds.map(nameOf).join(", ")}. Reply in {rule.slaMinutes} min, then moves up to {rule.maxReassigns} {rule.maxReassigns === 1 ? "time" : "times"}{rule.escalateToMemberId ? `, then ${nameOf(rule.escalateToMemberId)}` : ""}.
                </span>
                <ActionForm action={deleteRuleAction} hidden={{ tenantId, ruleId: rule.id }}><Submit variant="ghost" size="sm">Remove</Submit></ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={addRuleAction} hidden={{ tenantId }} className="grid max-w-lg gap-3" resetOnOk>
            <fieldset className="grid gap-1.5 text-sm">
              <legend className="ps-1 pb-1 text-fg-soft">People, taking turns by weight</legend>
              {staff.map((person) => (
                <label key={person.id} className="flex items-center gap-2">
                  <input type="checkbox" name="memberIds[]" value={person.id} className="size-4 accent-(--accent)" />
                  {person.name}{person.weight > 1 ? ` (weight ${person.weight})` : ""}
                </label>
              ))}
            </fieldset>
            <Field label="Only for this campaign ID" hint="Leave empty to cover all other leads."><input name="campaignId" dir="ltr" className={inputClass} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reply within (minutes)"><input name="slaMinutes" type="number" min={1} defaultValue={15} className={inputClass} /></Field>
              <Field label="Moves before escalating"><input name="maxReassigns" type="number" min={0} defaultValue={2} className={inputClass} /></Field>
            </div>
            <Field label="Finally, give it to">
              <select name="escalateToMemberId" className={inputClass} defaultValue="">
                <option value="" className="bg-panel">Nobody, just alert</option>
                {staff.map((person) => <option key={person.id} value={person.id} className="bg-panel">{person.name}</option>)}
              </select>
            </Field>
            <div><Submit variant="secondary" size="sm">Add rule</Submit></div>
          </ActionForm>
        </Item>

        <Item title="People" state={status.agentsLinked ? "done" : "todo"} detail={`${people.length} people, ${status.agentsLinked} of ${status.agents} client agents linked to Telegram`}>
          <ul className="grid gap-1.5">
            {people.map((person) => (
              <li key={person.id} className="grid gap-2 rounded-dense bg-inner px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{person.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill>{{ manager: "Manager", agent: "Staff", client_viewer: "Client, reports only", field_agent: "Client's agent" }[person.role]}</Pill>
                    {person.role === "field_agent" && <Pill tone={person.telegramChatId ? "good" : "warn"}>{person.telegramChatId ? "Telegram linked" : "Not linked"}</Pill>}
                    {person.inviteEmail && <Pill tone="warn">Invited: {person.inviteEmail}</Pill>}
                    {!person.active && <Pill tone="bad">Inactive</Pill>}
                    {person.role !== "client_viewer" && person.role !== "field_agent" && <EditPerson tenantId={tenantId} person={person} timezone={status.tenant.timezone} />}
                    {person.workingHours && <Pill>Set hours</Pill>}
                    {person.recordScope === "assigned" && <Pill>Own leads only</Pill>}
                    <ActionForm action={setPersonActiveAction} hidden={{ tenantId, memberId: person.id, active: String(!person.active) }}>
                      <Submit variant="ghost" size="sm">{person.active ? "Deactivate" : "Reactivate"}</Submit>
                    </ActionForm>
                  </span>
                </div>
                {person.role === "field_agent" && !person.telegramChatId && <LinkTelegram tenantId={tenantId} memberId={person.id} />}
              </li>
            ))}
          </ul>
          <ActionForm action={addPersonAction} hidden={{ tenantId }} className="grid max-w-lg gap-3" resetOnOk>
            <Field label="Name"><input name="name" required className={inputClass} /></Field>
            <Field label="Role">
              <select name="role" className={inputClass} defaultValue="agent">
                <option value="agent" className="bg-panel">7Gence staff</option>
                <option value="manager" className="bg-panel">7Gence manager</option>
                <option value="field_agent" className="bg-panel">Client&apos;s sales agent (Telegram only)</option>
                <option value="client_viewer" className="bg-panel">Client (reports only)</option>
              </select>
            </Field>
            <Field label="Email" hint="Staff and clients sign in with this. Client's agents don't need one."><input name="email" type="email" dir="ltr" className={inputClass} /></Field>
            <Field label="Weight" hint="Higher gets more leads."><input name="weight" type="number" min={1} max={10} defaultValue={1} className={inputClass} /></Field>
            <div><Submit variant="secondary" size="sm">Add person</Submit></div>
          </ActionForm>
        </Item>

        <Item title="Landing page form" state={status.tenant.intakeOrigins.length ? "done" : "todo"} detail={status.tenant.intakeOrigins.join(", ") || undefined}>
          <p className="text-sm text-fg-muted">Paste this on the landing page, and list the sites allowed to send leads. It picks up campaign details by itself and works with the Meta Pixel.</p>
          <pre dir="ltr" className="overflow-x-auto rounded-dense bg-inner p-3 font-mono text-xs">{snippet}</pre>
          <div><CopyButton text={snippet} label="Copy form" /></div>
          <ActionForm action={originsAction} hidden={{ tenantId }} className="grid max-w-lg gap-3">
            <Field label="Allowed sites" hint="One per line, with https://"><textarea name="origins" rows={2} dir="ltr" defaultValue={status.tenant.intakeOrigins.join("\n")} className={textareaClass} /></Field>
            <div><Submit variant="secondary" size="sm">Save sites</Submit></div>
          </ActionForm>
        </Item>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <Label className="ps-1.5">Optional</Label>
        <Item title="Client report branding" state={brand.solidFrom ? "done" : "todo"} detail={brand.name}>
          <ActionForm action={brandAction} hidden={{ tenantId }} className="grid max-w-lg gap-3">
            <Field label="Name shown to the client"><input name="name" defaultValue={brand.name ?? status.tenant.name} className={inputClass} /></Field>
            <Field label="Brand color" hint="We adjust it if needed so labels stay readable."><input name="color" type="color" defaultValue={brand.brand ?? "#2563eb"} className="h-10 w-20 rounded-dense border border-line-control bg-transparent" /></Field>
            <Field label="Logo" hint="PNG or WebP, under 200 KB."><input name="logo" type="file" accept="image/png,image/webp" className="w-full text-sm" /></Field>
            <div className="flex flex-wrap gap-2">
              <Submit variant="secondary" size="sm">Save branding</Submit>
              <Link href={`/portal/${tenantId}`} className="self-center text-sm text-accent underline">See the client view</Link>
            </div>
          </ActionForm>
        </Item>
        <Item title="Time zone, currency, retention and AI budget" state="done" detail={`${status.tenant.timezone}, ${status.tenant.currency}, keeps leads ${status.tenant.retentionDays} days`}>
          <ClientSettings tenantId={tenantId} tenant={status.tenant} aiSpent={aiSpent} />
        </Item>
        <Item title="Pipeline stages" state="done" detail={pipelines[0]?.stages.map((stage) => stage.name).join(", ")}>
          <PipelineStages tenantId={tenantId} list={pipelines[0]?.stages ?? []} />
        </Item>
        <Item title="Custom fields" state={fields.length ? "done" : "todo"} detail={fields.length ? fields.map((field) => field.label).join(", ") : "Optional"}>
          <CustomFields tenantId={tenantId} fields={fields} />
        </Item>
      </div>

      <Panel className="grid max-w-2xl gap-3">
        <Label>Test everything</Label>
        <p className="text-sm text-fg-muted">Runs a fake lead through intake and assignment, and shows what would happen. Erase the test lead afterwards from its page.</p>
        <TestLead tenantId={tenantId} />
      </Panel>
    </>
  );
}
