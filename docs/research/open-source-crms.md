# Open-source CRMs: license and architecture review

**Snapshot date:** 2026-10-25. Star counts, push dates and issue counts are point-in-time values from the GitHub REST API (`https://api.github.com/repos/<owner>/<repo>`).
**Context:** 7Gence will host a multi-tenant, white-label CRM as SaaS for paying clients, and may also hand it to clients. Planned stack: Next.js 15, React 19, Tailwind 4, TypeScript, Postgres (Supabase likely).
**Not legal advice.** This is an engineering read of license texts. Have a lawyer review it before shipping.

Notation: facts carry their source URL inline. **[GUESS]** = not verified in this session. **(opinion)** = a subjective code-quality impression.

## Summary

| Project | Stars | Last push | Contributors* | Stack | License (as read) | Verdict |
|---|---|---|---|---|---|---|
| Twenty | 59,678 | 2026-10-25 | 783 | NestJS + TypeORM + GraphQL + BullMQ/Redis, Postgres; React 19 + Jotai + Linaria | AGPLv3 + Section 7 "Application Exception" + **commercial "@license Enterprise" files** + some MIT packages | **LEARN FROM ONLY** |
| EspoCRM | 3,519 | 2026-10-24 | 71 | PHP; Backbone/jQuery/Handlebars SPA; MySQL/Postgres [GUESS] | AGPLv3 + **7(b): must keep "EspoCRM" in the UI** | **AVOID** |
| SuiteCRM 7 / SuiteCRM 8 (Core) | 5,809 / 288 | 2026-10-23 / 2026-10-20 | 287 / 42 | v7: legacy PHP (SugarCRM CE fork). v8: Symfony 6.4 + API Platform + Angular 18, plus the v7 legacy code inside | AGPLv3 + **7(b): must keep "Powered by SugarCRM" / "Supercharged by SuiteCRM" logos** | **AVOID** |
| Krayin | 24,054 | 2026-10-21 | 67 | Laravel 12 / PHP 8.3, Vue 3, Tailwind 3; MySQL [GUESS] | **MIT** | **SAFE TO COPY** (wrong stack, so use it for ideas) |
| Frappe CRM | 3,854 | 2026-10-23 | 83 | Python Frappe framework (MIT), Vue 3 + frappe-ui (MIT), Tailwind 3; MariaDB [GUESS] | AGPLv3 (app) | **LEARN FROM ONLY** |
| Odoo CRM (Community) | 55,306 (whole odoo repo) | 2026-10-25 | 4,346 | Python ORM monolith, OWL JS frontend [GUESS], Postgres | Community LGPLv3. Enterprise proprietary | **LEARN FROM ONLY** |
| Atomic CRM (marmelab) | 1,400 | 2026-10-24 | 24 | React 19, ra-core (react-admin), shadcn, Tailwind 4, Vite SPA, Supabase (Postgres + edge functions) | **MIT** | **SAFE TO COPY** (closest stack match) |
| NocoBase (extra) | 24,702 | 2026-10-25 | 110 | TypeScript, Node + React, no-code platform | "NocoBase License Agreement": Apache-2.0 **overridden by supplementary terms** | **AVOID** |
| Corteza (extra) | 2,180 | 2026-10-20 | 45 | Go backend, Vue frontend [GUESS], low-code platform | **Apache-2.0** | SAFE TO COPY (Go, low-code; little to reuse) |

\*Contributors = page count from `/contributors?per_page=1&anon=1`, so anonymous contributors are included.

Repo metadata sources: [twenty](https://api.github.com/repos/twentyhq/twenty), [espocrm](https://api.github.com/repos/espocrm/espocrm), [SuiteCRM](https://api.github.com/repos/salesagility/SuiteCRM) (this URL redirects to SuiteCRM/SuiteCRM), [SuiteCRM-Core](https://api.github.com/repos/SuiteCRM/SuiteCRM-Core), [krayin](https://api.github.com/repos/krayin/laravel-crm), [frappe/crm](https://api.github.com/repos/frappe/crm), [odoo](https://api.github.com/repos/odoo/odoo), [atomic-crm](https://api.github.com/repos/marmelab/atomic-crm), [nocobase](https://api.github.com/repos/nocobase/nocobase), [corteza](https://api.github.com/repos/cortezaproject/corteza).

### Three different kinds of license risk

1. **AGPL plus a 7(b) branding clause (EspoCRM, SuiteCRM).** The license requires the vendor name or logo to stay in the UI, so a white-label product cannot comply. This is the hardest blocker.
2. **Plain AGPL (Twenty core, Frappe CRM).** Rebranding is allowed. AGPL section 13 means every user who reaches our modified version over the network must be offered its full source. Each paying client could take the whole product and host it themselves, and we could not keep any of our changes proprietary.
3. **Commercial or "source-available" parts (Twenty `@license Enterprise` files, Odoo Enterprise, NocoBase supplementary terms).** Production use requires a paid subscription or license from the vendor, and some terms ban exactly our use case.

---

## Twenty

- **Repo:** https://github.com/twentyhq/twenty. 59,678 stars, last push 2026-10-25T07:56Z, 118 open issues (GitHub's count includes PRs), 783 contributors ([API](https://api.github.com/repos/twentyhq/twenty)). GitHub reports the license as `NOASSERTION` because it is mixed.
- **Stack:** Nx monorepo. The server uses NestJS 11, a patched TypeORM 0.3.31, graphql-yoga, BullMQ, pg and redis ([server package.json](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-server/package.json)). The frontend uses React 19, Apollo Client 4, Jotai, Linaria and @xyflow/react for the workflow builder ([front package.json](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-front/package.json)). The README lists NestJS, BullMQ, PostgreSQL, Redis, React, Jotai, Linaria and Lingui ([README](https://raw.githubusercontent.com/twentyhq/twenty/main/README.md)).
- **Architecture:**
  - Metadata-driven custom objects. `packages/twenty-server/src/engine/` contains `metadata-modules`, `twenty-orm`, `workspace-manager`, `workspace-datasource` and `workspace-cache` ([contents API](https://api.github.com/repos/twentyhq/twenty/contents/packages/twenty-server/src/engine)).
  - **Multi-tenancy is built in, with one Postgres schema per workspace.** `workspace-schema.service.ts` calls `queryRunner.createSchema(schemaName, true)` ([source](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-server/src/engine/workspace-datasource/workspace-schema.service.ts)).
  - A workflow module lives in `src/modules/workflow`. The API is GraphQL and REST, plus webhooks (named in the LICENSE exception text).
  - There is an app/SDK platform (`twenty-sdk`, `twenty-cli`, `twenty-apps`).
- **Code quality (opinion):** Strict TypeScript monorepo with a dedicated `twenty-e2e-testing` package, custom oxlint rules and knip. It is the most modern, best-structured codebase in this list and the closest to our stack. It is also large and heavily patched (TypeORM, @nestjs/graphql). Forking it means owning a lot of complexity.
- **LICENSE** ([raw](https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE)):
  - The file opens: "This project is mostly licensed under the GNU Affero General Public License v3.0 (AGPLv3) … with two qualifications".
  - Qualification 1: "Certain files are licensed under a commercial license … marked with … `/* @license Enterprise */`". The **Twenty.com Commercial License** says these files "may only be used in production, if you … have a valid Twenty Enterprise Edition subscription", and "it is forbidden to copy, merge, publish, distribute, sublicense, and/or sell the Software." Copying and modifying for development and testing is allowed.
  - Qualification 2: these packages are MIT: "the twenty CLI, twenty-sdk, twenty-client-sdk, create-twenty-app, twenty-shared), the twenty-ui component library, and the applications under packages/twenty-apps". Confirmed: `twenty-ui` and `twenty-shared` declare MIT ([ui](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-ui/package.json), [shared](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-shared/package.json)). **`twenty-front` has no license field, so it inherits the root AGPLv3.** `twenty-server` declares `AGPL-3.0`.
  - **Section 7 "Twenty Application Exception":** apps that talk to Twenty only through its APIs, SDKs, manifests, logic functions or front components may use any license. Its limits section says: "if you modify Twenty, the AGPLv3, including section 13, applies to your modified version in full", and the exception grants no trademark rights.
- **Which files are Enterprise-licensed:** found with a GitHub code search for "license Enterprise" (first 100 hits, so the list may be incomplete). They include the SSO/SAML modules, `billing`, `usage` and `usage-limit`, `enterprise.module.ts`, `record-share`, `event-logs`, `SettingsCustomDomainPage.tsx`, and the `RowLevelPermissionPredicate*` types. **Those types sit inside the MIT package `twenty-shared`, so the per-file header overrides the package license. Check headers before copying anything, even from the "MIT" packages.**
- **Trademark** ([TRADEMARK.md](https://raw.githubusercontent.com/twentyhq/twenty/main/.github/TRADEMARK.md)): a fork you run publicly must "give it its own name and branding". Saying "powered by Twenty" is allowed. Rebranding is therefore required, which fits white-labeling.
- **Risk for us:**
  - (a) AGPL section 13. Every client user on our modified fork must be offered the full source, so clients could self-host and nothing we change can stay proprietary.
  - (b) The Enterprise-licensed features are SSO, billing, usage metering, custom domains, row-level permissions and record sharing: the feature set a white-label multi-tenant SaaS needs. Running them in production requires a paid Twenty EE subscription per host and seat, and we cannot resell them.
  - (c) Building our product as an "Application" on top of Twenty would avoid the AGPL for our code, but then Twenty itself is the product we host, and (a) and (b) still apply to it.
- **Verdict: LEARN FROM ONLY.** Study the metadata/custom-object design, schema-per-workspace tenancy and the workflow builder UX. Do not copy AGPL or Enterprise files. Code from `twenty-ui` and `twenty-shared` may be copied only after a per-file header check, but it is built on Linaria, so it is poor value for a Tailwind stack (opinion).

## EspoCRM

- **Repo:** https://github.com/espocrm/espocrm. 3,519 stars, last push 2026-10-24, 67 open issues, 71 contributors ([API](https://api.github.com/repos/espocrm/espocrm)).
- **Stack:** PHP backend (`application/Espo/{Core,ORM,Modules,Hooks,…}`). The frontend uses its own framework on Backbone, jQuery and Handlebars ([package.json](https://raw.githubusercontent.com/espocrm/espocrm/master/package.json), whose license field is `AGPL-3.0-or-later`). The repo has `phpstan.neon`, `phpunit.xml` and `tests/` ([contents](https://api.github.com/repos/espocrm/espocrm/contents)).
- **Architecture:** Metadata-driven entities (the Entity Manager) and REST API [GUESS from product knowledge]. Built-in multi-tenancy: none, it is one instance per customer [GUESS]. Workflows, BPM and Reports come in the "Advanced Pack", described as "an official add-on" ([page](https://www.espocrm.com/extensions/advanced-pack/)). The page shows a shop cart but no price, so "paid" is [GUESS].
- **Code quality (opinion):** Mature, consistent PHP with static analysis. The frontend stack is dated.
- **LICENSE:** plain AGPLv3 text ([raw](https://raw.githubusercontent.com/espocrm/espocrm/master/LICENSE.txt)). The additional terms are in every source header ([Application.php](https://raw.githubusercontent.com/espocrm/espocrm/master/application/Espo/Core/Application.php)): "In accordance with Section 7(b) … these Appropriate Legal Notices must retain the display of the 'EspoCRM' word."
- **Risk for us:** **The 7(b) attribution clause rules out white-labeling.** On top of that, AGPL section 13 applies.
- **Verdict: AVOID.**

## SuiteCRM (v7 and v8 "Core")

- **Repos:** https://github.com/SuiteCRM/SuiteCRM (v7): 5,809 stars, last push 2026-10-23, 1,364 open issues, 287 contributors ([API](https://api.github.com/repos/salesagility/SuiteCRM), redirects). https://github.com/SuiteCRM/SuiteCRM-Core (v8): 288 stars, last push 2026-10-20, 323 open issues, 42 contributors ([API](https://api.github.com/repos/SuiteCRM/SuiteCRM-Core)).
- **Stack:** v8 uses PHP ≥8.1, Symfony 6.4 and API Platform 3.4 ([composer.json](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/composer.json)) with Angular 18.2 ([package.json](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/package.json)). It embeds the v7 legacy app under `public/legacy`.
- **Architecture:** Module/vardef metadata, Studio for custom fields, and AOW workflows [GUESS]. No built-in multi-tenancy [GUESS].
- **Code quality (opinion):** Carries SugarCRM CE legacy from 2004 onward. The v7 repo's open-issue count stands out.
- **LICENSE:** AGPLv3 text ([v7](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM/master/LICENSE.txt), [v8](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/LICENSE.txt)). The source headers add 7(b) terms:
  - v7 [index.php](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM/master/index.php): "must retain the display of the 'Powered by SugarCRM' logo and 'Supercharged by SuiteCRM' logo".
  - v8 core files, e.g. [AsyncTaskCompleted.php](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/core/backend/AsyncTask/Message/AsyncTaskCompleted.php): must retain "Supercharged by SuiteCRM".
  - The v8 bundled legacy code ([public/legacy/index.php](https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/public/legacy/index.php)) carries both logo requirements.
- **Risk for us:** **The logo-retention clauses rule out white-labeling.** AGPL section 13 also applies.
- **Verdict: AVOID.**

## Krayin

- **Repo:** https://github.com/krayin/laravel-crm. 24,054 stars, last push 2026-10-21, 107 open issues, 67 contributors ([API](https://api.github.com/repos/krayin/laravel-crm)).
- **Stack:** PHP ^8.3, Laravel 12, Sanctum, Reverb and laravel-imap ([composer.json](https://raw.githubusercontent.com/krayin/laravel-crm/2.2/composer.json), license field `MIT`). The admin UI uses Vue 3.4, Tailwind 3.3 and Vite 5 ([Admin package.json](https://raw.githubusercontent.com/krayin/laravel-crm/2.2/packages/Webkul/Admin/package.json)).
- **Architecture:** Modular packages under `packages/Webkul/`: Activity, Admin, Attribute, Automation, Contact, DataGrid, DataTransfer, Email, EmailTemplate, Lead, Marketing, Product, Quote, Tag, User, Warehouse, WebForm ([contents](https://api.github.com/repos/krayin/laravel-crm/contents/packages/Webkul?ref=2.2)). Custom attributes use the `Attribute` package, an EAV-style design [GUESS]. A simple workflow engine lives in the `Automation` package. **Multi-tenancy is a separate extension, "Krayin CRM Multi Tenant SaaS"** ([README](https://raw.githubusercontent.com/krayin/laravel-crm/master/README.md)), which is sold separately [GUESS].
- **Code quality (opinion):** Conventional Laravel package layout with a `tests/` folder. Readable, but a different language and framework from ours.
- **LICENSE:** MIT, "Copyright 2010-2025, Webkul Software" ([raw](https://raw.githubusercontent.com/krayin/laravel-crm/2.2/LICENSE)). No extra terms in the file. The README says it "will always be free under the MIT License."
- **Risk for us:** Low. Keep the copyright notice in copied code. Not using the "Krayin" name is ordinary trademark hygiene.
- **Verdict: SAFE TO COPY.** In practice the reusable parts are the data model, the field and attribute types, and the automation trigger/action catalogue. PHP and Vue code will not port directly.

## Frappe CRM

- **Repo:** https://github.com/frappe/crm. 3,854 stars, last push 2026-10-23, 281 open issues, 83 contributors ([API](https://api.github.com/repos/frappe/crm)).
- **Stack:** A Frappe app (Python DocTypes under `crm/fcrm/doctype/`) ([contents](https://api.github.com/repos/frappe/crm/contents/crm/fcrm/doctype?ref=develop)). The frontend uses Vue 3.5, frappe-ui 1.0.0-rc.2, Tailwind 3.4 and Vite ([frontend package.json](https://raw.githubusercontent.com/frappe/crm/develop/frontend/package.json)). frappe-ui is a git submodule ([.gitmodules](https://raw.githubusercontent.com/frappe/crm/develop/.gitmodules)) and is MIT ([API](https://api.github.com/repos/frappe/frappe-ui)). The Frappe framework itself is MIT, 10,991 stars ([API](https://api.github.com/repos/frappe/frappe)). The repo has server, frontend and migration CI plus Playwright e2e ([README](https://raw.githubusercontent.com/frappe/crm/develop/README.md)).
- **Architecture:** Metadata-driven, since everything is a DocType (custom fields, layouts and form scripts appear as `crm_fields_layout` and `crm_form_script`). Built-in SLA, telephony (Twilio, Exotel) and an ERPNext sync. Multi-tenancy uses Frappe's multi-site bench, one database per site [GUESS].
- **Code quality (opinion):** Clean, well-scoped DocTypes. It is tightly bound to the Frappe runtime, so the code does not port.
- **LICENSE:** AGPLv3 ([raw](https://raw.githubusercontent.com/frappe/crm/develop/LICENSE)). There is no 7(b) attribution clause in the LICENSE file. Source headers were not checked [GUESS].
- **Risk for us:** AGPL section 13 obligations, and a stack mismatch.
- **Verdict: LEARN FROM ONLY.** The UX for lead and deal pages, SLA modelling and the fields-layout editor is worth studying.

## Odoo CRM (Community)

- **Repo:** https://github.com/odoo/odoo, the whole ERP. 55,306 stars, last push 2026-10-25, 11,095 open issues, 4,346 contributors ([API](https://api.github.com/repos/odoo/odoo)). The CRM module is `addons/crm` ([contents](https://api.github.com/repos/odoo/odoo/contents/addons/crm?ref=20.0)).
- **Stack:** Python ORM with Postgres. Views are server-defined XML, rendered by the OWL frontend [GUESS]. Multi-company is built in. Multi-tenancy works through multiple databases (`dbfilter`) [GUESS].
- **Code quality (opinion):** Very mature, but a monolith. The CRM cannot be lifted out of the Odoo runtime.
- **LICENSE:** "Odoo is published under the GNU LESSER GENERAL PUBLIC LICENSE, Version 3 (LGPLv3)" ([raw](https://raw.githubusercontent.com/odoo/odoo/20.0/LICENSE), [COPYRIGHT](https://raw.githubusercontent.com/odoo/odoo/20.0/COPYRIGHT)). Odoo Enterprise is under the "Odoo Enterprise Edition License v1.0": it "can only be used … with a valid Odoo Enterprise Subscription", and "It is forbidden to publish, distribute, sublicense, or sell copies" ([Odoo legal](https://www.odoo.com/documentation/18.0/legal/licenses.html)).
- **Risk for us:** LGPL has no network clause, so hosting Community is fine. Copying Odoo code into our app makes those files LGPL, and modifications must be shared with anyone the files are distributed to. Rebranding Odoo itself raises trademark issues [GUESS]. None of this matters much, because the Python/OWL stack does not fit ours.
- **Verdict: LEARN FROM ONLY.**

## Atomic CRM (marmelab)

- **Repo:** https://github.com/marmelab/atomic-crm. 1,400 stars, last push 2026-10-24, 20 open issues, 24 contributors ([API](https://api.github.com/repos/marmelab/atomic-crm)).
- **Stack:** React 19.1, ra-core 5.14 (the headless react-admin core), ra-supabase-core, Tailwind 4.1, Vite, TanStack Query 5, TypeScript 5.8, Vitest ([package.json](https://raw.githubusercontent.com/marmelab/atomic-crm/main/package.json)). The README calls it "A full-featured CRM built with React, shadcn-admin-kit, and Supabase" ([README](https://raw.githubusercontent.com/marmelab/atomic-crm/main/README.md)). react-admin is MIT, 26,974 stars ([API](https://api.github.com/repos/marmelab/react-admin)).
- **Architecture:**
  - Feature folders under `src/components/atomic-crm/`: activity, companies, contacts, dashboard, dataImport, deals, filters, notes, sales, settings, tags, tasks ([contents](https://api.github.com/repos/marmelab/atomic-crm/contents/src/components/atomic-crm)).
  - The backend is Supabase: 29 SQL migrations, edge functions, seed data ([contents](https://api.github.com/repos/marmelab/atomic-crm/contents/supabase)).
  - **No multi-tenancy.** The init migration's RLS policies are "Enable read access for authenticated users" and similar, with no tenant scoping ([init_db.sql](https://raw.githubusercontent.com/marmelab/atomic-crm/main/supabase/migrations/20240730075029_init_db.sql)).
  - It is a Vite SPA, not Next.js. Custom fields are configurable, but this is not a metadata engine. There is no workflow engine.
  - Components ship as a shadcn registry so forks can pull upstream updates.
- **Code quality (opinion):** Small, clean, modern TypeScript with Playwright e2e, Storybook and Vitest. It is the easiest codebase here to read and reuse.
- **LICENSE:** MIT, "Copyright (c) 2024-present, Francois Zaninotto, Marmelab" ([raw](https://raw.githubusercontent.com/marmelab/atomic-crm/main/LICENSE.md)).
- **Risk for us:** Low. Keep the MIT notice. Do not ship react-admin's separately licensed Enterprise packages (`ra-enterprise`) [GUESS]. Atomic CRM depends only on `ra-core` and `ra-supabase-core`.
- **Verdict: SAFE TO COPY.**

## NocoBase (extra)

- **Repo:** https://github.com/nocobase/nocobase. 24,702 stars, last push 2026-10-25 ([API](https://api.github.com/repos/nocobase/nocobase)).
- **LICENSE:** the "NocoBase License Agreement", updated February 24, 2026 ([raw](https://raw.githubusercontent.com/nocobase/nocobase/main/LICENSE.txt)).
  - Clause 4.2 incorporates Apache-2.0, but "the supplementary terms of this Agreement shall prevail".
  - 5.2: "not allowed to remove or change the brand, name, link, version number … on the Software interface, except for the main LOGO".
  - 5.4: "not allowed to provide to the public any form of no-code, zero-code, low-code, AI platform SaaS/PaaS products".
  - Under 6.5 and 7.6, selling an "Upper Layer Application" such as a CRM to customers requires a Professional or Enterprise license.
  - The company can change the terms by website announcement.
- **Verdict: AVOID.** Branding must stay, reselling needs a paid license, and the terms can change at any time.

## Corteza (extra)

- **Repo:** https://github.com/cortezaproject/corteza. 2,180 stars, last push 2026-10-20, Apache-2.0 ([API](https://api.github.com/repos/cortezaproject/corteza), [LICENSE](https://raw.githubusercontent.com/cortezaproject/corteza/2026.9.x/LICENSE)). A Go low-code platform with CRM templates.
- **Verdict:** SAFE TO COPY from a license standpoint. The Go stack and low-code focus mean little is reusable for us (opinion).

---

## Permissive building blocks

All checked through the GitHub API (`/repos/<owner>/<repo>`) or the npm registry on 2026-10-25.

| Need | Library | Stars | Last push | License | Notes |
|---|---|---|---|---|---|
| Data tables / list views | [TanStack Table](https://api.github.com/repos/TanStack/table) | 28,520 | 2026-10-21 | MIT | Headless, pairs with shadcn |
| Server state | [TanStack Query](https://api.github.com/repos/TanStack/query) | 50,477 | 2026-10-25 | MIT | |
| UI kit | [shadcn/ui](https://api.github.com/repos/shadcn-ui/ui) | 126,472 | 2026-10-25 | MIT | Tailwind 4 native; Atomic CRM already uses it |
| Kanban drag and drop | [dnd-kit](https://api.github.com/repos/clauderic/dnd-kit) | 17,752 | 2026-10-22 | MIT | |
| Kanban drag and drop (alt) | [@hello-pangea/dnd](https://raw.githubusercontent.com/hello-pangea/dnd/main/LICENSE) | 4,040 | 2026-10-24 | Apache-2.0 (file + [npm](https://registry.npmjs.org/@hello-pangea/dnd/latest)) | GitHub API says NOASSERTION; the LICENSE file is Apache-2.0 |
| Automation builder canvas | [xyflow (React Flow)](https://api.github.com/repos/xyflow/xyflow) | 38,769 | 2026-10-22 | MIT | Twenty uses it for workflows |
| Forms / validation | [react-hook-form](https://api.github.com/repos/react-hook-form/react-hook-form), [zod](https://api.github.com/repos/colinhacks/zod) | 44,883 / 44,193 | 2026-10-25 / 2026-10-19 | MIT / MIT | |
| Rich-text notes | [Tiptap](https://api.github.com/repos/ueberdosis/tiptap) | 38,843 | 2026-10-23 | MIT | Some Tiptap Pro extensions are commercial [GUESS] |
| Charts | [Recharts](https://api.github.com/repos/recharts/recharts) | 27,658 | 2026-10-25 | MIT | |
| Auth (if not Supabase Auth) | [Better Auth](https://api.github.com/repos/better-auth/better-auth) | 30,456 | 2026-10-25 | MIT | |
| DB / Auth / Storage | [Supabase](https://api.github.com/repos/supabase/supabase) | 113,900 | 2026-10-25 | Apache-2.0 | Self-hostable |
| CRUD data layer | [react-admin / ra-core](https://api.github.com/repos/marmelab/react-admin) | 26,974 | 2026-10-24 | MIT | What Atomic CRM's components assume |
| Durable workflows | [Trigger.dev](https://api.github.com/repos/triggerdotdev/trigger.dev) | 16,614 | 2026-10-24 | Apache-2.0 repo ([LICENSE](https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE)); `@trigger.dev/sdk` MIT ([npm](https://registry.npmjs.org/@trigger.dev/sdk/latest)) | Self-hostable |
| Durable workflows | Inngest | [server](https://api.github.com/repos/inngest/inngest) 5,988 | 2026-10-25 | **Server: SSPL v1, plus an Apache-2.0 grant effective 3 years after each release** ([LICENSE.md](https://raw.githubusercontent.com/inngest/inngest/main/LICENSE.md)). **SDK:** the GitHub API reports GPL-3.0 for [inngest-js](https://api.github.com/repos/inngest/inngest-js), but [packages/inngest/LICENSE.md](https://raw.githubusercontent.com/inngest/inngest-js/main/packages/inngest/LICENSE.md) and [npm](https://registry.npmjs.org/inngest/latest) both say Apache-2.0 | The published npm package (Apache-2.0) is what we would ship. SSPL matters only if we self-host the Inngest server |
| Durable workflows | [Temporal server](https://api.github.com/repos/temporalio/temporal) / [TS SDK](https://api.github.com/repos/temporalio/sdk-typescript) | 23,970 / 940 | 2026-10-25 / 2026-10-24 | MIT / MIT | Heavy to operate (opinion) |
| Durable workflows | [Vercel Workflow](https://api.github.com/repos/vercel/workflow) | 2,473 | 2026-10-24 | Apache-2.0 | |
| Durable workflows | [Hatchet](https://api.github.com/repos/hatchet-dev/hatchet) | 8,179 | 2026-10-23 | MIT | |
| Postgres job queue | [pg-boss](https://api.github.com/repos/timgit/pg-boss), [graphile/worker](https://api.github.com/repos/graphile/worker) | 4,084 / 2,425 | 2026-10-21 / 2026-10-20 | MIT / MIT | Runs on our existing Postgres, no extra infrastructure |
| Redis job queue | [BullMQ](https://api.github.com/repos/taskforcesh/bullmq) | 9,543 | 2026-10-25 | MIT | Twenty uses it |

**Do not embed these:**

- [n8n](https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md): Sustainable Use License, plus `.ee.` files that need an Enterprise license.
- [Windmill](https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE): AGPLv3 plus proprietary enterprise code.
- [Activepieces](https://raw.githubusercontent.com/activepieces/activepieces/main/LICENSE): MIT except `packages/ee/` and `packages/server/api/src/app/ee`. It is usable only if you stay outside those directories.

---

## Recommendation: build from scratch, borrow Atomic CRM modules, learn from Twenty

**Path:** build the core ourselves on Next.js 15, React 19, Tailwind 4 and Supabase. Copy specific UI modules and schema patterns from Atomic CRM (MIT). Use the MIT/Apache building blocks above. Study Twenty for architecture ideas only.

**Why not fork anything:**

- **EspoCRM and SuiteCRM:** their AGPL 7(b) clauses require "EspoCRM" or "Powered by SugarCRM" / "Supercharged by SuiteCRM" to stay in the UI. That contradicts white-labeling outright.
- **Twenty:** the best architecture and the closest stack, but there are two separate blockers:
  - AGPL section 13 means every client of our hosted fork is entitled to its full source. They could self-host it, and we could never keep our changes proprietary.
  - The `@license Enterprise` files (SSO, billing, usage limits, custom domains, row-level permissions, record sharing) are the multi-tenant SaaS features we need, and production use requires a paid Twenty subscription with no right to resell.
  - Its trademark policy would also force a rebrand, which on its own is fine for us.
- **NocoBase:** its supplementary terms (5.2 branding, 5.4 no SaaS/PaaS, 6.5/7.6 paid license to sell upper-layer apps) override its Apache-2.0 base.
- **Odoo and Frappe CRM:** LGPL and AGPL respectively, and both are tied to Python runtimes we will not adopt.
- **Krayin:** MIT, but Laravel/Vue, and multi-tenancy is a paid extension.
- **Atomic CRM:** MIT and the right stack, but a Vite SPA with single-tenant RLS ("authenticated users" only). Forking it would mean rewriting the data layer, tenancy and routing anyway, so borrowing is cheaper than forking.

**What to borrow (MIT, keep the copyright notice in a `THIRD_PARTY_NOTICES` file):**

- Atomic CRM `src/components/atomic-crm/`: `deals` (kanban pipeline), `contacts`, `companies`, `notes`, `tasks`, `activity`, `dataImport` (CSV import), `tags`, `dashboard`.
- Atomic CRM's Supabase migrations and edge-function pattern, as a starting schema. Add `tenant_id` and tenant-scoped RLS everywhere.
- These components assume ra-core (MIT). In the Next.js App Router they run as client components, or we swap ra-core for TanStack Query.

**What to learn from only (read the docs, architecture and data models, then write our own code; never copy files or port functions line by line):**

- Twenty `metadata-modules` and `twenty-orm`: metadata-driven custom objects and fields. Note the trade-off between its schema-per-workspace tenancy and a simpler shared-schema `tenant_id` + RLS design on Supabase.
- Twenty's workflow builder UX.
- Frappe CRM's fields-layout editor and SLA modelling.
- Krayin's `Automation` trigger/action catalogue. This one is MIT, so copying would be legal too.

**Workflow engine:** every option in the table is license-safe for embedding: Trigger.dev, the Inngest SDK, Temporal, Vercel Workflow, Hatchet, pg-boss, graphile-worker, BullMQ. The one license caveat is that self-hosting the Inngest server means SSPL. Pick on stack fit and operations cost; this review does not rank them beyond license.

**Hygiene:** keep a dependency license allowlist (MIT, Apache-2.0, BSD, ISC) and block AGPL, GPL, SSPL and source-available licenses in CI. Check per-file headers when copying from mixed-license repos: Twenty's MIT `twenty-shared` package contains Enterprise-licensed files.

---

## Sources

- GitHub repo metadata: https://api.github.com/repos/twentyhq/twenty · https://api.github.com/repos/espocrm/espocrm · https://api.github.com/repos/salesagility/SuiteCRM · https://api.github.com/repos/SuiteCRM/SuiteCRM-Core · https://api.github.com/repos/krayin/laravel-crm · https://api.github.com/repos/frappe/crm · https://api.github.com/repos/frappe/frappe · https://api.github.com/repos/frappe/frappe-ui · https://api.github.com/repos/odoo/odoo · https://api.github.com/repos/marmelab/atomic-crm · https://api.github.com/repos/marmelab/react-admin · https://api.github.com/repos/nocobase/nocobase · https://api.github.com/repos/cortezaproject/corteza
- Licenses:
  - https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE
  - https://raw.githubusercontent.com/twentyhq/twenty/main/.github/TRADEMARK.md
  - https://raw.githubusercontent.com/espocrm/espocrm/master/LICENSE.txt
  - https://raw.githubusercontent.com/espocrm/espocrm/master/application/Espo/Core/Application.php
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM/master/LICENSE.txt
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM/master/index.php
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/LICENSE.txt
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/core/backend/AsyncTask/Message/AsyncTaskCompleted.php
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/public/legacy/index.php
  - https://raw.githubusercontent.com/krayin/laravel-crm/2.2/LICENSE
  - https://raw.githubusercontent.com/frappe/crm/develop/LICENSE
  - https://raw.githubusercontent.com/odoo/odoo/20.0/LICENSE
  - https://raw.githubusercontent.com/odoo/odoo/20.0/COPYRIGHT
  - https://www.odoo.com/documentation/18.0/legal/licenses.html
  - https://raw.githubusercontent.com/marmelab/atomic-crm/main/LICENSE.md
  - https://raw.githubusercontent.com/nocobase/nocobase/main/LICENSE.txt
  - https://raw.githubusercontent.com/cortezaproject/corteza/2026.9.x/LICENSE
- Stack and architecture:
  - https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-server/package.json
  - https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-front/package.json
  - https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-ui/package.json
  - https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-shared/package.json
  - https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-server/src/engine/workspace-datasource/workspace-schema.service.ts
  - https://raw.githubusercontent.com/twentyhq/twenty/main/README.md
  - https://raw.githubusercontent.com/espocrm/espocrm/master/package.json
  - https://www.espocrm.com/extensions/advanced-pack/
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/composer.json
  - https://raw.githubusercontent.com/SuiteCRM/SuiteCRM-Core/hotfix/package.json
  - https://raw.githubusercontent.com/krayin/laravel-crm/2.2/composer.json
  - https://raw.githubusercontent.com/krayin/laravel-crm/2.2/packages/Webkul/Admin/package.json
  - https://raw.githubusercontent.com/krayin/laravel-crm/master/README.md
  - https://raw.githubusercontent.com/frappe/crm/develop/frontend/package.json
  - https://raw.githubusercontent.com/frappe/crm/develop/.gitmodules
  - https://raw.githubusercontent.com/frappe/crm/develop/README.md
  - https://raw.githubusercontent.com/marmelab/atomic-crm/main/package.json
  - https://raw.githubusercontent.com/marmelab/atomic-crm/main/README.md
  - https://raw.githubusercontent.com/marmelab/atomic-crm/main/supabase/migrations/20240730075029_init_db.sql
- Twenty Enterprise-file list: `gh search code "license Enterprise" --repo twentyhq/twenty` (first 100 results).
- Building blocks: GitHub API URLs in the table above; https://raw.githubusercontent.com/inngest/inngest/main/LICENSE.md · https://raw.githubusercontent.com/inngest/inngest-js/main/packages/inngest/LICENSE.md · https://registry.npmjs.org/inngest/latest · https://registry.npmjs.org/@trigger.dev/sdk/latest · https://registry.npmjs.org/@hello-pangea/dnd/latest · https://raw.githubusercontent.com/hello-pangea/dnd/main/LICENSE · https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE · https://raw.githubusercontent.com/activepieces/activepieces/main/LICENSE · https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md · https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE
