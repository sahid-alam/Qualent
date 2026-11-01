import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { safeMessage } from "../errors.ts";
import { reportError } from "../sentry.ts";
import { getLead } from "../leads/work.ts";
import { ForbiddenError, requireMember, type Action, type Membership } from "../permissions.ts";
import { requireUserId } from "./session.ts";

export type ActionResult = { ok?: string; error?: string; data?: Record<string, unknown> };

/** A message written for the person using the screen. Anything else stays generic. */
export class UserError extends Error {}

export type Context = { actor: string; membership: Membership; userId: string };

const withTenantId = z.object({ tenantId: z.uuid() });

export function readForm(form: FormData) {
  const values: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key);
    // Names ending in [] are always lists, even with one box ticked.
    if (key.endsWith("[]")) values[key.slice(0, -2)] = all;
    else values[key] = all.length > 1 ? all : all[0];
  }
  return values;
}

/**
 * Every server action goes through this: validate, confirm the session and the
 * permission for this tenant, run, then refresh the screen.
 */
export function action<S extends z.ZodObject>(
  permission: Action,
  schema: S,
  run: (data: z.infer<S> & { tenantId: string }, context: Context) => Promise<string | ActionResult | void>,
) {
  return async (_previous: ActionResult | null, form: FormData): Promise<ActionResult> => {
    const parsed = withTenantId.and(schema).safeParse(readForm(form));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
    const data = parsed.data as z.infer<S> & { tenantId: string };

    try {
      const userId = await requireUserId();
      const membership = await requireMember(userId, data.tenantId, permission);
      const result = await run(data, { actor: `user:${userId}`, membership, userId });
      revalidatePath(`/c/${data.tenantId}`, "layout");
      return typeof result === "string" ? { ok: result } : (result ?? { ok: "Saved." });
    } catch (error) {
      unstable_rethrow(error); // Redirects are thrown, and must reach Next.js.
      if (error instanceof UserError) return { error: error.message };
      if (error instanceof ForbiddenError) return { error: "You don't have permission to do that." };
      console.error(`action failed: ${safeMessage(error)}`);
      await reportError(error, "action");
      return { error: "That didn't save. Try again." };
    }
  };
}

/** An agent limited to their own leads cannot act on anyone else's by guessing an id. */
export async function requireLeadAccess(tenantId: string, leadId: string, { membership }: Pick<Context, "membership">) {
  const lead = await getLead(tenantId, leadId, membership);
  if (!lead) throw new UserError("This lead isn't available to you.");
  return lead;
}
