"use client";

import { useState, useTransition, type ReactNode } from "react";
import { addNoteAction, draftReplyAction, logCallAction, moveStageAction } from "../app/c/[tenantId]/actions";
import { ActionForm, CopyButton, Submit } from "./forms";
import { buttonClass, cx, inlineFieldClass, textareaClass } from "./ui";

/** One dropdown rather than a button per stage: each move tells Meta, so it shouldn't be one stray click. */
export function StageSelect({ tenantId, leadId, stageId, stages }: { tenantId: string; leadId: string; stageId: string; stages: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <label className="sr-only" htmlFor="stage">Stage</label>
      <select
        id="stage"
        key={stageId}
        defaultValue={stageId}
        disabled={pending}
        className={inlineFieldClass}
        onChange={(event) => {
          const select = event.currentTarget;
          const form = new FormData();
          form.set("tenantId", tenantId);
          form.set("leadId", leadId);
          form.set("stageId", select.value);
          setError(null);
          startTransition(async () => {
            const result = await moveStageAction(null, form);
            if (result.error) {
              setError(result.error);
              select.value = stageId;
            }
          });
        }}
      >
        {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
      </select>
      <p role="status" aria-live="polite" className="text-xs text-bad empty:hidden">{error}</p>
    </div>
  );
}

const OUTCOMES = [
  ["reached", "Reached"],
  ["no_answer", "No answer"],
  ["wrong_number", "Wrong number"],
  ["call_back", "Call back"],
] as const;

/** Two clicks: choose the result, save. The note is optional. */
export function LogCall({ tenantId, leadId, after }: { tenantId: string; leadId: string; after?: ReactNode }) {
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
      <div className="flex flex-wrap items-center gap-3">
        <Submit>Log call</Submit>
        {after}
      </div>
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
        <Submit variant="secondary" size="sm">{reply ? "Draft again" : "Draft a reply"}</Submit>
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

/** The box under the timeline. Panels stay mounted so half-typed text survives a tab change. */
export function Composer({ tenantId, leadId, phone, canDraft, next }: { tenantId: string; leadId: string; phone: string | null; canDraft: boolean; next?: ReactNode }) {
  const tabs = [["call", "Log a call"], ["note", "Add a note"], ...(canDraft ? [["draft", "Draft a reply"]] : [])];
  const [tab, setTab] = useState("call");
  return (
    <div className="grid gap-3 rounded-card border border-line-strong bg-inner p-3.5">
      <div role="tablist" aria-label="Add to this lead" className="flex flex-wrap gap-1">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx("h-7.75 rounded-full px-3.5 text-xs font-medium pointer-coarse:h-11", tab === value ? "bg-inverse text-on-inverse" : "text-fg-muted hover:text-fg")}
          >
            {label}
          </button>
        ))}
      </div>
      <div hidden={tab !== "call"}><LogCall tenantId={tenantId} leadId={leadId} after={next} /></div>
      <div hidden={tab !== "note"}>
        <ActionForm action={addNoteAction} hidden={{ tenantId, leadId }} className="grid gap-2.5" resetOnOk>
          <label className="sr-only" htmlFor="note">Add a note</label>
          <textarea id="note" name="body" rows={2} placeholder="Add a note. Paste only what the lead wrote, not other people's details." className={textareaClass} />
          <div className="flex flex-wrap items-center gap-3">
            <Submit>Add note</Submit>
            {next}
          </div>
        </ActionForm>
      </div>
      {canDraft && <div hidden={tab !== "draft"}><ReplyDraft tenantId={tenantId} leadId={leadId} phone={phone} /></div>}
    </div>
  );
}
