# CRM Architecture Research: How Major CRMs Are Built

**For:** 7Gence, a multi-tenant, white-label lead CRM for an ad agency. First use case: Meta lead packages for UAE real estate companies.
**Date:** 2026-10-25
**Status:** Research only. No application code.

## How to read this

- Every vendor fact has its source URL inline. Sources are official docs unless marked **(third-party)**.
- **[GUESS]** means not verified from a source in this research. Treat it as an assumption.
- "Not researched" means the area was not covered. It is not a claim that the feature is missing.
- Outdated or conflicting sources are flagged inline with **(dated)** or **(conflict)**.
- Freshsales was in scope as an optional addition but was **skipped**: nothing about it was researched.

---

## 1. Executive summary

1. **GoHighLevel (GHL) is the only CRM studied with a native agency → sub-account → resell model.** The other "multi-unit" features (HubSpot Brands, Dataverse business units, Pipedrive visibility groups, Salesforce OrgID) are partitioning or isolation inside one customer, not reselling to clients. GHL is the closest reference for our business model.
2. **GHL controls access on three separate axes:** which sub-accounts a user can enter, what they can do (module and granular permissions), and which records they see ("Only Assigned Data"). It adds agency-level "Login As" and sub-account transfer. This is a good blueprint for our tenancy and RBAC.
3. **Meta's Conversion Leads (CAPI for CRM) has strict rules**, so the Meta `leadgen_id` must be a first-class column. Requirements: send every stage, `action_source=system_generated`, `custom_data.event_source=crm`, `event_time` no more than 7 days old, and the optimized stage reached within 28 days of the lead.
4. **No CRM makes "reassign if no response" a first-class rule.** It is built from workflow pieces (wait, check for a reply, reassign) or bolted on by an external SLA timer. We should make it first-class.
5. **Close has the best webhook design to copy:** HMAC-signed payloads, retries for 72h, auto-pause, and a 30-day event log for replay.

---

## 2. Per-CRM findings

### 2.1 GoHighLevel (HighLevel / LeadConnector)

**Data model**
- The standard objects are Contacts and Opportunities. Opportunities live in pipelines with stages. Triggers include "Opportunity Created", "Pipeline Stage Changed", "Opportunity Status Changed" and "Stale Opportunities" ([trigger list, modified 19 Jun 2026](https://help.gohighlevel.com/support/solutions/articles/155000002292-a-list-of-workflow-triggers)).
- **Custom objects:** available on all plans, up to 10 per location (sub-account). Each object allows up to 10 unique fields, and unique fields can be Single Line, Multi Line, Number or Phone. Uniqueness is enforced across the UI, workflows, forms and the API. Associations can be one-to-many or many-to-many, and work with contacts and opportunities. Only location admins can create objects, and deleting an object is permanent and cascades ([Custom Objects, updated 4 Mar 2026](https://help.gohighlevel.com/en/support/solutions/articles/155000003897-creating-and-editing-custom-objects)). Pre-built object templates exist, and HighLevel's own example is a real-estate "Property" object ([templates](https://help.gohighlevel.com/support/solutions/articles/155000007819-custom-object-templates-pre-built-crm-setup-in-one-click)).
- **Attribution fields on the contact:** both "first" and "latest" attribution are stored on every contact. First never changes and latest updates on each tracked interaction. Captured fields include `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `campaign_id`, `gclid`, `wbraid`, `gbraid`, `msclkid` and `ctwa_clid` (Click-to-WhatsApp). **`fbclid` is not listed.** Source classification follows a priority order, for example `utm_source=fb_ad` or `ctwa_clid` counts as Paid Social ([Attribution, modified 26 Aug 2026](https://help.gohighlevel.com/support/solutions/articles/48001219997-understanding-attribution-source)).

**Multi-tenancy and sub-accounts**
- There is one agency account and many sub-accounts, usually one per client. Each sub-account has its own contacts, pipelines and automations, and sub-accounts are isolated from each other ([supplygem, third-party](https://supplygem.com/gohighlevel-agency-sub-account/)). The API calls a sub-account a "location" ([developer docs](https://marketplace.gohighlevel.com/docs/)).
- **SaaS mode:** an agency can attach a SaaS plan to an existing sub-account. The flow is: "Switch to SaaS", pick a plan from the SaaS Configurator, then link or create a Stripe customer. Once a plan is assigned, the sub-account keeps only the features in that plan tier. The plan shows rebilling rates, add-ons, marketplace apps and custom menu links. With no payment method, the plan stays "On Hold" until the client pays ([Attach SaaS plan, modified 18 Sep 2026](https://help.gohighlevel.com/support/solutions/articles/48001188055-attach-saas-mode-subscription-plan-to-an-existing-client-sub-account)). Third-party sources say usage such as SMS, email, phone and AI is rebilled with a markup set by the agency, and that SaaS mode needs the Pro tier ([supplygem, third-party](https://supplygem.com/gohighlevel-saas/); [setsmart, third-party](https://setsmart.io/blog/gohighlevel-white-label)). **(conflict)** Sources disagree on which plan includes SaaS mode and white-labeling, and the official SaaS setup article returned 404.
- **Snapshots:** snapshots are templates of a sub-account's assets that can be pushed to other sub-accounts. They do not carry contacts, conversations, phone numbers, A2P registration, integrations, domains, users or billing. A push can overwrite or duplicate assets the client has customized ([ecosire, third-party](https://ecosire.com/blog/gohighlevel-snapshots-guide)). Not verified against official docs.
- **Sub-account transfer and Login As:** an Agency Owner can transfer a whole sub-account to another agency. An Agency Admin can "Login As" another user, which is on by default and can be turned off ([Agency roles, modified 6 Oct 2026](https://help.gohighlevel.com/support/solutions/articles/155000002543-manage-agency-user-roles-and-permissions-in-highlevel)).

**Automation and workflows**
- **Triggers:** contact events, Inbound Webhook, Customer Replied, Form Submitted, **Facebook Lead Form Submitted**, TikTok, LinkedIn and Google lead forms, Click To WhatsApp Ads, External Tracking Event, appointment events, opportunity and pipeline events, Stale Opportunities ([triggers](https://help.gohighlevel.com/support/solutions/articles/155000002292-a-list-of-workflow-triggers)).
- **Actions:** create and update contacts, tags, Assign/Unassign User, tasks and notes. Communication actions cover email, SMS, WhatsApp, Messenger, Instagram DM, calls and Conversation AI. Data actions are Webhook, Custom Webhook and Google Sheets. Control actions are Wait, If/Else, Goal Event, Split (A/B), Drip Mode, Go To, Arrays and Custom Code. There are also opportunity actions, an AI Prompt action, and **Facebook Conversion API** and Facebook custom audience actions ([actions list, modified 3 Jun 2026](https://help.gohighlevel.com/support/solutions/articles/155000002294)).
- If/Else always has an automatic "None" (else) branch. HighLevel recommends a Wait before an If/Else so the contact has time to act ([If/Else](https://help.gohighlevel.com/en/support/solutions/articles/155000002471)). A Goal Event can skip steps or end the workflow once a goal is reached ([Goal Event](https://help.gohighlevel.com/support/solutions/articles/155000003328)).
- **Round robin:** the Assign User action has an "only apply to unassigned contacts" toggle ([Assign User article, seen in search snippet; fetch returned 404](https://help.gohighlevel.com/support/solutions/articles/155000003267-workflow-action-assign-user)). Splitting traffic "equally" or "unevenly" (weighted) is described only by third-party sources ([growthable, third-party](https://growthable.io/gohighlevel-tutorials/workflows/how-to-automatically-assign-users-to-leads-in-workflows-within-gohighlevel/); [helpscout clone, third-party](https://mastermind.helpscoutdocs.com/article/578-workflow-action-assign-to-user)). Round-robin calendars book with the contact's assigned user if they have one, otherwise by round robin ([RR calendars](https://help.gohighlevel.com/support/solutions/articles/155000002711)).
- **Meta CAPI pattern:** the documented setup uses two workflows. Workflow 1 is "FB lead form submitted" followed by create/update opportunity. Workflow 2 is "pipeline stage changed" followed by the Facebook Conversion API action with event type Lead. It authenticates with an access token from Events Manager plus the dataset (pixel) ID. Non-lead-ad events need the click ID captured into a custom field ([helpscout clone of GHL docs, third-party](https://mastermind.helpscoutdocs.com/article/600-workflow-action-facebook-conversion-api); [growthable, third-party](https://growthable.io/gohighlevel-tutorials/integration-widget/facebook-conversion-leads-walkthrough-in-gohighlevel/)).

**Integrations and webhooks**
- Auth is either OAuth 2.0 (Marketplace apps) or a Private Integration Token, the latter "if you need to access only 1 sub-account at a time" ([Authorization](https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc)). The docs list API versions v3 (current), 2023-02-21, 2021-07-28 and 2021-04-15 ([docs home](https://marketplace.gohighlevel.com/docs/)).
- **Webhook events** include ContactCreate/Update/Delete/DndUpdate/TagUpdate, InboundMessage/OutboundMessage, OpportunityCreate/StageUpdate/StatusUpdate/AssignedToUpdate/MonetaryValueUpdate, RecordCreate/Update/Delete for custom objects, AssociationCreate, LocationCreate, AppInstall/Uninstall, SaaSPlanCreate and VoiceAiCallEnd ([webhook list](https://marketplace.gohighlevel.com/docs/category/webhook)). Signature verification is not described on that page.
- Ad Manager centralizes Facebook, Instagram, Google and LinkedIn ads for agencies and sub-accounts ([Ad Manager, dated Oct 2025](https://help.gohighlevel.com/support/solutions/articles/155000002433-overview-of-ad-manager)).

**Roles and permissions**
- **User Type** (Agency or Account) sets the scope, and **Role** (Admin or User) sets the level within it. Account-type users see only the sub-accounts assigned to them. Module and granular permissions control actions. **"Only Assigned Data"** limits a user to their own contacts, opportunities and related tasks and appointments. Permissions can be copied from one user to another, but not in bulk ([sub-account roles, modified 6 Oct 2026](https://help.gohighlevel.com/support/solutions/articles/155000002544-sub-account-user-roles-permissions-and-assigned-data); [agency roles](https://help.gohighlevel.com/support/solutions/articles/155000002543-manage-agency-user-roles-and-permissions-in-highlevel)).

**Reporting**
- Dashboards have custom object widgets ([Dashboards](https://help.gohighlevel.com/support/solutions/articles/155000006630)). Third-party sources describe a Facebook Ads report broken down by campaign, ad set, ad and demographics ([growthable, third-party, dated Jan 2023](https://growthable.io/gohighlevel-tutorials/reporting/facebook-ads-reporting-for-gohighlevel/)). They also describe Meta spend widgets that can be combined with won-opportunity value to estimate ROAS ([ghlexperts, third-party](https://ghlexperts.com/features/ghl-dashboard)). Whether HighLevel reports cost per *qualified* lead per campaign out of the box was not verified [GUESS: no].

**AI**
- An AI Prompt workflow action exists, described as "GPT-3 powered" (likely stale wording). So do Conversation AI, Eliza appointment booking and Voice AI (there is a `VoiceAiCallEnd` webhook) ([actions](https://help.gohighlevel.com/support/solutions/articles/155000002294); [webhooks](https://marketplace.gohighlevel.com/docs/category/webhook)). Third-party sources describe an "AI Employee" bundle: Voice, Conversation, Reviews, Content, Funnel and Workflow AI, at about $97/month per sub-account ([ecosire, third-party](https://ecosire.com/blog/gohighlevel-ai-employee-guide)). Pricing is not verified.

---

### 2.2 Salesforce (Sales Cloud)

**Data model**
- Lead conversion maps standard lead fields to Account, Contact and Opportunity. Admins map custom fields. When merging into existing records, only empty fields are filled, except `LeadSource` when `overwriteLeadSource=true` ([convertLead API](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_convertlead.htm)).
- **Limits:** older docs list 500 custom fields per object on Enterprise and 800 on Unlimited ([Certinia doc citing SF, third-party](https://help.certinia.com/main/2020.2/Subsystems/ACC/Content/Setup/SystemAdmin/aSetupBudgetsPage.htm); [SF limits PDF v208, dated](https://resources.docs.salesforce.com/208/latest/en-us/sfdc/pdf/salesforce_app_limits_cheatsheet.pdf)). **(dated)** These PDFs are API v200–210, and the per-edition column mapping was inferred from garbled text.

**Multi-tenancy (platform architecture)**
- All tenants (orgs) share one database and schema, and every row carries an **OrgID**, with physical partitioning by OrgID. The design is **metadata-driven**: creating an object or field writes metadata (MT_Objects, MT_Fields) instead of DDL. Data lives in a generic **MT_Data** table with flex string columns (Value0…ValueN). Typed pivot tables (MT_Indexes, MT_Unique_Indexes, MT_Relationships, MT_Clob) handle indexing, uniqueness and joins. **Governor limits** cap CPU, memory, queries and callouts per execution ([Salesforce Architects, no date](https://architect.salesforce.com/fundamentals/platform-multitenant-architecture)).
- Salesforce has no built-in "agency resells sub-orgs" model [GUESS].

**Automation**
- Lead assignment rules have ordered entries (criteria → user or queue). Only one rule can be active at a time ([default.com, third-party](https://www.default.com/post/salesforce-lead-assignment-rules); [Calendly blog, third-party](https://calendly.com/blog/salesforce-lead-assignment-rules)). Not verified against official help.
- Record-triggered flows have **scheduled paths**, which run steps relative to a date field ([SF dev blog, Spring '21, dated](https://developer.salesforce.com/blogs/2021/03/schedule-your-path-in-salesforce-flow); [Trailhead](https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/add-a-scheduled-task-to-your-flow)). The Wait elements are amount of time, until date, and for conditions ([SalesforceBen, third-party](https://www.salesforceben.com/how-do-salesforce-flow-wait-elements-work-use-cases-examples-and-best-practices/)).

**Integrations**
- **Change Data Capture** can be consumed through the Pub/Sub API (gRPC/Avro), CometD or Apex. Events are delivered in commit order ([CDC guide v244](https://developer.salesforce.com/docs/atlas.en-us.244.0.change_data_capture.meta/change_data_capture/cdc_subscribe.htm)). Platform Events are for custom pub/sub ([SF dev blog](https://developer.salesforce.com/blogs/2022/10/design-considerations-for-change-data-capture-and-platform-events)). Outbound Messages are SOAP, at-least-once, and retried for up to 24h ([Hookdeck, third-party](https://hookdeck.com/webhooks/platforms/guide-to-salesforce-webhooks-features-and-best-practices)).

**Roles and permissions**
- Access is layered. Profiles and permission sets control object and field access. Org-wide defaults set the baseline record access. The role hierarchy opens records upward. Sharing rules and manual sharing extend access from there. Changing org-wide defaults triggers a sharing recalculation ([Sharing cheatsheet](https://developer.salesforce.com/docs/atlas.en-us.salesforce_sharing_cheatsheet.meta/salesforce_sharing_cheatsheet/sharing_cheatsheet.htm); [Guide to Sharing Architecture](https://developer.salesforce.com/page/A_Guide_to_Sharing_Architecture)).

**Reporting:** Not researched.

**AI**
- Agentforce engages low-intent leads around the clock, handles objections from company data, and books meetings ([Salesforce AU blog](https://www.salesforce.com/au/blog/agentforce-for-sales-customer-zero/)). "Agentforce SDR" was renamed "Agentforce Lead Nurturing", and pricing has changed 3 times since Sept 2024 ([knock-ai, third-party/competitor](https://www.knock-ai.com/blog/agentforce-sdr-alternative); [salesrobot, third-party](https://www.salesrobot.co/blogs/agentforce-review)). **(dated/volatile)**

---

### 2.3 HubSpot

**Data model**
- Standard objects have fixed type IDs: contacts `0-1`, companies `0-2`, deals `0-3`, tickets `0-5` and leads `0-136`. Custom objects use `2-XXX` and are created through the schemas API. Records have properties. **Associations** link records and carry **association labels**, for example "decision maker". Pipelines exist for deals and tickets. Endpoint paths use date versions such as `2026-09` ([Understanding the CRM](https://developers.hubspot.com/docs/guides/crm/understanding-the-crm)).

**Multi-tenancy**
- There is no agency/sub-account resale model [GUESS]. The **Brands** add-on (formerly "Business Units") lets one Marketing Hub Enterprise account run up to 100 brands. Each brand can have its own domain, and only Super Admins manage brands ([Brands KB, updated Apr 2026](https://knowledge.hubspot.com/branding/manage-your-brands-with-hubspot-brands?authuser=0)). **(dated)** Older posts say the database, pipelines and workflows are shared across units ([grazitti, third-party, dated](https://www.grazitti.com/resource/articles/scale-your-multi-brand-business-with-hubspots-business-units/)).

**Automation**
- **"Rotate record to owner"** assigns records to paid seats, either specific users or a team, with an option to overwrite an existing owner. The default distribution is even. Changing the owner list resets the counts. For tickets and leads (beta) it also supports load balanced, round robin and random ([Rotate owners KB](https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows)).

**Integrations and webhooks**
- **Lead ads sync:** Facebook, LinkedIn and Google lead ads sync in as **form submissions**, and HubSpot auto-creates a form for them. New leads can take **up to two hours** to sync. Leads from the last 90 days are backfilled. Custom lead-ad fields become text properties ([Lead sync KB](https://knowledge.hubspot.com/ads/sync-leads-from-your-facebook-page-or-linkedin-ads-account-to-hubspot); [FAQ](https://knowledge.hubspot.com/ads/facebook-lead-ads-faq)). **That is slow for speed-to-lead.**
- **Meta CAPI:** HubSpot can sync lifecycle-stage changes and HubSpot-form submissions as Meta conversion events, sending both browser and server events for deduplication. Limits are 5 events on Starter and 50 on Pro, and the ad account must be in a Business Manager ([CAPI KB, updated 7 Oct 2026](https://knowledge.hubspot.com/ads/create-and-sync-ad-conversion-events-with-your-meta-ads-accounts-using-metas-conversion-api)). Deal-stage events are reportedly not covered ([CustomerLabs, third-party](https://www.customerlabs.com/blog/how-to-send-offline-lead-to-deal-events-from-hubspot-via-meta-conversion-api/)).
- **Webhooks:** v3 signatures are HMAC-SHA256 over method, URI, body and timestamp ([Hookdeck, third-party](https://hookdeck.com/webhooks/platforms/guide-to-hubspot-webhooks-features-and-best-practices)). Retry counts (10 over 24h) are **unverified**. Official v1 validation doc: [validating requests](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests.md).

**Roles and permissions**
- Permissions scope records as Everything / Team only / Owned only (newer labels: "All records / Records their team owns / Records they own"), with an optional "Unassigned" checkbox. Parent teams see records owned by child teams ([Permissions guide](https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide?authuser=0); [Teams](https://knowledge.hubspot.com/user-management/create-and-manage-teams?issue=64)).

**Reporting**
- Attribution reports come as Contact Create (top of funnel), Deal Create (middle, Enterprise only) and Revenue (bottom) ([Attribution reports KB, Aug 2026](https://knowledge.hubspot.com/reports/create-attribution-reports?pass=1)).

**AI**
- **Breeze** agents include Prospecting, Customer and Knowledge Base ([Breeze KB](https://knowledge.hubspot.com/ai/use-breeze?iframe=yes); [HubSpot Spotlight](https://www.hubspot.com/company-news/spring-2025-spotlight-breeze-agents?tag=ibm)). **(conflict)** Sources disagree on billing: credits vs outcome-based.

---

### 2.4 Microsoft Dynamics 365 Sales (on Dataverse)

**Data model**
- Qualifying a lead creates Account, Contact and Opportunity. Admins can instead make the user choose which records to create. Field mappings carry values over. The API call is the `QualifyLead` action ([Qualify lead](https://learn.microsoft.com/en-ca/dynamics365/sales/qualify-lead-convert-opportunity-sales); [QualifyLeadRequest](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.qualifyleadrequest)). Custom tables in Dataverse: not researched.

**Multi-tenancy and security**
- **Business units** are security boundaries. Each user belongs to exactly one, and each record has an owning business unit. **Owner teams** can own records and hold roles. **Access teams** grant access by sharing and hold no roles. Privileges add up across a user's roles. "Modernized business units" allow a user to own records across units ([Dataverse security](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds); [Access/owner teams](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-access-teams-owner-teams-collaborate-share-information)).

**Automation and routing**
- Assignment rules support **round robin** (based on who was assigned last) and **load balancing** (based on each seller's open records), with round robin as a tiebreaker. An option limits assignment to sellers **available within N hours (1–120)** according to their work schedule, and leaves the record unassigned if nobody qualifies ([Record distribution](https://learn.microsoft.com/en-ca/dynamics365/sales/understand-lead-distributions-assignment-rules)). Power Automate details: not researched.

**Integrations**
- Webhooks are registered with the Plug-in Registration tool. They run on port 80/443 only. Auth is HttpHeader, WebhookKey or HttpQueryString. A header flags payloads over 256 KB ([Register webhook](https://learn.microsoft.com/en-gb/power-apps/developer/data-platform/register-web-hook)).

**Reporting:** Not researched.

**AI**
- The **Sales Qualification Agent** researches leads using CRM, web and custom sources, scores them against your criteria, drafts and sends emails, follows up with non-responders, and hands off on detected intent. Admins choose how much autonomy it gets, from research-only to full engagement ([Configure agent](https://learn.microsoft.com/en-us/dynamics365/sales/configure-sales-qualification-agent); [Message Center MC1159615](https://mc.merill.net/message/MC1159615)).

---

### 2.5 Zoho CRM

**Data model**
- The model is modules: Leads, Contacts, Deals and custom modules. Custom fields per module range from 10 (free) to 500 (top tier) ([edition comparison PDF](https://zoho.com/sites/default/files/crm/zohocrm-edition-comparison-usd.pdf)).

**Multi-tenancy:** Not researched.

**Automation**
- **Workflow rules** fire on create, edit or delete. Actions are email, task, field update, webhook and custom function, plus "instant actions" that notify Cliq, Slack or Webex ([Workflow rules](https://help.zoho.com/portal/kb/articles/configuring-workflow-rules); [Actions](https://help.zoho.com/portal/en/kb/crm-v2-1/automate-business-processes/actions/articles/crm-v2-creating-actions-in-workflow-rules)). **Blueprint** runs actions on stage transitions ([community, Blueprint](https://help.zoho.com/portal/en-gb/community/topic/automating-repetitive-sales-processes-with-blueprint-powered-by-zoho-crm?page=1)).
- **Assignment rules work only for records from import, webform or API, not records created manually.** They cover leads, contacts, deals and custom modules, with up to 25 criteria per entry ([Assignment rules](https://help.zoho.com/portal/en/kb/crm-nextgen/automate-business-processes/assignment-rules/articles/nextgen-set-assignment-rules)). Zoho's own round-robin "solution" uses a Deluge function plus an org variable ([Zoho solution](https://www.zoho.com/crm/resources/solutions/assign-leads-in-round-robin-fashion.html)).

**Integrations**
- Zoho **LeadChain** syncs Leads, Contacts or Deals to the Facebook Conversions API for offline conversions ([LeadChain CAPI](https://help.zoho.com/portal/en/kb/zoho-lead-chain/creating-chains/facebook/articles/connecting-zoho-crm-and-facebook-conversions-api)).

**Roles and permissions**
- Roles control which records a user sees, and profiles control what they can do. Peers in the same role don't see each other's data by default ("Share Data with Peers" turns this on). The Administrator profile sees everything ([Roles](https://help.zoho.com/portal/kb/articles/role-management-introduction); [Security overview](https://www.zoho.com/crm/help/security/)).

**Reporting:** Not researched.

**AI**
- **Zia Score** is an AI score from 0 to 100 (percentile), stored in a field and usable in workflows and Blueprint ([Zia Scores, community, Feb 2023, dated](https://help.zoho.com/portal/ar/community/topic/introducing-zia-scoring-28-2-2023?page=8)).

---

### 2.6 Pipedrive

**Data model**
- **Leads live in a separate Leads Inbox**, as pre-qualified "potential deals". A lead must link to a person or organization and shares custom fields with deals. **A lead can only become a deal in the web app, not via the API.** A deal must link to a contact and moves through pipeline stages until won or lost. Custom fields have random **40-character hash keys** that can't be renamed ([About API](https://pipedrive.readme.io/docs/core-api-concepts-about-pipedrive-api); [Custom fields](https://pipedrive.readme.io/docs/core-api-concepts-custom-fields)).

**Multi-tenancy:** Not researched (no sub-account model found [GUESS]).

**Automation**
- An automation is a trigger, then a condition, action or delay. Delays can be up to 90 days (raised from 30). Conditions can check email replies, but email opens are not tracked ([Delay KB](https://support.pipedrive.com/en/article/workflow-automations-delay-feature); [Email conditions KB](https://support.pipedrive.com/en/article/automations-email-conditions); [Automations blog](https://www.pipedrive.com/en/blog/automations-product-update)). Time-based "no activity" triggers are hard to build ([community](https://community.pipedrive.com/discussion/9374/automation-with-no-activity-trigger)). **(conflict)** Sources disagree on plan names ("Growth" vs "Advanced").

**Integrations and webhooks**
- Webhooks v2 is the default. Events combine `event_action` and `event_object`, and wildcards are allowed. The payload's "previous" block holds only changed fields. Limit: 40 webhooks per user ([Webhooks v2](https://pipedrive.readme.io/docs/guide-for-webhooks-v2); [changelog, Apr 2026](https://developers.pipedrive.com/changelog/post/introducing-support-for-projects-in-webhooks-v2)). Security is **HTTP Basic auth with no signatures**, with up to 4 attempts ([Hookdeck, third-party, unverified](https://hookdeck.com/webhooks/platforms/guide-to-pipedrive-webhooks-features-and-best-practices.md)).
- Facebook Lead Ads come in through a Marketplace app built by Outfunnel ([Marketplace](https://www.pipedrive.com/en/marketplace/app/facebook-lead-ads-sync/f7d03043685585ef)) or Zapier ([Pipedrive blog](https://www.pipedrive.com/en/blog/pipedrive-zapier-leads)).

**Roles and permissions**
- **Visibility groups** control what a user can *see*, and **permission sets** control what they can *do*. Pipelines can be hidden per group. Visibility rules also apply to Insights reports ([Visibility & permissions, May 2026](https://support.pipedrive.com/en/article/visibility-and-permissions-overview); [Visibility groups](https://support.pipedrive.com/en/article/visibility-groups)).

**Reporting:** Insights respects visibility (above); otherwise not researched. **AI:** Not researched.

---

### 2.7 Close

**Data model**
- **A Lead is the company or organization** (it plays both "lead" and "account"). Contacts, opportunities, tasks and activities must belong to a Lead. Custom fields are returned as `custom.FIELD_ID`. "Smart Fields" are computed values ([Leads API](https://developer.close.com/api/resources/leads.md)). **Custom Object Types** have their own fields, and instances live on Leads ([Custom objects](https://developer.close.com/api/resources/custom-objects.md)).

**Multi-tenancy:** Not researched.

**Automation**
- Sequences were renamed **Workflows** and can trigger automatically from Lead and Contact filters. A trigger fires only when a lead *newly* matches, and only the primary contact is enrolled ([changelog](https://close.com/changelog/automated-triggers); [Sequences API](https://developer.close.com/api/resources/sequences/create)).

**Integrations and webhooks (best practice reference)**
- Each delivery carries `close-sig-hash` (HMAC-SHA256 over timestamp + payload, keyed by the subscription's `signature_key`) and `close-sig-timestamp`, and docs say to compare in constant time. Retries back off exponentially, capped at one every 20 min, for up to **72h**. Order is not guaranteed. A subscription **auto-pauses** at a 100k backlog or after 3 days of failures, and admins get emails. A **30-day Event Log API** allows replay ([Webhooks](https://developer.close.com/api/resources/webhooks.md)). Auth is an API key or OAuth 2.0 ([dev home](https://developer.close.com/)).

**Roles and permissions**
- Each user has exactly one role. There are four predefined roles (Admin is system-maintained). Custom roles are on the Scale plan. Editing of specific custom fields can be restricted by role ([Roles help](https://help.close.com/docs/roles-permissions); [Roles API](https://developer.close.com/api/resources/roles)). **(dated)** An older help page names the "Business" plan ([old help](https://close.helpscoutdocs.com/article/348-roles-permissions)).

**Reporting / AI:** Not researched.

---

### 2.8 Brief additions

**Kommo (amoCRM).** Kommo is messaging-first.
- Entities are contacts, companies and leads (deals). A lead has one company, many contacts, a responsible user and a stage. Limits are 10 pipelines per account and 100 stages per pipeline. The system stages are **Incoming Leads**, Won and Lost ([Subject area](https://developers.kommo.com/docs/subject-area)).
- Leads from email, telephony, forms and chat land **unprocessed in Incoming Leads**. A user accepts or rejects each one, and accepting creates the contact and company. **The source decides the target pipeline.** Each pipeline has its own sources ([Subject area](https://developers.kommo.com/docs/subject-area); [Incoming leads](https://www.kommo.com/support/crm/incoming-leads/)).
- WhatsApp inbound goes straight into the pipeline ([WhatsApp integration](https://www.amocrm.com/integrations/whatsapp/?logout=yes)). Salesbot can be embedded in pipeline stages ([pipeline page](https://www.kommo.com/crm-pipeline/)).

**Attio.** Attio has objects (people and companies by default; deal, user and workspace optional; plus custom), records, attributes, and **lists**. A list is a process view whose entries point to records and which has its own attributes. Relationship attributes can be bidirectional ([Data model](https://developers.attio.com/docs/data-model); [Objects and lists](https://docs.attio.com/docs/objects-and-lists)). Useful idea: a pipeline is a list over records, not a property of the record.

**UAE portals: Property Finder, Bayut, Dubizzle.**
- No official portal API docs were found publicly. A third-party Bitrix24 app, **PropBridge**, works as follows:
  - Property Finder: pulled through its Enterprise API with 2-step token auth.
  - Bayut and Dubizzle: pulled through their APIs, with a WhatsApp push webhook.
  - It dedupes by phone and email across sources, sends email alerts when an **SLA timer** expires (Starter, AED 99/month), and does round robin on Pro (AED 249/month).
  - Added May 2026, 22 installs ([PropBridge listing](https://www.bitrix24.com/apps/app/vortexweb.property_leads/)).
- Another Bitrix24 app lists Property Finder webhook events: new lead, lead status updated, lead expired ([PF Integrator](https://www.bitrix24.com/apps/app/infinitybht_llc.property_finder_integrator/?moved_from=TW)).
- Official specs appear to sit behind partner access ([Zapier community](https://community.zapier.com/how-do-i-3/how-to-import-property-finder-leads-using-zapier-and-pf-expert-api-39111)). **For UAE real estate clients, portal leads will sit alongside Meta leads**, so plan a "source adapter" for each.

**Bitrix24.** Not researched beyond the portal apps above. **Freshsales.** Skipped.

---

## 3. What matters for an ad-agency lead CRM

### 3.1 Speed-to-lead
- **Lead ingestion latency matters most.** Meta's leadgen webhook pings "with a delay of up to a few minutes" ([Meta lead retrieval](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)). HubSpot's native sync can take **up to 2 hours** ([HubSpot KB](https://knowledge.hubspot.com/ads/sync-leads-from-your-facebook-page-or-linkedin-ads-account-to-hubspot)). Our CRM should subscribe to the Page `leadgen` webhook directly, then fetch the lead by `leadgen_id`.
- **Auto-first-response on WhatsApp:** the 24-hour customer service window opens when the *user* messages. Outside that window, only pre-approved templates can be sent, and only to opted-in users ([Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)). So the first touch after a lead-form submission must be a **template**, because the user hasn't messaged yet [GUESS: a lead form alone does not open the window; confirm with Meta].
- **Instant alerts:** GHL places an Internal Notification after Assign User ([growthable, third-party](https://growthable.io/gohighlevel-tutorials/workflows/how-to-automatically-assign-users-to-leads-in-workflows-within-gohighlevel/)). PropBridge sells an SLA timer with email, WhatsApp and Slack alerts ([PropBridge](https://www.bitrix24.com/apps/app/vortexweb.property_leads/)).

### 3.2 Lead routing

| Capability | Who has it |
|---|---|
| Even round robin | GHL (third-party sources), HubSpot, Dynamics, Zoho (via custom function) |
| Weighted split | GHL "unevenly" (third-party) |
| Load balancing by open records | Dynamics; HubSpot (tickets/leads only) |
| Only assign if unassigned / overwrite flag | GHL toggle; HubSpot overwrite option |
| Seller availability window | Dynamics (1–120h, by work schedule) |
| Rules by criteria → user or queue | Salesforce assignment rules (third-party), Zoho (25 criteria, not for manually created records) |
| **Reassign on no response** | **Nobody native.** GHL-style: Wait → If/Else (replied?) → Assign User. Or an external SLA timer (PropBridge). |

Sources: see §2.

### 3.3 Follow-up sequences
- Common primitives across the CRMs: **Wait** (time, date, condition), **If/Else** with a default branch, **Goal / exit on reply**, **A/B split**, **drip/batch pacing** (GHL), and **max delay** (Pipedrive 90 days). Sources in §2.1 and §2.6.
- Close enrolls only when a lead *newly* matches, and only the primary contact ([Close changelog](https://close.com/changelog/automated-triggers)). That design choice prevents mass re-enrollment.

### 3.4 Attribution back to ads
- **Meta lead ads:** the webhook payload has `leadgen_id`, `page_id`, `form_id`, `adgroup_id`, `ad_id` and `created_time`, **but no campaign_id** ([lead retrieval](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)). The Ad node exposes `adset_id` and `campaign_id` ([Ad reference v26.0](https://developers.facebook.com/docs/marketing-api/reference/adgroup)). So we resolve ad → ad set → campaign with one lookup, and should cache it.
- **Website leads:** capture UTMs plus `fbclid`. Then either build `fbc` = `fb.1.<ms timestamp>.<fbclid>` server-side, or read the `_fbc` cookie, and read `_fbp` too. **Never change the casing.** Set the cookie for 90 days and send it with every CAPI event ([fbp & fbc](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc)). GHL does not list `fbclid` in its attribution fields ([GHL attribution](https://help.gohighlevel.com/support/solutions/articles/48001219997-understanding-attribution-source)), which is a gap we can beat.
- **Conversion Leads (CAPI for CRM)** ([overview](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration); [payload spec](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification)):
  - Works only for Instant Form leads. Needs at least 200 leads/month and a target-stage conversion rate of 1–40%. The optimized stage must happen within 28 days of the lead. Upload at least daily.
  - Each CRM stage is its own `event_name`. Send **every stage, including the initial one**.
  - Set `action_source=system_generated`, `custom_data.event_source=crm`, and `custom_data.lead_event_source=<CRM name>`.
  - `event_time` can be up to 7 days old and must be after lead creation.
  - Match keys in priority order: `lead_id` (an invalid one causes rejection), then click ID, hashed email, hashed phone.
  - Platforms sending for clients add `partner_agent`. **(conflict)** This appeared in a search snippet, but the fetched payload spec page did not mention it, so verify it ([search snippet of payload spec](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification)).
  - Expect 2–4 weeks of learning.
- **Dedup of browser and server events:** use the same `event_id` and `event_name`. Meta dedupes within 48h ([Dedup](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)).

### 3.5 Client reporting (CPL, cost per qualified lead, per campaign)
- Spend comes from the Insights API at account, campaign, ad set or ad level, needs `ads_read`, and supports breakdowns ([Insights v26.0](https://developers.facebook.com/docs/marketing-api/insights)). Async jobs and rate limits: not researched.
- **CPL = spend ÷ leads. CPQL = spend ÷ leads that reached the "qualified" stage.** Both need spend (from Meta) joined with CRM stage data on `campaign_id`/`ad_id`. No CRM here was verified to report CPQL per campaign natively. GHL has spend widgets and won-value widgets ([ghlexperts, third-party](https://ghlexperts.com/features/ghl-dashboard)), and HubSpot has attribution reports. **This is a differentiator for us.**

---

## 4. Comparison table

| | GHL | Salesforce | HubSpot | Dynamics 365 | Zoho | Pipedrive | Close | Kommo |
|---|---|---|---|---|---|---|---|---|
| **Core lead object** | Contact + Opportunity | Lead → Account/Contact/Opp | Contact, Lead (`0-136`), Deal | Lead → Account/Contact/Opp | Leads module | Leads Inbox → Deal | Lead = company | Incoming Lead → Lead |
| **Custom objects** | Yes, 10/location | Yes (metadata) | Yes (`2-XXX`) | [GUESS] yes (Dataverse tables) | Custom modules | Not researched | Yes (on Leads) | Not researched |
| **Agency / sub-account resale** | **Yes** (agency, sub-accounts, SaaS mode, rebilling) | No [GUESS] | No; Brands add-on only | No; business units only | Not researched | No [GUESS] | Not researched | Not researched |
| **Record-level access** | Only Assigned Data | OWD + role hierarchy + sharing | Everything / Team / Owned | BU + teams + access levels | Roles + peer sharing | Visibility groups | Role-based lead visibility | Not researched |
| **Round robin** | Yes (+ weighted, 3rd-party) | Rules (3rd-party) | Yes (+ load balance for leads) | RR + load balance + availability | Custom function | Not researched | Not researched | Not researched |
| **Workflow primitives** | Wait, If/Else, Goal, Split, Drip, Webhook, Code | Flow + scheduled paths + waits | Workflows (not deeply researched) | Power Automate (not researched) | Workflow rules + Blueprint | Trigger/condition/action/delay (90d) | Workflows (sequences) | Salesbot |
| **Native Meta lead ads** | Yes (trigger) | Not researched | Yes (≤2h sync) | Not researched | Not researched | Via app/Zapier | Not researched | Not researched |
| **Native Meta CAPI** | Yes (workflow action) | Not researched | Lifecycle + forms only | Not researched | LeadChain | Not researched | Not researched | Not researched |
| **Webhook signing** | Not documented on list page | n/a (CDC/Platform Events) | HMAC v3 (3rd-party) | Header/key/query auth | Not researched | **Basic auth, no signature** (3rd-party) | **HMAC + 72h retry + 30-day replay** | Not researched |
| **AI** | Conversation/Voice AI, AI Prompt | Agentforce | Breeze agents | Sales Qualification Agent | Zia Score | Not researched | Not researched | Salesbot (rules) |

---

## 5. Lessons for us (concrete design recommendations)

1. **Tenancy: copy GHL's hierarchy, Salesforce's isolation discipline.** Use Agency (7Gence or a reseller) → Sub-account (client) → Users, and put `tenant_id` (and `agency_id`) on every row, the same way Salesforce puts OrgID on every row ([SF architecture](https://architect.salesforce.com/fundamentals/platform-multitenant-architecture)). Use one shared schema [GUESS: Postgres row-level security is a natural fit].
2. **RBAC on three axes, like GHL:** (a) which sub-accounts a user can enter, (b) module and action permissions, (c) a record scope of all, team or assigned-only. Add audited "Login As" for agency staff ([GHL roles](https://help.gohighlevel.com/support/solutions/articles/155000002544-sub-account-user-roles-permissions-and-assigned-data)).
3. **Templates instead of snapshots, with versioning.** GHL snapshots reportedly overwrite or duplicate assets clients have customized ([third-party](https://ecosire.com/blog/gohighlevel-snapshots-guide)). Version our pipeline, workflow and template packs so updates to client accounts don't destroy their edits [GUESS on approach].
4. **Data model for B2C real estate:** don't require Company (Close's Lead=company and Salesforce's lead conversion are B2B-shaped). Use **Contact + Lead/Deal + Pipeline/Stage**, plus an **unsorted inbox** like Kommo's Incoming Leads or Pipedrive's Leads Inbox, where **the source maps to the pipeline** ([Kommo](https://developers.kommo.com/docs/subject-area)). Add a small custom-object facility, with Property/Listing first, like GHL's "Property" example. Keep it limited, since GHL caps objects at 10 per location.
5. **Attribution columns are first-class, not custom fields:** `meta_leadgen_id`, `page_id`, `form_id`, `ad_id`, `adset_id`, `campaign_id` (resolved via the Ad node), `utm_*`, `fbclid`, `fbc`, `fbp`, `ctwa_clid`, `gclid`, plus first-touch and last-touch, like GHL's first/latest.
6. **Built-in CAPI emitter driven by stage changes**, following Meta's Conversion Leads spec ([payload spec](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification)):
   - Each pipeline stage maps to an `event_name`. Send the initial stage too.
   - Use `system_generated` / `crm` / `lead_event_source`.
   - Hash PII.
   - Queue events and drop any older than 7 days.
   - Show a per-client health check for the eligibility rules (≥200 leads/month, 1–40% conversion).
   - GHL makes users wire two workflows for this. HubSpot doesn't do deal stages. **We should make it one setting.**
7. **Speed-to-lead as a product feature:** a direct Meta `leadgen` webhook, assignment in under a few seconds [GUESS target], a push and WhatsApp-template alert to the assignee, and an auto first touch via a WhatsApp **template** (required outside the 24h window) ([WhatsApp](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)).
8. **First-class SLA routing:** round robin, weighted and load-balanced modes. Add availability or working hours (like Dynamics), an "only if unassigned" option, and **reassign after N minutes without a first touch**, escalating to a manager. No CRM studied has this natively.
9. **Workflow engine with a small set of primitives:** trigger, wait (duration, until, or until event), if/else with default, goal/exit-on-reply, split, webhook, assign, send (WhatsApp, SMS, email), update stage. Enroll only on a new match, like Close, to avoid storms.
10. **Outbound webhooks done like Close:** HMAC-SHA256 over timestamp + body, a timestamp header, exponential retry for 72h, auto-pause with an email, and a 30-day event log API for replay ([Close](https://developer.close.com/api/resources/webhooks.md)). Avoid Pipedrive's unsigned Basic-auth model.
11. **Client reporting as the agency wedge:** pull spend daily per client ad account through the Insights API, join it on `campaign_id`/`ad_id`, and show CPL, **CPQL**, cost per site visit and cost per deal by campaign. Make it shareable as a white-labeled client view. No CRM studied was verified to do CPQL per campaign natively.
12. **Source adapters:** Meta lead ads, website forms, WhatsApp (CTWA), and later Property Finder, Bayut and Dubizzle. All write to the same inbox with dedupe by phone and email, which PropBridge already sells as a feature ([PropBridge](https://www.bitrix24.com/apps/app/vortexweb.property_leads/)).
13. **AI, later and narrow:** AI qualification and first-reply drafting, with a human handoff (the Dynamics Sales Qualification Agent pattern, where admins choose the autonomy level) ([Dynamics](https://learn.microsoft.com/en-us/dynamics365/sales/configure-sales-qualification-agent)). Vendor AI pricing changes often (Agentforce changed 3×), so meter AI usage per tenant for rebilling, like GHL SaaS rebilling [GUESS on design].

---

## 6. Surprises and gaps

- GHL's official attribution article lists `gclid`, `msclkid` and `ctwa_clid` **but not `fbclid`**, even though GHL is a Meta-agency favorite ([source](https://help.gohighlevel.com/support/solutions/articles/48001219997-understanding-attribution-source)).
- HubSpot lead-ad sync can take **up to 2 hours** ([source](https://knowledge.hubspot.com/ads/sync-leads-from-your-facebook-page-or-linkedin-ads-account-to-hubspot)).
- The Meta leadgen webhook **does not include campaign_id** ([source](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)).
- Zoho assignment rules **do not apply to manually created records** ([source](https://help.zoho.com/portal/en/kb/crm-nextgen/automate-business-processes/assignment-rules/articles/nextgen-set-assignment-rules)).
- A Pipedrive lead can't become a deal through the API ([source](https://pipedrive.readme.io/docs/core-api-concepts-about-pipedrive-api)).
- Not covered (follow-up candidates): reporting for Salesforce, Dynamics, Zoho, Pipedrive and Close; AI for Pipedrive and Close; Power Automate; HubSpot workflow primitives; official GHL SaaS-mode and snapshot docs (pages 404'd); Meta Insights rate limits; official Property Finder and Bayut APIs; Freshsales; Bitrix24.

---

## 7. Sources

**GoHighLevel**
- https://help.gohighlevel.com/en/support/solutions/articles/155000003897-creating-and-editing-custom-objects
- https://help.gohighlevel.com/support/solutions/articles/155000007819-custom-object-templates-pre-built-crm-setup-in-one-click
- https://help.gohighlevel.com/support/solutions/articles/155000002292-a-list-of-workflow-triggers
- https://help.gohighlevel.com/support/solutions/articles/155000002294
- https://help.gohighlevel.com/en/support/solutions/articles/155000002471
- https://help.gohighlevel.com/support/solutions/articles/155000003328
- https://help.gohighlevel.com/support/solutions/articles/155000003267-workflow-action-assign-user (search snippet only)
- https://help.gohighlevel.com/support/solutions/articles/155000002711
- https://help.gohighlevel.com/support/solutions/articles/155000002544-sub-account-user-roles-permissions-and-assigned-data
- https://help.gohighlevel.com/support/solutions/articles/155000002543-manage-agency-user-roles-and-permissions-in-highlevel
- https://help.gohighlevel.com/support/solutions/articles/48001188055-attach-saas-mode-subscription-plan-to-an-existing-client-sub-account
- https://help.gohighlevel.com/support/solutions/articles/48001219997-understanding-attribution-source
- https://help.gohighlevel.com/support/solutions/articles/155000002433-overview-of-ad-manager
- https://help.gohighlevel.com/support/solutions/articles/155000006630
- https://marketplace.gohighlevel.com/docs/
- https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc
- https://marketplace.gohighlevel.com/docs/category/webhook
- Third-party: https://supplygem.com/gohighlevel-agency-sub-account/ · https://supplygem.com/gohighlevel-saas/ · https://setsmart.io/blog/gohighlevel-white-label · https://ecosire.com/blog/gohighlevel-snapshots-guide · https://ecosire.com/blog/gohighlevel-ai-employee-guide · https://growthable.io/gohighlevel-tutorials/workflows/how-to-automatically-assign-users-to-leads-in-workflows-within-gohighlevel/ · https://mastermind.helpscoutdocs.com/article/578-workflow-action-assign-to-user · https://mastermind.helpscoutdocs.com/article/600-workflow-action-facebook-conversion-api · https://growthable.io/gohighlevel-tutorials/integration-widget/facebook-conversion-leads-walkthrough-in-gohighlevel/ · https://growthable.io/gohighlevel-tutorials/reporting/facebook-ads-reporting-for-gohighlevel/ · https://ghlexperts.com/features/ghl-dashboard

**Salesforce**
- https://architect.salesforce.com/fundamentals/platform-multitenant-architecture
- https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_convertlead.htm
- https://developer.salesforce.com/docs/atlas.en-us.salesforce_sharing_cheatsheet.meta/salesforce_sharing_cheatsheet/sharing_cheatsheet.htm
- https://developer.salesforce.com/page/A_Guide_to_Sharing_Architecture
- https://developer.salesforce.com/docs/atlas.en-us.244.0.change_data_capture.meta/change_data_capture/cdc_subscribe.htm
- https://developer.salesforce.com/blogs/2022/10/design-considerations-for-change-data-capture-and-platform-events
- https://developer.salesforce.com/blogs/2021/03/schedule-your-path-in-salesforce-flow
- https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/add-a-scheduled-task-to-your-flow
- https://resources.docs.salesforce.com/208/latest/en-us/sfdc/pdf/salesforce_app_limits_cheatsheet.pdf
- https://www.salesforce.com/au/blog/agentforce-for-sales-customer-zero/
- Third-party: https://www.default.com/post/salesforce-lead-assignment-rules · https://calendly.com/blog/salesforce-lead-assignment-rules · https://www.salesforceben.com/how-do-salesforce-flow-wait-elements-work-use-cases-examples-and-best-practices/ · https://hookdeck.com/webhooks/platforms/guide-to-salesforce-webhooks-features-and-best-practices · https://help.certinia.com/main/2020.2/Subsystems/ACC/Content/Setup/SystemAdmin/aSetupBudgetsPage.htm · https://www.knock-ai.com/blog/agentforce-sdr-alternative · https://www.salesrobot.co/blogs/agentforce-review

**HubSpot**
- https://developers.hubspot.com/docs/guides/crm/understanding-the-crm
- https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows
- https://knowledge.hubspot.com/ads/sync-leads-from-your-facebook-page-or-linkedin-ads-account-to-hubspot
- https://knowledge.hubspot.com/ads/facebook-lead-ads-faq
- https://knowledge.hubspot.com/ads/create-and-sync-ad-conversion-events-with-your-meta-ads-accounts-using-metas-conversion-api
- https://knowledge.hubspot.com/branding/manage-your-brands-with-hubspot-brands
- https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide
- https://knowledge.hubspot.com/user-management/create-and-manage-teams
- https://knowledge.hubspot.com/reports/create-attribution-reports
- https://knowledge.hubspot.com/ai/use-breeze
- https://www.hubspot.com/company-news/spring-2025-spotlight-breeze-agents
- https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests.md
- Third-party: https://hookdeck.com/webhooks/platforms/guide-to-hubspot-webhooks-features-and-best-practices · https://www.customerlabs.com/blog/how-to-send-offline-lead-to-deal-events-from-hubspot-via-meta-conversion-api/ · https://www.grazitti.com/resource/articles/scale-your-multi-brand-business-with-hubspots-business-units/

**Microsoft Dynamics 365**
- https://learn.microsoft.com/en-ca/dynamics365/sales/understand-lead-distributions-assignment-rules
- https://learn.microsoft.com/en-ca/dynamics365/sales/qualify-lead-convert-opportunity-sales
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.qualifyleadrequest
- https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-access-teams-owner-teams-collaborate-share-information
- https://learn.microsoft.com/en-gb/power-apps/developer/data-platform/register-web-hook
- https://learn.microsoft.com/en-us/dynamics365/sales/configure-sales-qualification-agent
- https://mc.merill.net/message/MC1159615

**Zoho CRM**
- https://help.zoho.com/portal/en/kb/crm-nextgen/automate-business-processes/assignment-rules/articles/nextgen-set-assignment-rules
- https://www.zoho.com/crm/resources/solutions/assign-leads-in-round-robin-fashion.html
- https://help.zoho.com/portal/kb/articles/configuring-workflow-rules
- https://help.zoho.com/portal/en/kb/crm-v2-1/automate-business-processes/actions/articles/crm-v2-creating-actions-in-workflow-rules
- https://help.zoho.com/portal/en-gb/community/topic/automating-repetitive-sales-processes-with-blueprint-powered-by-zoho-crm?page=1
- https://help.zoho.com/portal/en/kb/zoho-lead-chain/creating-chains/facebook/articles/connecting-zoho-crm-and-facebook-conversions-api
- https://help.zoho.com/portal/kb/articles/role-management-introduction
- https://www.zoho.com/crm/help/security/
- https://help.zoho.com/portal/ar/community/topic/introducing-zia-scoring-28-2-2023?page=8
- https://zoho.com/sites/default/files/crm/zohocrm-edition-comparison-usd.pdf

**Pipedrive**
- https://pipedrive.readme.io/docs/core-api-concepts-about-pipedrive-api
- https://pipedrive.readme.io/docs/core-api-concepts-custom-fields
- https://pipedrive.readme.io/docs/guide-for-webhooks-v2
- https://developers.pipedrive.com/changelog/post/introducing-support-for-projects-in-webhooks-v2
- https://support.pipedrive.com/en/article/workflow-automations-delay-feature
- https://support.pipedrive.com/en/article/automations-email-conditions
- https://www.pipedrive.com/en/blog/automations-product-update
- https://support.pipedrive.com/en/article/visibility-and-permissions-overview
- https://support.pipedrive.com/en/article/visibility-groups
- https://www.pipedrive.com/en/marketplace/app/facebook-lead-ads-sync/f7d03043685585ef
- https://www.pipedrive.com/en/blog/pipedrive-zapier-leads
- https://community.pipedrive.com/discussion/9374/automation-with-no-activity-trigger
- Third-party: https://hookdeck.com/webhooks/platforms/guide-to-pipedrive-webhooks-features-and-best-practices.md

**Close**
- https://developer.close.com/
- https://developer.close.com/llms.txt
- https://developer.close.com/api/resources/leads.md
- https://developer.close.com/api/resources/custom-objects.md
- https://developer.close.com/api/resources/webhooks.md
- https://developer.close.com/api/resources/sequences/create
- https://developer.close.com/api/resources/roles
- https://close.com/changelog/automated-triggers
- https://help.close.com/docs/roles-permissions
- https://close.helpscoutdocs.com/article/348-roles-permissions

**Kommo, Attio, UAE portals**
- https://developers.kommo.com/docs/subject-area
- https://www.kommo.com/support/crm/incoming-leads/
- https://www.kommo.com/crm-pipeline/
- https://www.amocrm.com/integrations/whatsapp/?logout=yes
- https://developers.attio.com/docs/data-model
- https://docs.attio.com/docs/objects-and-lists
- https://www.bitrix24.com/apps/app/vortexweb.property_leads/
- https://www.bitrix24.com/apps/app/infinitybht_llc.property_finder_integrator/?moved_from=TW
- https://community.zapier.com/how-do-i-3/how-to-import-property-finder-leads-using-zapier-and-pf-expert-api-39111

**Meta**
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration
- https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
- https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- https://developers.facebook.com/docs/marketing-api/insights
- https://developers.facebook.com/docs/marketing-api/reference/adgroup
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
