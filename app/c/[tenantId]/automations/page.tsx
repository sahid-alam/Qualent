import { guardPage } from "../../../../lib/auth/session.ts";
import type { AutomationStep } from "../../../../lib/db/schema.ts";
import { listAutomations, listPipelines } from "../../../../lib/settings.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { Empty, inlineFieldClass, inputClass, Label, PageHeader, Panel, Pill } from "../../../../components/ui";
import { saveAutomationAction, setAutomationActiveAction } from "../actions";

export const metadata = { title: "Automations · Qualent" };

const WAITS = [
  ["0", "straight away"],
  ["60", "after 1 hour"],
  ["1440", "after 1 day"],
  ["4320", "after 3 days"],
  ["10080", "after 7 days"],
];

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: "a new lead arrives",
  stage_changed: "a lead enters a stage",
  score_changed: "a lead's temperature changes",
  task_overdue: "a task goes overdue",
  no_activity: "a lead goes quiet",
};

function describe(step: AutomationStep, stageName: (id: string) => string) {
  switch (step.type) {
    case "wait":
      return `wait ${step.minutes >= 1440 ? `${step.minutes / 1440} day${step.minutes === 1440 ? "" : "s"}` : `${step.minutes} min`}`;
    case "create_task":
      return `create the task “${step.title}”`;
    case "alert":
      return `alert the team: “${step.text}”`;
    case "move_stage":
      return `move to ${stageName(step.stageId)}`;
    case "assign":
      return "assign to someone";
    case "tag":
      return `tag it ${step.tag}`;
  }
}

const inline = inlineFieldClass;

export default async function AutomationsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  await guardPage(tenantId, "settings.manage");
  const [rules, pipelines] = await Promise.all([listAutomations(tenantId), listPipelines(tenantId)]);
  const stages = pipelines[0]?.stages ?? [];
  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.name ?? "a stage";

  return (
    <>
      <PageHeader title="Automations" subtitle="Follow-ups that happen without anyone remembering. A lead enters each rule once, and every wait checks again before doing anything." />

      <Panel className="grid gap-4">
        <Label>New rule</Label>
        <ActionForm action={saveAutomationAction} hidden={{ tenantId }} className="grid gap-4" resetOnOk>
          <label className="grid max-w-md gap-1.5 text-sm">
            <span className="ps-1 text-fg-soft">Name</span>
            <input name="name" required placeholder="Viewing follow-up" className={inputClass} />
          </label>
          <p className="flex flex-wrap items-center gap-2 text-md">
            When
            <label className="contents"><span className="sr-only">Trigger</span>
              <select name="trigger" className={inline} defaultValue="stage_changed">
                {Object.entries(TRIGGER_LABEL).map(([value, label]) => <option key={value} value={value} className="bg-panel">{label}</option>)}
              </select>
            </label>
            <label className="contents"><span className="sr-only">Stage</span>
              <select name="triggerStageId" className={inline} defaultValue="">
                <option value="" className="bg-panel">any stage</option>
                {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
              </select>
            </label>
            then
            <label className="contents"><span className="sr-only">Wait</span>
              <select name="waitMinutes" className={inline} defaultValue="1440">
                {WAITS.map(([value, label]) => <option key={value} value={value} className="bg-panel">{label}</option>)}
              </select>
            </label>
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm"><span className="ps-1 text-fg-soft">Create the task</span><input name="taskTitle" placeholder="Ask how the viewing went" className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm"><span className="ps-1 text-fg-soft">Alert the team</span><input name="alertText" placeholder="Optional message" className={inputClass} /></label>
            <label className="grid gap-1.5 text-sm"><span className="ps-1 text-fg-soft">Move to</span>
              <select name="moveStageId" className={inputClass} defaultValue="">
                <option value="" className="bg-panel">Don&apos;t move</option>
                {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-wrap items-center gap-3 text-sm">
            <legend className="ps-1 pb-1.5 text-fg-soft">Stop if the lead reaches</legend>
            {stages.filter((stage) => stage.kind === "won" || stage.kind === "lost").map((stage) => (
              <label key={stage.id} className="flex items-center gap-2">
                <input type="checkbox" name="exitStageIds[]" value={stage.id} defaultChecked className="size-4 accent-(--accent)" />
                {stage.name}
              </label>
            ))}
          </fieldset>
          <div><Submit>Turn on</Submit></div>
        </ActionForm>
      </Panel>

      <section className="grid gap-2.5">
        <Label>Rules</Label>
        {!rules.length && <Empty title="No rules yet" body="Start with one follow-up you keep forgetting." />}
        <ul className="grid gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-row border border-line bg-card px-4 py-3">
              <div className="grid min-w-0 gap-0.5">
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-fg-soft">
                  When {TRIGGER_LABEL[rule.trigger]}{rule.triggerConfig.stageId ? ` (${stageName(rule.triggerConfig.stageId)})` : ""}: {rule.steps.map((step) => describe(step, stageName)).join(", then ")}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={rule.active ? "good" : "neutral"}>{rule.active ? "On" : "Off"}</Pill>
                <ActionForm action={setAutomationActiveAction} hidden={{ tenantId, ruleId: rule.id, active: String(!rule.active) }}>
                  <Submit variant="secondary" size="sm">{rule.active ? "Turn off" : "Turn on"}</Submit>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
