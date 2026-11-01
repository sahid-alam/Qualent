import { ArrowDown, ArrowUp } from "lucide-react";
import type { customFieldDefs, members, stages, tenants, WorkingHours } from "../../../../lib/db/schema.ts";
import { ActionForm, Dialog, Submit } from "../../../../components/forms";
import { Button, Field, inlineFieldClass, inputClass, Pill, TableWrap } from "../../../../components/ui";
import { addFieldAction, addStageAction, clientSettingsAction, deleteFieldAction, deleteStageAction, saveStageAction, shiftStageAction, updatePersonAction } from "../actions";

const KIND_LABEL = { open: "Open", qualified: "Qualified", won: "Won", lost: "Lost" };
const TYPE_LABEL = { text: "Text", number: "Number", date: "Date", select: "Choice", boolean: "Yes or no" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function KindSelect({ id, value = "open" }: { id: string; value?: string }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>What this stage means</label>
      <select id={id} name="kind" defaultValue={value} className={`${inlineFieldClass} min-w-28`}>
        {Object.entries(KIND_LABEL).map(([kind, label]) => <option key={kind} value={kind} className="bg-panel">{label}</option>)}
      </select>
    </>
  );
}

/** Rows that move with up and down buttons, so reordering works the same by mouse, keyboard and touch. */
export function PipelineStages({ tenantId, list }: { tenantId: string; list: (typeof stages.$inferSelect)[] }) {
  return (
    <>
      <p className="text-sm text-fg-muted">New leads start in the first stage. &quot;Qualified&quot; stages count towards cost per qualified lead. Renaming a stage doesn&apos;t change the event name Meta gets.</p>
      <ul className="grid gap-2">
        {list.map((stage, index) => (
          <li key={stage.id} className="flex flex-wrap items-center gap-2 rounded-dense bg-inner p-2">
            <div className="flex gap-1">
              <ActionForm action={shiftStageAction} hidden={{ tenantId, stageId: stage.id, direction: "up" }}>
                <Button size="sm" variant="ghost" disabled={index === 0} aria-label={`Move ${stage.name} up`}><ArrowUp size={14} aria-hidden /></Button>
              </ActionForm>
              <ActionForm action={shiftStageAction} hidden={{ tenantId, stageId: stage.id, direction: "down" }}>
                <Button size="sm" variant="ghost" disabled={index === list.length - 1} aria-label={`Move ${stage.name} down`}><ArrowDown size={14} aria-hidden /></Button>
              </ActionForm>
            </div>
            <ActionForm action={saveStageAction} hidden={{ tenantId, stageId: stage.id }} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`stage-${stage.id}`}>Stage name</label>
              <input id={`stage-${stage.id}`} name="name" defaultValue={stage.name} required className={`${inlineFieldClass} min-w-32 flex-1`} />
              <KindSelect id={`kind-${stage.id}`} value={stage.kind} />
              <Submit variant="secondary" size="sm">Save</Submit>
            </ActionForm>
            <ActionForm action={deleteStageAction} hidden={{ tenantId, stageId: stage.id }}>
              <Submit variant="ghost" size="sm">Remove</Submit>
            </ActionForm>
          </li>
        ))}
      </ul>
      <ActionForm action={addStageAction} hidden={{ tenantId }} className="flex flex-wrap items-center gap-2" resetOnOk>
        <label className="sr-only" htmlFor="new-stage">New stage name</label>
        <input id="new-stage" name="name" required placeholder="New stage" className={`${inlineFieldClass} min-w-32 flex-1`} />
        <KindSelect id="new-stage-kind" />
        <Submit variant="secondary" size="sm">Add stage</Submit>
      </ActionForm>
    </>
  );
}

export function CustomFields({ tenantId, fields }: { tenantId: string; fields: (typeof customFieldDefs.$inferSelect)[] }) {
  return (
    <>
      <p className="text-sm text-fg-muted">Extra details for this client&apos;s leads, like budget or area. They show on the lead page and as filters in All leads.</p>
      {!!fields.length && (
        <TableWrap>
          <thead><tr><th>Field</th><th>Type</th><th>Choices</th><th><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.id}>
                <td className="font-medium">{field.label}{field.required && <span className="ms-2"><Pill>Required</Pill></span>}</td>
                <td className="text-fg-soft">{TYPE_LABEL[field.type]}</td>
                <td className="text-fg-soft">{field.options?.join(", ") ?? "—"}</td>
                <td className="num"><ActionForm action={deleteFieldAction} hidden={{ tenantId, fieldId: field.id }}><Submit variant="ghost" size="sm">Remove</Submit></ActionForm></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <div>
        <Dialog trigger="Add field" title="Add a field" triggerSize="sm">
          <ActionForm action={addFieldAction} hidden={{ tenantId }} className="grid gap-3.5" resetOnOk>
            <Field label="Name"><input name="label" required placeholder="Budget" className={inputClass} /></Field>
            <Field label="Type">
              <select name="type" defaultValue="text" className={inputClass}>
                {Object.entries(TYPE_LABEL).map(([type, label]) => <option key={type} value={type} className="bg-panel">{label}</option>)}
              </select>
            </Field>
            <Field label="Choices" hint="Only for the Choice type. Separate them with commas."><input name="options" placeholder="Under 1M, 1M to 3M, Over 3M" className={inputClass} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="required" className="size-4 accent-(--accent)" />
              Staff must fill this in when they save a lead&apos;s details
            </label>
            <Submit>Add field</Submit>
          </ActionForm>
        </Dialog>
      </div>
    </>
  );
}

export function ClientSettings({ tenantId, tenant, aiSpent }: { tenantId: string; tenant: typeof tenants.$inferSelect; aiSpent: number }) {
  return (
    <ActionForm action={clientSettingsAction} hidden={{ tenantId }} className="grid max-w-lg gap-3">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-3">
        <Field label="Time zone" hint="Used for reports, tasks and working hours."><input name="timezone" required dir="ltr" defaultValue={tenant.timezone} className={inputClass} /></Field>
        <Field label="Currency"><input name="currency" required maxLength={3} dir="ltr" defaultValue={tenant.currency} className={inputClass} /></Field>
      </div>
      <Field label="Delete leads after (days)" hint="Old contacts are erased automatically after this long."><input name="retentionDays" type="number" min={30} max={3650} defaultValue={tenant.retentionDays} className={inputClass} /></Field>
      <Field label="AI budget per month (USD)" hint={`Spent $${aiSpent.toFixed(2)} this month. We warn at 80% and stop at 100%. Leads keep arriving, unscored.`}>
        <input name="aiMonthlyBudgetUsd" type="number" min={0} step="0.01" defaultValue={tenant.aiMonthlyBudgetUsd} className={inputClass} />
      </Field>
      <div><Submit variant="secondary" size="sm">Save settings</Submit></div>
    </ActionForm>
  );
}

/** One row per day. Unticked means off that day. Times are the client's. */
function WeekHours({ hours }: { hours: WorkingHours | null }) {
  return (
    <div className="grid gap-1.5">
      {DAYS.map((day, index) => {
        const window = hours?.[String(index)];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex basis-full items-center gap-2 sm:basis-auto sm:w-27">
              <input type="checkbox" name={`on${index}`} defaultChecked={hours ? !!window : index >= 1 && index <= 5} className="size-4 accent-(--accent)" />
              {day}
            </label>
            <label className="sr-only" htmlFor={`from${index}`}>{day} start</label>
            <input id={`from${index}`} type="time" name={`from${index}`} defaultValue={window?.from ?? "09:00"} dir="ltr" className={`${inlineFieldClass} min-w-0 flex-1 sm:w-36 sm:flex-none`} />
            <span className="text-fg-muted">to</span>
            <label className="sr-only" htmlFor={`to${index}`}>{day} end</label>
            <input id={`to${index}`} type="time" name={`to${index}`} defaultValue={window?.to ?? "18:00"} dir="ltr" className={`${inlineFieldClass} min-w-0 flex-1 sm:w-36 sm:flex-none`} />
          </div>
        );
      })}
    </div>
  );
}

export function EditPerson({ tenantId, person, timezone }: { tenantId: string; person: typeof members.$inferSelect; timezone: string }) {
  return (
    <Dialog trigger="Edit" title={`Edit ${person.name}`} triggerVariant="ghost" triggerSize="sm">
      <ActionForm action={updatePersonAction} hidden={{ tenantId, memberId: person.id }} className="grid gap-3.5">
        <Field label="Weight" hint="Higher gets more leads."><input name="weight" type="number" min={1} max={10} defaultValue={person.weight} className={inputClass} /></Field>
        {person.role === "agent" && (
          <Field label="Can see">
            <select name="recordScope" defaultValue={person.recordScope} className={inputClass}>
              <option value="all" className="bg-panel">All of this client&apos;s leads</option>
              <option value="assigned" className="bg-panel">Only leads assigned to them</option>
            </select>
          </Field>
        )}
        <fieldset className="grid gap-2.5">
          <legend className="ps-1 pb-1.5 text-sm text-fg-soft">Gets new leads ({timezone})</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="schedule" value="always" defaultChecked={!person.workingHours} className="size-4 accent-(--accent)" />Any time</label>
            <label className="flex items-center gap-2"><input type="radio" name="schedule" value="set" defaultChecked={!!person.workingHours} className="size-4 accent-(--accent)" />Only during these hours</label>
          </div>
          <WeekHours hours={person.workingHours} />
        </fieldset>
        <Submit>Save</Submit>
      </ActionForm>
    </Dialog>
  );
}
