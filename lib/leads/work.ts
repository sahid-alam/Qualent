import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import Papa from "papaparse";
import { withTenant, type Db } from "../db/client.ts";
import { activities, contacts, customFieldDefs, leads, savedViews, stages, tasks, touches } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";
import type { Membership } from "../permissions.ts";
import { addNote, ingestLead, InvalidLeadError, LeadNotAccessibleError } from "./ingest.ts";
import { moveStage } from "./stage.ts";

const RESCORE_DEBOUNCE_SECONDS = 120;

const rescore = (db: Db, tenantId: string, leadId: string) =>
  enqueue(db, "ai", { type: "lead_insights", tenantId, leadId }, { singletonKey: `insights:${leadId}`, singletonSeconds: RESCORE_DEBOUNCE_SECONDS });

const markResponded = (db: Db, leadId: string) =>
  db
    .update(leads)
    .set({ firstResponseAt: sql`coalesce(${leads.firstResponseAt}, now())`, updatedAt: sql`now()` })
    .where(eq(leads.id, leadId));

export function createNote(tenantId: string, leadId: string, body: string, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      await addNote(db, tenantId, leadId, body, actor);
      await markResponded(db, leadId);
      await rescore(db, tenantId, leadId);
    },
    actor,
  );
}

export function logCall(tenantId: string, leadId: string, outcome: string, note: string | null, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      await db.insert(activities).values({ tenantId, leadId, kind: "call", body: note, data: { outcome }, actor });
      await markResponded(db, leadId);
      await rescore(db, tenantId, leadId);
    },
    actor,
  );
}

export function changeStage(tenantId: string, leadId: string, stageId: string, actor: string) {
  return withTenant(tenantId, (db) => moveStage(db, tenantId, leadId, stageId, actor), actor);
}

export function createTask(
  tenantId: string,
  input: { leadId: string; title: string; dueAt: Date; assigneeMemberId?: string | null },
  actor: string,
) {
  return withTenant(tenantId, (db) => db.insert(tasks).values({ tenantId, ...input }).returning().then(([row]) => row), actor);
}

export function getTask(tenantId: string, taskId: string) {
  return withTenant(tenantId, (db) => db.select().from(tasks).where(eq(tasks.id, taskId)).then(([row]) => row));
}

export function completeTask(tenantId: string, taskId: string, actor: string) {
  return withTenant(tenantId, (db) => db.update(tasks).set({ doneAt: sql`now()` }).where(eq(tasks.id, taskId)), actor);
}

/** Overdue and due today, in the tenant's time zone. */
export function todayTasks(tenantId: string, timezone: string, memberId: string | null, now = new Date()) {
  return withTenant(tenantId, (db) =>
    db
      .select({ task: tasks, leadName: contacts.name })
      .from(tasks)
      .innerJoin(leads, eq(leads.id, tasks.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          isNull(tasks.doneAt),
          memberId ? eq(tasks.assigneeMemberId, memberId) : undefined,
          sql`${tasks.dueAt} < (date_trunc('day', ${now.toISOString()}::timestamptz at time zone ${timezone}) + interval '1 day') at time zone ${timezone}`,
        ),
      )
      .orderBy(asc(tasks.dueAt)),
  );
}

export type LeadFilters = {
  stageIds?: string[];
  ownerMemberId?: string;
  temperature?: "hot" | "warm" | "cold";
  status?: "open" | "won" | "lost";
  search?: string;
  createdFrom?: Date;
  createdTo?: Date;
  custom?: Record<string, unknown>;
  unassigned?: boolean;
  sort?: "created" | "score" | "updated";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

function leadConditions(filters: LeadFilters, membership: Pick<Membership, "memberId" | "recordScope">) {
  const conditions: (SQL | undefined)[] = [
    // Agents limited to their own leads see nothing else, whatever they filter on.
    membership.recordScope === "assigned" ? eq(leads.ownerMemberId, membership.memberId ?? "") : undefined,
    filters.stageIds?.length ? inArray(leads.stageId, filters.stageIds) : undefined,
    filters.ownerMemberId ? eq(leads.ownerMemberId, filters.ownerMemberId) : undefined,
    filters.temperature ? eq(leads.temperature, filters.temperature) : undefined,
    filters.status ? eq(leads.status, filters.status) : undefined,
    filters.unassigned ? isNull(leads.ownerMemberId) : undefined,
    filters.createdFrom ? gte(leads.createdAt, filters.createdFrom) : undefined,
    filters.createdTo ? lte(leads.createdAt, filters.createdTo) : undefined,
    filters.custom ? sql`${leads.custom} @> ${JSON.stringify(filters.custom)}::jsonb` : undefined,
  ];
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(contacts.name, term), ilike(contacts.email, term), ilike(contacts.phoneE164, term)));
  }
  return and(...conditions);
}

export function listLeads(tenantId: string, filters: LeadFilters, membership: Pick<Membership, "memberId" | "recordScope">) {
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const sortColumn = { created: leads.createdAt, score: leads.score, updated: leads.updatedAt }[filters.sort ?? "created"];
  return withTenant(tenantId, async (db) => {
    const where = leadConditions(filters, membership);
    const rows = await db
      .select({ lead: leads, contact: contacts, stage: stages })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(stages, eq(stages.id, leads.stageId))
      .where(where)
      .orderBy(filters.direction === "asc" ? asc(sortColumn) : sql`${sortColumn} desc nulls last`)
      .limit(pageSize)
      .offset(((filters.page ?? 1) - 1) * pageSize);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(where);
    return { rows, total, pageSize };
  });
}

export function getLead(tenantId: string, leadId: string, membership: Pick<Membership, "memberId" | "recordScope">) {
  return withTenant(tenantId, async (db) => {
    const [row] = await db
      .select({ lead: leads, contact: contacts, stage: stages })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(stages, eq(stages.id, leads.stageId))
      .where(and(eq(leads.id, leadId), leadConditions({}, membership)));
    if (!row) return null;
    // One connection per transaction, so these run in turn.
    const timeline = await db.select().from(activities).where(eq(activities.leadId, leadId)).orderBy(desc(activities.occurredAt));
    const leadTouches = await db.select().from(touches).where(eq(touches.leadId, leadId)).orderBy(asc(touches.occurredAt));
    const leadTasks = await db.select().from(tasks).where(eq(tasks.leadId, leadId)).orderBy(asc(tasks.dueAt));
    return { ...row, timeline, touches: leadTouches, tasks: leadTasks };
  });
}

export function bulkUpdateLeads(
  tenantId: string,
  leadIds: string[],
  change: { ownerMemberId?: string; stageId?: string },
  actor: string,
) {
  return withTenant(
    tenantId,
    async (db) => {
      if (change.ownerMemberId) {
        await db.update(leads).set({ ownerMemberId: change.ownerMemberId, updatedAt: sql`now()` }).where(inArray(leads.id, leadIds));
      }
      if (change.stageId) {
        for (const leadId of leadIds) await moveStage(db, tenantId, leadId, change.stageId, actor);
      }
    },
    actor,
  );
}

export function saveView(tenantId: string, memberId: string | null, name: string, config: unknown) {
  return withTenant(tenantId, (db) => db.insert(savedViews).values({ tenantId, memberId, name, config }).returning().then(([row]) => row));
}

export function listViews(tenantId: string, memberId: string) {
  return withTenant(tenantId, (db) =>
    db.select().from(savedViews).where(or(isNull(savedViews.memberId), eq(savedViews.memberId, memberId))),
  );
}

type FieldDef = typeof customFieldDefs.$inferSelect;

/** Returns the error for one field, or null. */
export function fieldError(def: FieldDef, value: unknown) {
  if (value === undefined || value === null || value === "") return def.required ? `${def.label} is required` : null;
  switch (def.type) {
    case "number":
      return Number.isFinite(Number(value)) ? null : `${def.label} must be a number`;
    case "boolean":
      return typeof value === "boolean" ? null : `${def.label} must be yes or no`;
    case "date":
      return Number.isNaN(Date.parse(String(value))) ? `${def.label} must be a date` : null;
    case "select":
      return def.options?.includes(String(value)) ? null : `${def.label} is not an allowed option`;
    case "text":
      return typeof value === "string" ? null : `${def.label} must be text`;
  }
}

export function setCustomFields(tenantId: string, leadId: string, values: Record<string, unknown>, actor: string) {
  return withTenant(
    tenantId,
    async (db) => {
      const defs = await db.select().from(customFieldDefs);
      const known = new Map(defs.map((def) => [def.key, def]));
      const unknown = Object.keys(values).filter((key) => !known.has(key));
      const errors = [
        ...unknown.map((key) => `Unknown field: ${key}`),
        ...Object.entries(values).flatMap(([key, value]) => {
          const def = known.get(key);
          const error = def ? fieldError(def, value) : null;
          return error ? [error] : [];
        }),
      ];
      if (errors.length) return { errors };
      await db
        .update(leads)
        .set({ custom: sql`${leads.custom} || ${JSON.stringify(values)}::jsonb`, updatedAt: sql`now()` })
        .where(eq(leads.id, leadId));
      return { errors: [] };
    },
    actor,
  );
}


/** One transaction per row, so one bad row never loses the others. */
export async function importCsv(tenantId: string, csv: string, actor: string, ownedBy?: string) {
  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const report = { created: 0, duplicates: 0, errors: parseErrors.map((error) => ({ row: (error.row ?? 0) + 2, message: error.message })) };
  for (const [index, row] of data.entries()) {
    try {
      const result = await ingestLead(tenantId, {
        source: "csv",
        name: row.name,
        phone: row.phone,
        email: row.email,
        note: row.note || undefined,
        touch: row.campaign_id ? { campaignId: row.campaign_id } : undefined,
        actor,
        ownedBy,
      });
      if (result.created) report.created++;
      else report.duplicates++;
    } catch (error) {
      report.errors.push({ row: index + 2, message: csvRowError(error) });
    }
  }
  return report;
}

function csvRowError(error: unknown) {
  if (error instanceof InvalidLeadError) return error.message;
  if (error instanceof LeadNotAccessibleError) return "Someone else is already handling this person";
  return "This row couldn't be saved";
}

/** Stops a spreadsheet running a lead's text as a formula. Clean E.164 phones stay usable. */
export function safeCell(value: string | number | null | undefined) {
  if (typeof value !== "string" || /^\+\d{7,15}$/.test(value)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function exportCsv(tenantId: string, filters: LeadFilters, membership: Pick<Membership, "memberId" | "recordScope">) {
  const { rows } = await listLeads(tenantId, { ...filters, pageSize: 200 }, membership);
  return Papa.unparse(
    rows.map(({ lead, contact, stage }) => ({
      name: safeCell(contact.name),
      phone: safeCell(contact.phoneE164 ?? contact.phoneRaw),
      email: safeCell(contact.email),
      stage: safeCell(stage.name),
      status: lead.status,
      score: lead.score,
      temperature: lead.temperature,
      created_at: lead.createdAt.toISOString(),
    })),
  );
}

