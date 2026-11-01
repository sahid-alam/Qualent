import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Not in `public`, so Supabase's auto-generated API never exposes it.
export const ops = pgSchema("ops");

export const workerHeartbeat = ops.table(
  "worker_heartbeat",
  {
    id: smallint().primaryKey().default(1),
    beatAt: timestamp("beat_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("worker_heartbeat_single_row", sql`${t.id} = 1`)],
);

const id = () => uuid().primaryKey().defaultRandom();
const at = () => timestamp({ withTimezone: true });
const createdAt = () => at().notNull().defaultNow();
const tenantId = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const ROLES = ["manager", "agent", "client_viewer", "field_agent"] as const;
export type Role = (typeof ROLES)[number];
export const STAGE_KINDS = ["open", "qualified", "won", "lost"] as const;
export const LEAD_SOURCES = ["meta_form", "landing_page", "manual", "csv"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const tenants = pgTable("tenants", {
  id: id(),
  name: text().notNull(),
  region: text().notNull().default("uae"),
  country: text().notNull().default("AE"),
  timezone: text().notNull().default("Asia/Dubai"),
  currency: text().notNull().default("AED"),
  brand: jsonb().notNull().default({}),
  aiMonthlyBudgetUsd: numeric({ precision: 10, scale: 2 }).notNull().default("5"),
  retentionDays: integer().notNull().default(730),
  intakeOrigins: jsonb().$type<string[]>().notNull().default([]),
  telegramTeamChatId: text(),
  createdAt: createdAt(),
});

// Login identity. The id is the Supabase Auth user id. No foreign key to
// auth.users, so the schema also runs on plain Postgres in tests.
export const profiles = pgTable("profiles", {
  id: uuid().primaryKey(),
  name: text().notNull(),
  isPlatformAdmin: boolean().notNull().default(false),
});

// Lookups made before the tenant is known: Meta page ids, landing page keys,
// Telegram link codes. Holds no personal data.
export const tenantDirectory = pgTable("tenant_directory", {
  key: text().primaryKey(),
  kind: text({ enum: ["page", "intake_key", "link_code"] }).notNull(),
  tenantId: tenantId(),
  memberId: uuid(),
  expiresAt: at(),
});

export const members = pgTable(
  "members",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid(),
    name: text().notNull(),
    role: text({ enum: ROLES }).notNull(),
    recordScope: text({ enum: ["all", "assigned"] }).notNull().default("all"),
    telegramUserId: text(),
    telegramChatId: text(),
    weight: integer().notNull().default(1),
    workingHours: jsonb().$type<WorkingHours | null>(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    uniqueIndex("members_tenant_user").on(t.tenantId, t.userId).where(sql`${t.userId} is not null`),
    index("members_user").on(t.userId),
  ],
);

// Keyed by day (0 = Sunday), in the tenant's time zone. Null means always on.
export type WorkingHours = Record<string, { from: string; to: string }>;

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    tenantId: tenantId(),
    name: text(),
    phoneE164: text("phone_e164"),
    phoneRaw: text(),
    phoneInvalid: boolean().notNull().default(false),
    email: text(),
    consentSource: text(),
    consentText: text(),
    consentAt: at(),
    optedOutAt: at(),
    erasedAt: at(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    uniqueIndex("contacts_tenant_phone").on(t.tenantId, t.phoneE164).where(sql`${t.phoneE164} is not null`),
    uniqueIndex("contacts_tenant_email").on(t.tenantId, t.email).where(sql`${t.email} is not null`),
  ],
);

export const pipelines = pgTable(
  "pipelines",
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.tenantId, t.id)],
);

export const stages = pgTable(
  "stages",
  {
    id: id(),
    tenantId: tenantId(),
    pipelineId: uuid().notNull(),
    position: integer().notNull(),
    name: text().notNull(),
    kind: text({ enum: STAGE_KINDS }).notNull().default("open"),
    capiEnabled: boolean().notNull().default(true),
    capiEventName: text(),
    agentButton: boolean().notNull().default(false),
    slaMinutes: integer(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    unique().on(t.pipelineId, t.position),
    foreignKey({ columns: [t.tenantId, t.pipelineId], foreignColumns: [pipelines.tenantId, pipelines.id] }).onDelete("cascade"),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    tenantId: tenantId(),
    contactId: uuid().notNull(),
    pipelineId: uuid().notNull(),
    stageId: uuid().notNull(),
    ownerMemberId: uuid(),
    deliveredToMemberId: uuid(),
    deliveredAt: at(),
    deliveryFailedAt: at(),
    agentResponseAt: at(),
    status: text({ enum: ["open", "won", "lost"] }).notNull().default("open"),
    score: integer(),
    temperature: text({ enum: ["hot", "warm", "cold"] }),
    scoreReason: text(),
    summary: text(),
    nextStep: text(),
    assignedAt: at(),
    firstResponseAt: at(),
    reassignCount: integer().notNull().default(0),
    needsReview: boolean().notNull().default(false),
    value: numeric({ precision: 14, scale: 2 }),
    valueCurrency: text(),
    custom: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.contactId], foreignColumns: [contacts.tenantId, contacts.id] }),
    foreignKey({ columns: [t.tenantId, t.pipelineId], foreignColumns: [pipelines.tenantId, pipelines.id] }),
    foreignKey({ columns: [t.tenantId, t.stageId], foreignColumns: [stages.tenantId, stages.id] }),
    foreignKey({ columns: [t.tenantId, t.ownerMemberId], foreignColumns: [members.tenantId, members.id] }),
    foreignKey({ columns: [t.tenantId, t.deliveredToMemberId], foreignColumns: [members.tenantId, members.id] }),
    index("leads_tenant_stage").on(t.tenantId, t.stageId),
    index("leads_tenant_owner").on(t.tenantId, t.ownerMemberId),
    index("leads_tenant_contact").on(t.tenantId, t.contactId),
    index("leads_tenant_created").on(t.tenantId, t.createdAt),
    index("leads_custom").using("gin", t.custom),
  ],
);

const leadFk = (t: { tenantId: never; leadId: never }) =>
  foreignKey({ columns: [t.tenantId, t.leadId], foreignColumns: [leads.tenantId, leads.id] }).onDelete("cascade");

export const touches = pgTable(
  "touches",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid().notNull(),
    source: text({ enum: LEAD_SOURCES }).notNull(),
    metaLeadgenId: text(),
    pageId: text(),
    formId: text(),
    adId: text(),
    adsetId: text(),
    campaignId: text(),
    utmSource: text(),
    utmMedium: text(),
    utmCampaign: text(),
    utmTerm: text(),
    utmContent: text(),
    fbclid: text(),
    fbc: text(),
    fbp: text(),
    pixelEventId: text(),
    eventSourceUrl: text(),
    clientIp: text(),
    userAgent: text(),
    occurredAt: createdAt(),
  },
  (t) => [
    leadFk(t as never),
    uniqueIndex("touches_leadgen").on(t.tenantId, t.metaLeadgenId).where(sql`${t.metaLeadgenId} is not null`),
    uniqueIndex("touches_pixel_event").on(t.tenantId, t.pixelEventId).where(sql`${t.pixelEventId} is not null`),
    index("touches_tenant_lead").on(t.tenantId, t.leadId),
    index("touches_tenant_campaign").on(t.tenantId, t.campaignId),
  ],
);

export const stageHistory = pgTable(
  "stage_history",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid().notNull(),
    stageId: uuid().notNull(),
    enteredAt: createdAt(),
    actor: text().notNull(),
  },
  (t) => [
    leadFk(t as never),
    foreignKey({ columns: [t.tenantId, t.stageId], foreignColumns: [stages.tenantId, stages.id] }),
    index("stage_history_tenant_lead").on(t.tenantId, t.leadId),
    index("stage_history_tenant_stage").on(t.tenantId, t.stageId, t.enteredAt),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid().notNull(),
    kind: text({ enum: ["note", "call", "stage", "assignment", "delivery", "ai", "system"] }).notNull(),
    body: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    actor: text().notNull().default("system"),
    externalId: text(),
    occurredAt: createdAt(),
  },
  (t) => [
    leadFk(t as never),
    uniqueIndex("activities_external").on(t.tenantId, t.externalId).where(sql`${t.externalId} is not null`),
    index("activities_tenant_lead").on(t.tenantId, t.leadId, t.occurredAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid().notNull(),
    assigneeMemberId: uuid(),
    title: text().notNull(),
    dueAt: at().notNull(),
    doneAt: at(),
    createdAt: createdAt(),
  },
  (t) => [
    leadFk(t as never),
    foreignKey({ columns: [t.tenantId, t.assigneeMemberId], foreignColumns: [members.tenantId, members.id] }),
    index("tasks_tenant_due").on(t.tenantId, t.assigneeMemberId, t.dueAt).where(sql`${t.doneAt} is null`),
  ],
);

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: id(),
    tenantId: tenantId(),
    key: text().notNull(),
    label: text().notNull(),
    type: text({ enum: ["text", "number", "date", "select", "boolean"] }).notNull(),
    options: jsonb().$type<string[]>(),
    required: boolean().notNull().default(false),
  },
  (t) => [unique().on(t.tenantId, t.key)],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    tenantId: tenantId(),
    memberId: uuid(),
    name: text().notNull(),
    config: jsonb().notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.memberId], foreignColumns: [members.tenantId, members.id] }).onDelete("cascade"),
    index("saved_views_tenant").on(t.tenantId, t.memberId),
  ],
);

export const routingRules = pgTable(
  "routing_rules",
  {
    id: id(),
    tenantId: tenantId(),
    position: integer().notNull().default(0),
    conditions: jsonb().$type<Condition[]>().notNull().default([]),
    memberIds: jsonb().$type<string[]>().notNull(),
    // Assignments per member. Round robin is the same rule with equal weights.
    counters: jsonb().$type<Record<string, number>>().notNull().default({}),
    slaMinutes: integer().notNull().default(15),
    escalateToMemberId: uuid(),
    maxReassigns: integer().notNull().default(2),
    active: boolean().notNull().default(true),
  },
  (t) => [
    foreignKey({ columns: [t.tenantId, t.escalateToMemberId], foreignColumns: [members.tenantId, members.id] }),
    index("routing_rules_tenant").on(t.tenantId, t.position),
  ],
);

export type Condition = { field: string; op: "eq" | "neq" | "in" | "gte" | "lte" | "set"; value?: unknown };
export type AutomationStep =
  | { type: "wait"; minutes: number }
  | { type: "create_task"; title: string; dueInMinutes?: number }
  | { type: "alert"; text: string }
  | { type: "move_stage"; stageId: string }
  | { type: "assign"; memberId: string }
  | { type: "tag"; tag: string };

export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    trigger: text({ enum: ["lead_created", "stage_changed", "score_changed", "task_overdue", "no_activity"] }).notNull(),
    triggerConfig: jsonb().$type<{ stageId?: string; days?: number }>().notNull().default({}),
    conditions: jsonb().$type<Condition[]>().notNull().default([]),
    steps: jsonb().$type<AutomationStep[]>().notNull(),
    exitStageIds: jsonb().$type<string[]>().notNull().default([]),
    active: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.tenantId, t.id), index("automation_rules_tenant").on(t.tenantId, t.trigger)],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    tenantId: tenantId(),
    ruleId: uuid().notNull(),
    leadId: uuid().notNull(),
    stepIndex: integer().notNull().default(0),
    status: text({ enum: ["running", "done", "exited"] }).notNull().default("running"),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.ruleId, t.leadId),
    leadFk(t as never),
    foreignKey({ columns: [t.tenantId, t.ruleId], foreignColumns: [automationRules.tenantId, automationRules.id] }).onDelete("cascade"),
  ],
);

export const connections = pgTable(
  "connections",
  {
    id: id(),
    tenantId: tenantId(),
    kind: text({ enum: ["page", "ad_account", "dataset"] }).notNull(),
    externalId: text().notNull(),
    name: text(),
    secretEncrypted: text(),
    status: text({ enum: ["ok", "error"] }).notNull().default("ok"),
    lastError: text(),
    testEventCode: text(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.kind, t.externalId), index("connections_tenant").on(t.tenantId, t.kind)],
);

export const capiEvents = pgTable(
  "capi_events",
  {
    id: id(),
    tenantId: tenantId(),
    leadId: uuid().notNull(),
    stageId: uuid().notNull(),
    eventId: text().notNull(),
    eventName: text().notNull(),
    shape: text({ enum: ["meta_form", "website"] }).notNull(),
    status: text({ enum: ["queued", "sent", "failed", "expired", "no_connection", "skipped"] }).notNull().default("queued"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    eventTime: createdAt(),
    sentAt: at(),
  },
  (t) => [
    unique().on(t.tenantId, t.eventId),
    leadFk(t as never),
    index("capi_events_tenant_status").on(t.tenantId, t.status, t.eventTime),
  ],
);

export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    id: id(),
    tenantId: tenantId(),
    date: date().notNull(),
    campaignId: text().notNull(),
    campaignName: text(),
    adsetId: text().notNull(),
    adsetName: text(),
    adId: text().notNull(),
    adName: text(),
    spend: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    currency: text().notNull(),
    impressions: integer().notNull().default(0),
    clicks: integer().notNull().default(0),
    leads: integer().notNull().default(0),
  },
  (t) => [unique().on(t.tenantId, t.date, t.adId), index("ad_insights_tenant_campaign").on(t.tenantId, t.campaignId, t.date)],
);

export const adAnalyses = pgTable(
  "ad_analyses",
  {
    id: id(),
    tenantId: tenantId(),
    periodStart: date().notNull(),
    body: text().notNull(),
    status: text({ enum: ["draft", "approved"] }).notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.tenantId, t.periodStart)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    tenantId: tenantId(),
    task: text().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull(),
    outputTokens: integer().notNull(),
    costUsd: numeric({ precision: 12, scale: 6 }).notNull(),
    at: createdAt(),
  },
  (t) => [index("ai_usage_tenant_at").on(t.tenantId, t.at)],
);

// Records which columns changed, not their values, so it never holds personal
// data or secrets and survives an erasure request.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    tenantId: tenantId(),
    actor: text().notNull(),
    action: text().notNull(),
    tableName: text().notNull(),
    rowId: text().notNull(),
    changedColumns: jsonb().$type<string[]>(),
    at: createdAt(),
  },
  (t) => [index("audit_log_tenant_at").on(t.tenantId, t.at)],
);

// Saved before the tenant is known. Deleted after 30 days.
export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: id(),
    source: text({ enum: ["meta", "telegram", "landing_page"] }).notNull(),
    externalId: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    clientKey: text(),
    receivedAt: createdAt(),
    processedAt: at(),
    error: text(),
  },
  (t) => [
    unique().on(t.source, t.externalId),
    index("webhook_inbox_rate").on(t.source, t.clientKey, t.receivedAt),
    index("webhook_inbox_received").on(t.receivedAt),
  ],
);

// Global AI config, editable without code. `apiKeyEnv` names the environment
// variable holding the key, so keys never sit in the database.
export const aiModels = pgTable("ai_models", {
  id: id(),
  provider: text().notNull(),
  baseUrl: text().notNull(),
  apiKeyEnv: text(),
  model: text().notNull(),
  priceIn: numeric({ precision: 10, scale: 4 }).notNull().default("0"),
  priceOut: numeric({ precision: 10, scale: 4 }).notNull().default("0"),
  noTraining: boolean().notNull().default(false),
  reasoningEffort: text(),
  tasks: jsonb().$type<string[]>().notNull().default([]),
  active: boolean().notNull().default(true),
});
