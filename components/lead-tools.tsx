"use client";

import { useState } from "react";
import { draftReplyAction, logCallAction } from "../app/c/[tenantId]/actions";
import { ActionForm, CopyButton, Submit } from "./forms";
import { buttonClass, cx, textareaClass } from "./ui";

const OUTCOMES = [
  ["reached", "Reached"],
  ["no_answer", "No answer"],
  ["wrong_number", "Wrong number"],
  ["call_back", "Call back"],
] as const;

/** Two clicks: choose the result, save. The note is optional. */
export function LogCall({ tenantId, leadId }: { tenantId: string; leadId: string }) {
  return (
    <ActionForm action={logCallAction} hidden={{ tenantId, leadId }} className="grid gap-2.5" resetOnOk>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Call result</legend>
        {OUTCOMES.map(([value, label], index) => (
          <label key={value} className="flex h-(--control-sm) cursor-pointer items-center rounded-full border border-line-strong px-3.5 text-sm has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-ring">
            <input type="radio" name="outcome" value={value} defaultChecked={index === 0} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor="call-note">Note</label>
      <textarea id="call-note" name="note" rows={2} placeholder="Add a note if useful" className={textareaClass} />
      <div><Submit size="sm">Log call</Submit></div>
    </ActionForm>
  );
}

export function ReplyDraft({ tenantId, leadId, phone }: { tenantId: string; leadId: string; phone: string | null }) {
  const [reply, setReply] = useState("");
  const digits = phone?.replace(/\D/g, "");
  return (
    <div className="grid gap-2.5">
      <ActionForm
        action={draftReplyAction}
        hidden={{ tenantId, leadId }}
        onResult={(result) => {
          if (typeof result.data?.reply === "string") setReply(result.data.reply);
        }}
      >
        <Submit variant="secondary" size="sm">Draft a reply</Submit>
      </ActionForm>
      {reply && (
        <>
          <label className="sr-only" htmlFor="reply">Reply draft</label>
          <textarea id="reply" value={reply} onChange={(event) => setReply(event.target.value)} rows={4} className={textareaClass} />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={reply} />
            {digits && (
              <a className={cx(buttonClass("primary", "sm"))} target="_blank" rel="noopener" href={`https://wa.me/${digits}?text=${encodeURIComponent(reply)}`}>
                Open in WhatsApp
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
