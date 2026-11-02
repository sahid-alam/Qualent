"use client";

import { useRouter } from "next/navigation";
import { addLeadAction } from "../app/c/[tenantId]/actions";
import { ActionForm, Dialog, Submit } from "./forms";
import { Field, inputClass, textareaClass } from "./ui";

export function AddLead({ tenantId, campaigns }: { tenantId: string; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <Dialog trigger="+ Lead" title="Add a lead" triggerVariant="primary">
      <ActionForm
        action={addLeadAction}
        hidden={{ tenantId }}
        className="grid gap-3.5"
        onResult={(result) => {
          if (result.data?.leadId) router.push(`/c/${tenantId}/leads/${result.data.leadId}`);
        }}
      >
        <Field label="Name"><input name="name" autoComplete="off" className={inputClass} /></Field>
        <Field label="Phone" hint="Any format. We keep it as you typed it if we can't read it.">
          <input name="phone" type="tel" dir="ltr" autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Email"><input name="email" type="email" dir="ltr" autoComplete="off" className={inputClass} /></Field>
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="ps-1 pb-1.5 text-fg-soft">How did they reach you?</legend>
          <div className="flex flex-wrap gap-2">
            {["WhatsApp", "Phone", "Walk-in", "Other"].map((channel, index) => (
              <label key={channel} className="flex h-(--control-sm) cursor-pointer items-center rounded-control border border-line-strong px-3.5 text-sm has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-ring">
                <input type="radio" name="channel" value={channel} defaultChecked={index === 0} className="sr-only" />
                {channel}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Campaign, if you know it" hint="Reports show this lead as a manual entry.">
          <select name="campaignId" className={inputClass}>
            <option value="" className="bg-panel">Don&apos;t know</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id} className="bg-panel">{campaign.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Note"><textarea name="note" rows={2} className={textareaClass} /></Field>
        <Submit>Add lead</Submit>
      </ActionForm>
    </Dialog>
  );
}
