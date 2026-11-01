CREATE SCHEMA "ops";
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"external_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_analyses_tenantId_periodStart_unique" UNIQUE("tenant_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "ad_insights_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"adset_id" text NOT NULL,
	"adset_name" text,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ad_insights_daily_tenantId_date_adId_unique" UNIQUE("tenant_id","date","ad_id")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_env" text,
	"model" text NOT NULL,
	"price_in" numeric(10, 4) DEFAULT '0' NOT NULL,
	"price_out" numeric(10, 4) DEFAULT '0' NOT NULL,
	"no_training" boolean DEFAULT false NOT NULL,
	"reasoning_effort" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"changed_columns" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"exit_stage_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "automation_rules_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_ruleId_leadId_unique" UNIQUE("rule_id","lead_id")
);
--> statement-breakpoint
CREATE TABLE "capi_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"shape" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"event_time" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "capi_events_tenantId_eventId_unique" UNIQUE("tenant_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"secret_encrypted" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"test_event_code" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_kind_externalId_unique" UNIQUE("kind","external_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text,
	"phone_e164" text,
	"phone_raw" text,
	"phone_invalid" boolean DEFAULT false NOT NULL,
	"email" text,
	"consent_source" text,
	"consent_text" text,
	"consent_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "custom_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "custom_field_defs_tenantId_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"delivered_to_member_id" uuid,
	"delivered_at" timestamp with time zone,
	"delivery_failed_at" timestamp with time zone,
	"agent_response_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"score" integer,
	"temperature" text,
	"score_reason" text,
	"summary" text,
	"next_step" text,
	"assigned_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"reassign_count" integer DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"value" numeric(14, 2),
	"value_currency" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"record_scope" text DEFAULT 'all' NOT NULL,
	"telegram_user_id" text,
	"telegram_chat_id" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"working_hours" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipelines_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"member_ids" jsonb NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sla_minutes" integer DEFAULT 15 NOT NULL,
	"escalate_to_member_id" uuid,
	"max_reassigns" integer DEFAULT 2 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid,
	"name" text NOT NULL,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	"capi_enabled" boolean DEFAULT true NOT NULL,
	"capi_event_name" text,
	"agent_button" boolean DEFAULT false NOT NULL,
	"sla_minutes" integer,
	CONSTRAINT "stages_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "stages_pipelineId_position_unique" UNIQUE("pipeline_id","position")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"assignee_member_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_directory" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT 'uae' NOT NULL,
	"country" text DEFAULT 'AE' NOT NULL,
	"timezone" text DEFAULT 'Asia/Dubai' NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"brand" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_monthly_budget_usd" numeric(10, 2) DEFAULT '5' NOT NULL,
	"retention_days" integer DEFAULT 730 NOT NULL,
	"intake_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_team_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"source" text NOT NULL,
	"meta_leadgen_id" text,
	"page_id" text,
	"form_id" text,
	"ad_id" text,
	"adset_id" text,
	"campaign_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"fbclid" text,
	"fbc" text,
	"fbp" text,
	"pixel_event_id" text,
	"event_source_url" text,
	"client_ip" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"client_key" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "webhook_inbox_source_externalId_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "ops"."worker_heartbeat" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"beat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_heartbeat_single_row" CHECK ("ops"."worker_heartbeat"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_analyses" ADD CONSTRAINT "ad_analyses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_rule_id_automation_rules_tenant_id_id_fk" FOREIGN KEY ("tenant_id","rule_id") REFERENCES "public"."automation_rules"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_events" ADD CONSTRAINT "capi_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_events" ADD CONSTRAINT "capi_events_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_defs" ADD CONSTRAINT "custom_field_defs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_contact_id_contacts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contact_id") REFERENCES "public"."contacts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_pipeline_id_pipelines_tenant_id_id_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_stage_id_stages_tenant_id_id_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_owner_member_id_members_tenant_id_id_fk" FOREIGN KEY ("tenant_id","owner_member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_delivered_to_member_id_members_tenant_id_id_fk" FOREIGN KEY ("tenant_id","delivered_to_member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_tenant_id_escalate_to_member_id_members_tenant_id_id_fk" FOREIGN KEY ("tenant_id","escalate_to_member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_member_id_members_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_tenant_id_stage_id_stages_tenant_id_id_fk" FOREIGN KEY ("tenant_id","stage_id") REFERENCES "public"."stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_tenant_id_pipeline_id_pipelines_tenant_id_id_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."pipelines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_assignee_member_id_members_tenant_id_id_fk" FOREIGN KEY ("tenant_id","assignee_member_id") REFERENCES "public"."members"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_directory" ADD CONSTRAINT "tenant_directory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touches" ADD CONSTRAINT "touches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touches" ADD CONSTRAINT "touches_tenant_id_lead_id_leads_tenant_id_id_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."leads"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_external" ON "activities" USING btree ("tenant_id","external_id") WHERE "activities"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "activities_tenant_lead" ON "activities" USING btree ("tenant_id","lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ad_insights_tenant_campaign" ON "ad_insights_daily" USING btree ("tenant_id","campaign_id","date");--> statement-breakpoint
CREATE INDEX "ai_usage_tenant_at" ON "ai_usage" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "automation_rules_tenant" ON "automation_rules" USING btree ("tenant_id","trigger");--> statement-breakpoint
CREATE INDEX "capi_events_tenant_status" ON "capi_events" USING btree ("tenant_id","status","event_time");--> statement-breakpoint
CREATE INDEX "connections_tenant" ON "connections" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_tenant_phone" ON "contacts" USING btree ("tenant_id","phone_e164") WHERE "contacts"."phone_e164" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_tenant_email" ON "contacts" USING btree ("tenant_id","email") WHERE "contacts"."email" is not null;--> statement-breakpoint
CREATE INDEX "leads_tenant_stage" ON "leads" USING btree ("tenant_id","stage_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_owner" ON "leads" USING btree ("tenant_id","owner_member_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_contact" ON "leads" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "leads_tenant_created" ON "leads" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_custom" ON "leads" USING gin ("custom");--> statement-breakpoint
CREATE UNIQUE INDEX "members_tenant_user" ON "members" USING btree ("tenant_id","user_id") WHERE "members"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "members_user" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "routing_rules_tenant" ON "routing_rules" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX "saved_views_tenant" ON "saved_views" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "stage_history_tenant_lead" ON "stage_history" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "stage_history_tenant_stage" ON "stage_history" USING btree ("tenant_id","stage_id","entered_at");--> statement-breakpoint
CREATE INDEX "tasks_tenant_due" ON "tasks" USING btree ("tenant_id","assignee_member_id","due_at") WHERE "tasks"."done_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "touches_leadgen" ON "touches" USING btree ("tenant_id","meta_leadgen_id") WHERE "touches"."meta_leadgen_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "touches_pixel_event" ON "touches" USING btree ("tenant_id","pixel_event_id") WHERE "touches"."pixel_event_id" is not null;--> statement-breakpoint
CREATE INDEX "touches_tenant_lead" ON "touches" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "touches_tenant_campaign" ON "touches" USING btree ("tenant_id","campaign_id");--> statement-breakpoint
CREATE INDEX "webhook_inbox_rate" ON "webhook_inbox" USING btree ("source","client_key","received_at");--> statement-breakpoint
CREATE INDEX "webhook_inbox_received" ON "webhook_inbox" USING btree ("received_at");