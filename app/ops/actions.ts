"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readForm, UserError, type ActionResult } from "../../lib/auth/action.ts";
import { requireUserId } from "../../lib/auth/session.ts";
import { safeMessage } from "../../lib/errors.ts";
import { isPlatformAdmin } from "../../lib/permissions.ts";
import { reportError } from "../../lib/sentry.ts";
import { addAiModel, AI_TASKS, aiModelProblem, dismissDeadLetter, retryDeadLetter, setAiModelActive } from "../../lib/system.ts";

/** Same shape as action(), for screens that belong to no one client. */
function adminAction<S extends z.ZodObject>(schema: S, run: (data: z.infer<S>, actor: string) => Promise<string>) {
  return async (_: ActionResult | null, form: FormData): Promise<ActionResult> => {
    const parsed = schema.safeParse(readForm(form));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
    const userId = await requireUserId();
    if (!(await isPlatformAdmin(userId))) return { error: "Only platform admins can do that." };
    try {
      const ok = await run(parsed.data, `user:${userId}`);
      revalidatePath("/ops");
      return { ok };
    } catch (error) {
      if (error instanceof UserError) return { error: error.message };
      console.error(`system action failed: ${safeMessage(error)}`);
      await reportError(error, "system action");
      return { error: "That didn't save. Try again." };
    }
  };
}

export const retryJobAction = adminAction(z.object({ jobId: z.uuid() }), async ({ jobId }) =>
  (await retryDeadLetter(jobId)) ? "Sent back to its queue." : "That job can't be retried. Dismiss it.",
);

export const dismissJobAction = adminAction(z.object({ jobId: z.uuid() }), async ({ jobId }) => {
  await dismissDeadLetter(jobId);
  return "Dismissed.";
});

export const addModelAction = adminAction(
  z.object({
    provider: z.string().trim().min(1, "Name the provider."),
    baseUrl: z.string().trim().min(1, "Enter the address."),
    model: z.string().trim().min(1, "Enter the model name."),
    apiKeyEnv: z.string().trim().optional(),
    priceIn: z.coerce.number().min(0).default(0),
    priceOut: z.coerce.number().min(0).default(0),
    noTraining: z.enum(["on"]).optional(),
    reasoningEffort: z.string().trim().optional(),
    tasks: z.array(z.enum(AI_TASKS)).min(1, "Choose what this model is for."),
  }),
  async (data, actor) => {
    const input = { ...data, apiKeyEnv: data.apiKeyEnv || null, reasoningEffort: data.reasoningEffort || null, noTraining: !!data.noTraining };
    const problem = aiModelProblem(input);
    if (problem) throw new UserError(problem);
    await addAiModel(input, actor);
    return "Model added.";
  },
);

export const setModelActiveAction = adminAction(z.object({ modelId: z.uuid(), active: z.enum(["true", "false"]) }), async ({ modelId, active }, actor) => {
  await setAiModelActive(modelId, active === "true", actor);
  return "Saved.";
});
