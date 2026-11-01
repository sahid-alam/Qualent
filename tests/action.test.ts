import { beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { ingestLead } from "../lib/leads/ingest.ts";
import { createTask, getTask } from "../lib/leads/work.ts";
import { addMember, newTenant } from "./helpers.ts";

const session = vi.hoisted(() => ({ userId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("../lib/auth/session.ts", () => ({ requireUserId: async () => session.userId }));

const { action, UserError } = await import("../lib/auth/action.ts");
const { addLeadAction, completeTaskAction, deliverAction } = await import("../app/c/[tenantId]/actions.ts");

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of [value].flat()) data.append(key, item);
  }
  return data;
};

const run = vi.fn(async () => "Done.");
const settingsAction = action("settings.manage", z.object({ name: z.string().min(1, "Enter a name.") }), run);

beforeEach(() => run.mockClear());

test("a person without the permission never reaches the action", async () => {
  const { id } = await newTenant();
  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "agent" });
  expect(await settingsAction(null, form({ tenantId: id, name: "x" }))).toEqual({ error: "You don't have permission to do that." });
  expect(run).not.toHaveBeenCalled();
});

test("a member of one client cannot act on another by changing the id", async () => {
  const mine = await newTenant();
  const theirs = await newTenant();
  session.userId = crypto.randomUUID();
  await addMember(mine.id, { userId: session.userId, role: "manager" });
  expect((await settingsAction(null, form({ tenantId: mine.id, name: "x" }))).ok).toBe("Done.");
  run.mockClear();
  expect((await settingsAction(null, form({ tenantId: theirs.id, name: "x" }))).error).toBeTruthy();
  expect(run).not.toHaveBeenCalled();
});

test("bad input is refused before anything runs", async () => {
  const { id } = await newTenant();
  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "manager" });
  expect(await settingsAction(null, form({ tenantId: id, name: "" }))).toEqual({ error: "Enter a name." });
  expect((await settingsAction(null, form({ tenantId: "not-a-uuid", name: "x" }))).error).toBeTruthy();
  expect(run).not.toHaveBeenCalled();
});

test("only messages written for people reach the screen", async () => {
  const { id } = await newTenant();
  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "manager" });
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});

  const friendly = action("settings.manage", z.object({}), async () => {
    throw new UserError("Choose a person.");
  });
  expect(await friendly(null, form({ tenantId: id }))).toEqual({ error: "Choose a person." });

  const leaky = action("settings.manage", z.object({}), async () => {
    throw new Error('relation "secret_table" does not exist');
  });
  expect(await leaky(null, form({ tenantId: id }))).toEqual({ error: "That didn't save. Try again." });
  spy.mockRestore();
});

test("ticked boxes arrive as a list, even when there is only one", async () => {
  const { id } = await newTenant();
  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "manager" });
  const seen: string[][] = [];
  const lists = action("settings.manage", z.object({ ids: z.array(z.string()) }), async (data) => {
    seen.push(data.ids);
  });
  await lists(null, form({ tenantId: id, "ids[]": "a" }));
  await lists(null, form({ tenantId: id, "ids[]": ["a", "b"] }));
  expect(seen).toEqual([["a"], ["a", "b"]]);
});

test("an assigned-only agent cannot complete a task on someone else's lead", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", email: "scoped@example.com" });
  const task = await createTask(id, { leadId, title: "Call", dueAt: new Date() }, "t");

  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "agent", recordScope: "assigned" });
  expect((await completeTaskAction(null, form({ tenantId: id, taskId: task.id }))).error).toBe("This lead isn't available to you.");
  expect((await getTask(id, task.id)).doneAt).toBeNull();

  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "agent", recordScope: "all" });
  expect((await completeTaskAction(null, form({ tenantId: id, taskId: task.id }))).ok).toBe("Done.");
  expect((await getTask(id, task.id)).doneAt).toBeInstanceOf(Date);
});

test("an assigned-only agent is told a person is taken, and gets no lead id", async () => {
  const { id } = await newTenant();
  await ingestLead(id, { source: "manual", email: "held@example.com" });
  session.userId = crypto.randomUUID();
  await addMember(id, { userId: session.userId, role: "agent", recordScope: "assigned" });
  const result = await addLeadAction(null, form({ tenantId: id, email: "held@example.com", channel: "Phone" }));
  expect(result).toEqual({ error: "Someone else is already handling this person. Ask your manager." });
});

test("delivery shows its own reasons, and hides anything unexpected", async () => {
  const { id } = await newTenant();
  const { leadId } = await ingestLead(id, { source: "manual", email: "deliver@example.com" });
  session.userId = crypto.randomUUID();
  const manager = await addMember(id, { userId: session.userId, role: "manager" });
  const agent = await addMember(id, { role: "field_agent" });
  const send = (memberId: string) => deliverAction(null, form({ tenantId: id, leadId, memberId }));
  expect(await send(agent.id)).toEqual({ error: "This agent has not linked Telegram" });
  expect(await send(manager.id)).toEqual({ error: "Not an active client agent" });
});
