"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "../../lib/auth/action.ts";
import { requireUserId } from "../../lib/auth/session.ts";
import { isPlatformAdmin } from "../../lib/permissions.ts";
import { createTenant, PIPELINE_TEMPLATES } from "../../lib/tenants.ts";

const validZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const NewClient = z.object({
  name: z.string().trim().min(1, "Enter the client's name."),
  template: z.string().refine((key) => key in PIPELINE_TEMPLATES, "Choose a pipeline."),
  country: z.string().trim().toUpperCase().length(2, "Use a two-letter country code, like AE."),
  currency: z.string().trim().toUpperCase().length(3, "Use a three-letter currency code, like AED."),
  timezone: z.string().trim().refine(validZone, "Use a time zone like Asia/Dubai."),
});

export async function createClientAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (!(await isPlatformAdmin(await requireUserId()))) return { error: "Only platform admins can create clients." };
  const parsed = NewClient.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await createTenant(parsed.data);
  redirect(`/c/${tenant.id}/setup`);
}
