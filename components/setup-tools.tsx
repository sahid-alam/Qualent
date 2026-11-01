"use client";

import { useState } from "react";
import { linkTelegramAction, testLeadAction } from "../app/c/[tenantId]/actions";
import { ActionForm, CopyButton, Submit } from "./forms";
import { Pill } from "./ui";

export function LinkTelegram({ tenantId, memberId, label = "Create link" }: { tenantId: string; memberId?: string; label?: string }) {
  const [url, setUrl] = useState("");
  return (
    <div className="grid gap-2">
      <ActionForm
        action={linkTelegramAction}
        hidden={{ tenantId, ...(memberId ? { memberId } : {}) }}
        onResult={(result) => {
          if (typeof result.data?.url === "string") setUrl(result.data.url);
        }}
      >
        <Submit variant="secondary" size="sm">{label}</Submit>
      </ActionForm>
      {url && (
        <div className="flex flex-wrap items-center gap-2">
          <code dir="ltr" className="rounded-dense bg-inner px-2.5 py-1.5 font-mono text-xs break-all">{url}</code>
          <CopyButton text={url} />
        </div>
      )}
    </div>
  );
}

const STEPS: [string, string, string][] = [
  ["arrived", "Lead arrived", "Lead did not arrive"],
  ["assigned", "Assigned to someone", "Nobody assigned: set up who gets leads"],
  ["alert", "Telegram alert ready", "No alert: link the team group and add the bot token"],
  ["dataset", "Meta dataset connected", "No Meta dataset connected yet"],
];

export function TestLead({ tenantId }: { tenantId: string }) {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="grid gap-3">
      <ActionForm action={testLeadAction} hidden={{ tenantId }} onResult={(result) => setReport(result.data ?? null)}>
        <Submit>Send test lead</Submit>
      </ActionForm>
      {report && (
        <ul className="grid gap-1.5 text-sm">
          {STEPS.map(([key, good, bad]) => (
            <li key={key} className="flex items-center justify-between gap-3 rounded-dense bg-inner px-3 py-2">
              <span>{report[key] ? good : bad}</span>
              <Pill tone={report[key] ? "good" : "warn"}>{report[key] ? "OK" : "Check"}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
