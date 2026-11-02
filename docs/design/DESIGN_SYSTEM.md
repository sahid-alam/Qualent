# Qualent: Design System

> **Replaced look, 2026-11-02:** the app now follows www.7gence.com, with no orange. `design/theme.css` is the source of truth for colors, radii and fonts. The Ember values below are history. The accessibility, layout and white-label rules still apply.

Status: v0.1 draft · Owner: design-system agent · Date: 2026-10-25
Companion files: [`design/theme.css`](../../design/theme.css) (Tailwind v4 drop-in) · [`design/tokens.json`](../../design/tokens.json) (DTCG tokens)

This system is extracted from the ROI-Maxi master inbox ("Ember" design) and improved for a multi-tenant, white-label CRM: UAE real estate first, then the US, in English and possibly Arabic. The goal is to **improve it, not redesign it**. The look should still read as Ember: warm near-black, pill controls, 26px panels, one ember-orange accent, and mono section labels.

All reference paths are relative to `/Users/sahidalam/Developer/7gence_client/roi-maxi-master-inbox/` (read-only). Anything marked **(opinion)** is a judgement call, not a measured fact. Every contrast ratio here was computed with the WCAG 2.x relative-luminance formula, with alpha layers composited onto the real panel colour.

---

## 0. TL;DR

- **Stack confirmed:** Next.js 15.5.19, React 19.2.7, Tailwind CSS 4.3.0 configured CSS-first through `@tailwindcss/postcss` (`postcss.config.mjs`, no `tailwind.config.js`), TypeScript 5.7, Supabase JS 2.108, lucide-react 1.25 (installed, but the live UI doesn't use it). All versions come from `package.json` and `node_modules/*/package.json`.
- **Identity in one line:** a warm near-black workspace (`#060505` / `#0a0908`) made of 26px-radius hairline panels and full-pill controls, lit by a single ember-orange gradient (`#ff8a4c → #e8410a`) with an orange glow, set in Geist with tiny Geist Mono uppercase section labels.
- **The live design is hand-rolled inline styles.** About 276 `rgba()` literals (83 unique), 22 distinct font sizes and 7 radii are repeated across 14 files. Tailwind is installed, but the Ember UI barely uses it.
- **Top fixes:**
  1. Turn the inline styles into tokens (`theme.css`).
  2. Fix the primary-button label contrast (2.34:1).
  3. Make the layout responsive and mobile-first. Today it has no `@media` queries and a `minWidth: 900`.
  4. Build the missing CRM primitives (semantic table, dialog/drawer, ARIA select, kanban).
  5. Add RTL and Arabic support, plus a server-validated tenant brand hook.

---

## 1. Sources studied

| Source | What it is |
|---|---|
| `app/globals.css` | Tailwind v4 `@theme` (an **older violet** palette, lines 3-42), plus Ember motion/focus helpers (lines 82-162) |
| `app/layout.tsx` | Loads Inter, Geist and Geist Mono through `next/font/google` (lines 5-21). Hardcodes `className="dark"` (line 34) |
| `app/page.tsx` | Renders `components/ember/EmberApp`. **Ember is the live UI** |
| `components/ember/ui.tsx` | Ember primitives and colour constants (source of truth in code) |
| `components/ember/EmberApp.tsx` | App shell, sidebar, toast, undo bar |
| `components/ember/*View.tsx` | Dashboard, Today (3-pane inbox), Replies (table-like list), Hot, Snoozed, Campaigns, Re-engage, Performance, Automations, History, Settings, Sign-in |
| `components/ember/data.ts` | Mock data, lead-temperature and status colour maps (lines 41-54), nav groups and icon paths (596+) |
| `components/ui.tsx`, `Select.tsx`, `App.tsx`, etc. | **Legacy** violet UI built on Tailwind utilities and lucide-react. No longer routed |
| `design_handoff_roi_maxi_dashboard/README.md` + `ROI-Maxi Ember v2.dc.html` | High-fidelity design handoff, marked "Fidelity: high … final" (README.md:20). It references `theme-tokens.css` from a sibling package, **but that file isn't in this repo** |
| `.impeccable/critique/2026-08-07…components-ember.md` | Earlier UX audit (22/40). Several of its fixes have already landed (undo send, `aria-live`, contrast bumps) |
| `ROI-Maxi_CRM_PRD.md` | Product context: GHL + n8n CRM, Instantly replies, AI scoring, pipeline, SMS, Slack alerts |

**Key finding: two design systems coexist.** The Tailwind `@theme` in `globals.css:3-42` (violet `#8071ff`, cool greys, Inter) is stale. The shipped UI is Ember: inline styles with constants in `ember/ui.tsx:8-45` and Geist forced in at `EmberApp.tsx:229`. The new project should start from Ember only.

---

## 2. Extracted system (what exists)

### 2.1 Colour

The theme is dark only. There is no light mode, and `<html class="dark">` is hardcoded (`layout.tsx:34`).

**Surfaces (Ember)**

| Role | Value | Source |
|---|---|---|
| App canvas (behind panels) | `#060505` | `EmberApp.tsx:227` |
| Panel | `#0a0908` | `ui.tsx:29` (`PANEL`) |
| Sidebar | `#100e0d` | `EmberApp.tsx:243` |
| Card on panel | `rgba(255,255,255,.02)` | `ui.tsx:34` (`CARD`) |
| Inner block | `rgba(255,255,255,.025)` | `ui.tsx:44` (`INNER`) |
| Highlight card | border `rgba(255,106,43,.22)`, `linear-gradient(160deg, rgba(255,106,43,.07), rgba(255,255,255,.015))` | `ui.tsx:36-40` |
| Input fill | `rgba(255,255,255,.04)` | `ui.tsx:326` |
| Secondary button fill | `rgba(255,255,255,.05)` | `ui.tsx:252` |
| Sunken (prompt box, select) | `rgba(0,0,0,.3)` / `.32` | `ui.tsx:355`, `SettingsView.tsx:163` |
| Toast / undo bar | `rgba(24,20,19,.92)` + `blur(20px)` | `EmberApp.tsx:804-806`, `741` |
| Row hover | `rgba(255,255,255,.025)` | `globals.css:117` |

**Borders:** hairline `rgba(255,255,255,.07)` (`ui.tsx:28`, 76 uses in the handoff). Strong `.09` (`ui.tsx:253`). Card hover `.18` (`globals.css:122`). Brand border `rgba(255,106,43,.22–.4)` (`ui.tsx:38`, `EmberApp.tsx:740`).

**Text ramp** (`ui.tsx:11-20`): `TXT #f6f3f0`, `SOFT #c8c0bb`, `SOFT2 #b8afaa`, `MUT #8d8480`, `FAINT #8a817c`, `DIM #7f7772`. Also used ad hoc: idle nav `#9d948f` (`EmberApp.tsx:506`) and quote text `#e0d9d5` (handoff README.md:128). The handoff file still carries the older failing values `#6b635f` and `#5d5551`. `ui.tsx:14-17` documents why they were raised.

**Brand / accent** (`ui.tsx:8-10`): `ACCENT #ff6a2b`, `ACCENT_L #ff8a4c`, `GRAD linear-gradient(135deg,#ff8a4c,#e8410a)`. Glow colour is `rgba(255,86,20,.6–.9)` (`ui.tsx:237`, `EmberApp.tsx:280,515`). Links are `#ff8a4c`, hover `#ffa671` (handoff `.dc.html:16`).

**Feedback** (`ui.tsx:21-23`): `GOOD #45c08a`, `WARN #e0a94a`, `BAD #ec6360`. Info isn't defined in Ember; the legacy theme had `#52b4de` (`globals.css:26`).

**Lead temperature** (`data.ts:41-45`), each with its own tint and border:

| Temp | Text | Fill | Border |
|---|---|---|---|
| Hot | `#ff8a4c` | `rgba(255,106,43,.14)` | `rgba(255,106,43,.3)` |
| Warm | `#c9a15c` | `rgba(224,169,74,.12)` | `rgba(224,169,74,.26)` |
| Cold | `#7fa3c9` | `rgba(111,159,208,.1)` | `rgba(111,159,208,.24)` |

**Status** (`data.ts:47-54`): new and draft-ready use accent, sending and snoozed use warn, replied uses good, skipped uses muted.

**Decorative:** a hero wash (`radial-gradient(110% 100% at 22% 0%, rgba(255,86,20,.30) …)`, README.md:71-73). The sign-in screen layers an orange and a violet (`rgba(120,60,220,.2)`) radial with 3px scanlines (`.dc.html:27-28`). Avatar fills are `hsl(hash 45% 30%)` (`ui.tsx:49-53`).

**Legacy violet theme** (`globals.css:5-26`), for the record: bg `#09090b`, surfaces `#121216/#191920/#22222b`, borders `#26262d/#34343d`, text `#f3f3f5/#9b9ba6/#6a6a76`, accent `#8071ff`. **Not carried forward.**

### 2.2 Typography

- **Families:** Geist is the UI font (`EmberApp.tsx:229`: `var(--font-geist), var(--font-inter), system-ui`). Geist Mono is used for labels, keycaps and prompt boxes (`ui.tsx:24`). Inter is still loaded (`layout.tsx:5-9`), but only as a fallback. All three come from `next/font/google` with `display: swap` (`layout.tsx:5-21`). The handoff loads them from the Google Fonts CSS API instead (`.dc.html:13`).
- **Sizes:** 22 distinct px values in `components/ember`, many of them fractional. Frequency: 9.5 (4), 10 (12), **10.5 (26)**, 11 (17), **11.5 (44)**, **12 (41)**, **12.5 (35)**, **13 (33)**, 13.5 (22), 14 (5), 14.5 (7), 15 (5), 16 (2), 17, 18, 19 (3), 20, 22 (10), 24, 27, 30 (2), 34. All are in px, so they don't scale with the user's font-size preference.
- **Named roles:** hero 34/600/-0.03em/1.15 (README.md:94). View title 19/600/-0.02em (`TodayView.tsx:216`). Card name 17/600 (README.md:126). Body 13–13.5. Meta 11–12. Mono section label 9.5px, uppercase, `.12em` tracking, `DIM` (`ui.tsx:150-164`, README.md:82). Stat values 22–30/600/-0.03em. Tabular numbers on badges (`EmberApp.tsx:535`).
- **Weights:** 400, 500, 600, plus 700 for the logo mark only.
- **Line height:** mostly inherited. Explicit values: 1.15 (hero), 1.2 (sidebar identity), 1.6 (quote, editor at `globals.css:167`), 1.75 (prompt box, `ui.tsx:357`). Headings get `letter-spacing: -0.014em` (`globals.css:58-62`).

### 2.3 Spacing and layout metrics

There's no scale; everything is literal px. Shell gap and padding are 10 (`EmberApp.tsx:225-226`). Panel content is padded `34px 30px 40px` with a max width of 1120 (README.md:66). Cards use 22 or `20px 22px` padding (README.md:121,158), and section grids a 14px gap (README.md:78). Gaps seen in code: 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 22, 26.

### 2.4 Radius

| Value | Uses (ember) | Role |
|---|---|---|
| 999 | 126 | Every button, chip, input, toggle, nav item, badge, toast |
| 26 | 11 | Panels, sidebar, cards (`ui.tsx:27,32,37`) |
| 24 | 4 | Glance and campaign tiles (README.md:109,197) |
| 22 | 13 | Inner blocks, table wrapper, prompt box (`ui.tsx:42,353`) |
| 20 | 4 | List rows (README.md:146) |
| 34 | 1 | Sign-in glass card (`.dc.html:29`) |

### 2.5 Shadows and elevation

Ember is mostly **flat**, separated by hairlines. Shadows show up only on floating layers and as **orange glows**:

- Primary glow: `0 8px 22px -9px rgba(255,86,20,.9)` (`ui.tsx:237`). Larger CTA version: `0 10px 26px -8px rgba(255,86,20,.85)` (`.dc.html:133`).
- Active nav: `0 4px 16px -6px rgba(255,86,20,.6)` (`EmberApp.tsx:515`).
- Toast: `0 18px 44px -14px rgba(0,0,0,.85)` (`EmberApp.tsx:807`).
- Sign-in card: `0 30px 80px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.1)` (`.dc.html:29`).
- Live dot: `0 0 8px 1px rgba(69,192,138,.7)` (`EmberApp.tsx:628`). Alert dot: `0 0 8px 2px rgba(255,106,43,.8)` (`EmberApp.tsx:562`).
- The legacy `--shadow-card/pop/float/glow` tokens are in `globals.css:38-41`.

### 2.6 Motion

- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` (`EmberApp.tsx:37`, `globals.css:103-106`) and plain `ease` for hover.
- Durations: press 120ms with `scale(.97)` (`globals.css:110-112`). Hover colour 150ms. Pop-in 160ms. Fades 200–220ms. Toast 240ms. Card entry 260ms. View entry and sidebar collapse 300ms (`EmberApp.tsx:247`).
- Keyframes `emIn`, `emPop`, `emSpin` and `emToast` (`globals.css:87-101`). Card hover lifts `-2px` (`globals.css:122`).
- `prefers-reduced-motion` is respected (`globals.css:151-162`).
- Sidebar collapse: the rail width animates while labels fade and slide (`EmberApp.tsx:38-46`), and the search box collapses with a `grid-template-rows` 1fr→0fr trick (`EmberApp.tsx:353-359`).

### 2.7 Components (as built)

| Component | Variants and states | Source | Notes |
|---|---|---|---|
| Button | primary (gradient + glow, 40/46), secondary (glass, 36/44), ghost (outline), accent-ghost pill (26), icon-round (28/34) | `ui.tsx:226-279`, `EmberApp.tsx:304-321` | Press scale, hover brightness (`globals.css:108-124`). No disabled or loading tokens. Spinner exists only in the undo bar |
| Input | pill 42 (`inputPill`), label 11.5 offset 16px | `ui.tsx:319-338` | Inline `outline:none`, so the focus ring had to be restored globally (`globals.css:126-137`) |
| Search | pill 38 with icon, ⌘K keycap and clear button | `EmberApp.tsx:361-447` | ⌘K focuses it (`EmberApp.tsx:126-136`) |
| Select / dropdown | custom button + list (Settings model picker) | `SettingsView.tsx:153-170` | No `aria-expanded`, no listbox role, no arrow keys. Legacy `Select.tsx` has Escape only (line 34) and **no ARIA at all** |
| Toggle | 40×22 switch, gradient when on | `ui.tsx:168-222` | Correct `role="switch" aria-checked` |
| Segmented control / tabs | 31px pills, active = inverse (light fill, dark text) | `ui.tsx:282-303`, `TodayView.tsx:224-259` | Has `role="tab"` + `aria-selected`, but no `tablist` or arrow-key handling |
| Filter chip | 31px, active = accent tint | `ui.tsx:306-317`, `RepliesView.tsx:137-148` | `aria-pressed` ✓ |
| Badge / pill | nav count, alert badge (orange), temperature pill, score pill (mono 10), status text | `EmberApp.tsx:532-566`, `data.ts:41-54` | White on `#ff6a2b` = 2.86:1 |
| Avatar | initials on hashed hue, 30/34/36 | `ui.tsx:117-146` | Initials ≥5.28:1 at every hue ✓ |
| Score ring | conic gradient, 64px | `ui.tsx:61-62`, `DashboardView.tsx:267`, `TodayView.tsx:1022` | Signature element |
| Mono label | 9.5px uppercase tracking | `ui.tsx:150-164` | Carries the information architecture |
| Card / panel | PANEL, CARD, CARD_HL, INNER | `ui.tsx:26-45` | Hover lift via `.em-card` |
| Table | CSS-grid "table" built from `<button>` rows, mono header | `RepliesView.tsx:10,151-215` | **No `<table>`**: no sorting, sticky header, selection or column control |
| Sidebar / nav | 232px wide, 76px icon rail, grouped (`OVERVIEW / QUEUES / OUTBOUND / SYSTEM`) | `EmberApp.tsx:234-633`, `data.ts:596+` | `<nav aria-label>` + `aria-current` ✓ |
| Toast | bottom-centre pill, 2.8s | `EmberApp.tsx:786-826`, `80-84` | `role="status" aria-live="polite"` (`EmberApp.tsx:714`) ✓ |
| Undo bar | 6s send hold with Undo | `EmberApp.tsx:156-180,724-784` | Good pattern; keep it |
| Menu (⋮) | fixed full-screen click-catcher | `TodayView.tsx:578-630` | No Escape, no focus management |
| Modal / drawer | **none** | `grep '<dialog\|role="dialog"'` returns 0 in `components/ember` | Must be built |
| Empty states | inline text, plus a "Queue clear" card on the Dashboard | `DashboardView.tsx:437-439`, `TodayView.tsx:306-310`, `RepliesView.tsx:182` | Legacy `EmptyState` at `components/ui.tsx:241` |
| Skeleton | **none in Ember** (the handoff asks for real-shape skeletons, README.md:263) | legacy `components/ui.tsx:196` | |

### 2.8 Layout patterns

- **App shell:** a `100vh` flex with 10px gap and padding on `#060505`. Floating 26px panels sit on top (`EmberApp.tsx:218-232`).
- **Inbox, 3 panes** (Today): queue 348px (`TodayView.tsx:205`), thread `flex:1; min-width:420` (`TodayView.tsx:495-496`), lead-detail rail 280px (`TodayView.tsx:993`). Keyboard: J/K to move, E to snooze, ⌘↵ to approve (`TodayView.tsx:146-160`).
- **Dashboard:** hero (sentence headline plus glance tiles), then a `1.45fr 1fr` body (`DashboardView.tsx:234`), then a 4-up campaign-health row (`DashboardView.tsx:696`). Elsewhere: `repeat(auto-fill,minmax(300px,1fr))` cards (`HotView.tsx:90`) and a 4-up KPI grid (`PerfView.tsx:86`).
- **Responsiveness** is JS-driven. `vw < 1400` collapses the sidebar to the rail and `vw < 1240` folds the score rail (`EmberApp.tsx:67-78`). `minWidth: 900` (`EmberApp.tsx:222`). The only `@media` query is reduced-motion.

### 2.9 Icons and technical approach

- **Icons:** a hand-rolled `<I d=[paths]>` component with the `IC` map (`ui.tsx:66-113`) and nav icon paths in `data.ts:596+`. These are Lucide paths (24 grid, stroke 2, round caps, sizes 11–17). `lucide-react` is installed and used by the legacy UI (`components/ui.tsx`, `App.tsx`, …).
- **Styling:** about 95% inline `style={{}}` objects with shared constants. Tailwind is used only for the legacy UI and the global layer. No component library: everything is hand-rolled. The rationale is in `ui.tsx:3-4` ("inline-styled to stay 1:1 with the design comp").

---

## 3. Improvements: consistency

| # | Gap | Evidence | Fix |
|---|---|---|---|
| C1 | Inline styles everywhere, no tokens | About 276 `rgba()` literals (83 unique) and 32 distinct hex values in `components/ember/*.tsx` | Tokens in `theme.css`, written as Tailwind utilities (`bg-panel border-line rounded-panel`) |
| C2 | Two palettes in one repo | `globals.css:3-42` (violet) vs `ui.tsx:8-23` (ember) | Ember only |
| C3 | 22 font sizes, fractional px | §2.2 | 10-step rem scale, 11px floor (`--text-2xs` … `--text-4xl`) |
| C4 | Text ramp steps that can't be told apart | `MUT` 5.44 vs `FAINT` 5.22 vs `DIM` 4.53:1 | Collapse to `fg / fg-soft / fg-muted` plus `fg-disabled` (opinion) |
| C5 | One radius for everything (critique: "one radius carries no information") | 999 ×126 | Keep pills for controls and 26 for panels (signature). Add `dense` 10 and `menu` 14 for data rows and menus (opinion) |
| C6 | Duplicated gradients | `#ff8a4c→#e8410a` re-typed in `EmberApp.tsx:279`, `HistoryView.tsx:144`, `DashboardView.tsx:743`, `SettingsView.tsx:640` | `--gradient-accent`, `--gradient-bar(-h)` |
| C7 | 11 control heights (26–48) | §2.7 | 4 sizes: `--control-sm/md/lg/xl` (32/40/44/48) |
| C8 | Icon system duplicates a dependency | `ui.tsx:66-113` vs installed lucide-react | Use `lucide-react` directly (stroke 2, size 16/18) |
| C9 | "Hot" colour is the brand colour | `data.ts:42` uses `ACCENT_L` | Pin lead temperature colours so they're independent of the tenant brand |
| C10 | Hover and transition helpers rely on `!important` overrides | `globals.css:117,122` | Tailwind `hover:` with tokens; no `!important` |

---

## 4. Improvements: accessibility

### 4.1 Contrast, measured (dark panel `#0a0908`)

| Pair | Ratio | Result |
|---|---|---|
| `fg #f6f3f0` on panel | 18.00 | ✓ |
| `fg-soft #c8c0bb` | 11.10 | ✓ |
| `MUT #8d8480` on panel / card | 5.44 / 5.28 | ✓ |
| `DIM #7f7772` on panel / **card** | 4.53 / **4.40** | ✗ on cards |
| Handoff `FAINT #6b635f` / `DIM #5d5551` | 3.39 / 2.73 | ✗ (already fixed in code, `ui.tsx:14-20`; the handoff HTML is stale) |
| Idle nav `#9d948f` on sidebar | 6.48 | ✓ |
| Accent `#ff8a4c` on panel / on chip tint | 8.52 / 7.40 | ✓ |
| Good / warn / bad / warm / cold on panel | 8.68 / 9.42 / 6.18 / 8.28 / 7.56 | ✓ |
| **White on gradient `#ff8a4c` / `#e8410a`** | **2.34 / 4.04** | ✗ every primary button |
| **White on nav badge `#ff6a2b`** | **2.86** | ✗ |
| Inverse segment `#0a0908` on `#f6f3f0` | 18.00 | ✓ |
| Focus ring `rgba(255,138,76,.75)` (UI, 3:1) | 5.12 | ✓ |
| **Input border `.09` vs panel** (UI, 3:1) | **1.21** | ✗ (control boundary) |
| **Toggle-off track `.1`** (UI, 3:1) | **1.25** | ✗ |
| Panel hairline `.07` vs canvas | 1.13 | n/a (decorative, not covered by 1.4.11) |
| White initials on avatar, worst hue | 5.28 | ✓ |
| Legacy: white on `#8071ff` / faint `#6a6a76` | 3.67 / 3.50 | ✗ (not carried forward) |

**Fixes (built into the tokens):**

1. **Primary label (opinion):** keep the bright gradient, which is the most-repeated identity element (`#ff8a4c` ×57, `#e8410a` ×26 in the handoff), and switch the label to ink `#1a0f0a`. That gives **8.05 / 4.65:1**. Ember already uses dark-on-light for the active segment, so this isn't foreign. It's also the same rule white-label needs: bright brands get ink, dark brands get white. Alternative if stakeholders insist on white labels: deepen the gradient to `#cd4800 → #b12c00` (white 4.63 / 6.49:1). It's in `tokens.json` as `component.button.primary-alt`.
2. **Badges:** the same ink label on `#ff6a2b` gives 6.58:1.
3. **Control boundaries:** new `--line-control` at `rgba(255,255,255,.36)` (3.24:1) for inputs, checkboxes and the toggle-off track. Hairlines stay at `.07`. **Don't "fix" every border.** WCAG 1.4.11 covers only the boundaries that identify a control. This is a visible change to inputs **(opinion: it's needed; Ember's 1.21:1 inputs are hard to find for low-vision users)**.
4. Merge `FAINT`/`DIM` into `fg-muted #8d8480`. That's the lowest text step, ≥5.28:1 on every dark surface.
5. Light theme: every pair re-measured (§5, `theme.css` comments).

### 4.2 Focus, keyboard, ARIA

- **Focus:** keep the global `:focus-visible` 2px outline with 2px offset (`globals.css:128-137`), now `var(--ring)`, which is tenant-safe (§9). Never set `outline:none` inline; Ember had to undo exactly that.
- **Text size:** use rem, not px (C3). Px text ignores the browser's font-size setting (1.4.4).
- **Targets:** at least 44px on `pointer: coarse`. The critique counted 71 sub-44px targets. `theme.css` raises `--control-sm/md` and `--row-h` automatically on touch devices.
- **Keyboard shortcuts:** scope single-key shortcuts (J/K/E) to a focused list container, never `window`, because they collide with screen-reader quick-nav keys (critique P1). Also provide a `?` shortcut sheet. Keep ⌘K, but make it a real command palette (`role="dialog"` + `combobox`).
- **Patterns to build correctly from the start:**
  - Select: a native `<select>` for simple cases. Otherwise the WAI-ARIA *listbox* pattern: `aria-expanded`, `aria-controls`, `aria-activedescendant`, arrow, Home/End and type-ahead keys, Escape to close.
  - Tabs: `role="tablist"` with arrow keys and roving tabindex. Today's segmented tabs (`TodayView.tsx:242`) lack the tablist.
  - Menus: `role="menu"`, Escape closes, focus returns to the trigger. Replaces the click-catcher at `TodayView.tsx:593`.
  - Modal and drawer: the native `<dialog>` with `showModal()` gives you focus trap, Escape and the inert background for free (opinion: no dialog library needed).
  - Data table: a real `<table>` with `<th scope>`, `aria-sort` on sortable headers, and row-select checkboxes with labels. Bulk actions are announced through the existing `role="status"` region.
  - Live region: keep the global polite region (`EmberApp.tsx:714`) and route every toast through it.
- **Landmarks:** `<nav>` exists. Add `<main>`, one `<h1>` per view, and a skip link.

---

## 5. Light theme (new; proposed)

Ember was dark only. A light theme is needed for daylight use (sales reps outdoors in the Gulf), for tenants whose brand is light, and for print. Light uses warm "paper" neutrals that mirror the warm-black ramp, so it still feels like the same family **(opinion)**.

| Token | Light | On panel `#fdfcfb` | On card |
|---|---|---|---|
| fg | `#1c1816` | 17.20 | 16.37 |
| fg-soft | `#3f3935` | 11.09 | 10.56 |
| fg-muted | `#6b625d` | 5.81 | 5.53 |
| accent / ring (Ember) | `#b93d0a` | 5.49 | 5.22 |
| good / warn / bad / info | `#1d7a52` / `#8f5f0c` / `#c0352f` / `#2f6f95` | 5.18 / 5.38 / 5.41 / 5.35 | ≥4.93 |
| hot / warm / cold | `#b93d0a` / `#8a6420` / `#3c6693` | 5.49 / 5.22 / 5.83 | ≥4.9 |
| line-control | `#8f8781` | 3.44 (UI) | 3.28 |

Light charts use deeper series colours (`#3f72a8`, `#23895c`, `#a8770f`, `#7356d6`, `#c24676`, plus the resolved brand text). Each is ≥3.86:1 on the light panel. Dark charts reuse the Ember brights, each ≥6.17:1.

---

## 6. Improvements: responsive and mobile

**Today:** no CSS breakpoints, a JS `vw` state with two floors, `minWidth: 900` (`EmberApp.tsx:222`). Mobile is impossible.

**Target (mobile-first, CSS-only; Tailwind breakpoints plus `desk` 1240 and `wide` 1400 from `theme.css`):**

| Width | Shell | Inbox | Tables |
|---|---|---|---|
| < 640 (`base`) | No sidebar. **Bottom tab bar** (Today, Inbox, Pipeline, Leads, More), 56px plus `env(safe-area-inset-bottom)`. Panels go edge to edge with radius 0 at the screen edge (opinion) | **Stacked navigation:** list → thread → details as a bottom sheet (`<dialog>`). Back is a mirrored chevron | Rows become **cards** (name, temperature pill, next action, last touch). Bulk select by long-press, or a "Select" toggle in the header |
| 640–1023 (`sm`/`md`) | 76px icon rail | Queue + thread; details in a drawer | Table with priority columns; others behind a column chooser |
| 1024–1399 (`lg`/`desk`) | Rail; full sidebar on demand | 3 panes, details folded into a disclosure below 1240 (existing behaviour) | Full table |
| ≥ 1400 (`wide`) | 232px sidebar | 348 / flex / 280 | Full table + side preview |

Rules:

- Action footers (Approve & send, Call, WhatsApp) are `position: sticky; bottom: 0` inside the pane, and sit above the bottom bar on mobile.
- Inputs use `--text-input-mobile` (16px) on touch devices so iOS doesn't zoom on focus.
- Use `100dvh`, not `100vh` (the iOS URL bar).
- Use container queries (`@container`) for cards that appear both in a narrow rail and in a wide grid.
- Mobile quick actions for UAE reps (opinion): one-tap **Call**, **WhatsApp**, **Email** on every lead row and detail header, because WhatsApp is the dominant channel in UAE real estate.

---

## 7. CRM views needed (not in Ember)

Ember is a reply-triage inbox. A CRM also needs the following. Each spec reuses existing tokens.

1. **Data table** (Leads, Contacts, Deals, Listings)
   - A semantic `<table>` in a `rounded-card` wrapper.
   - **Sticky header:** `position: sticky; top: 0`, `bg-panel`, mono `text-2xs tracking-label` header like `RepliesView.tsx:160-178`.
   - **Sorting:** click the header, cycling asc → desc → none, with `aria-sort`.
   - **Column chooser:** a menu of checkboxes plus drag to reorder, persisted per user per view.
   - **Bulk select:** a checkbox column, header tri-state, "Select all 1,240 matching", and a floating bulk bar that reuses the undo-bar styling (`EmberApp.tsx:724-784`).
   - **Density:** `data-density="compact|default|comfortable"` gives 36 / 44 / 52px rows (`--row-h`).
   - Frozen first column (name) on horizontal scroll, using `inset-inline-start: 0` so it works in RTL.
   - Inline edit on double-click. Number columns: `font-variant-numeric: tabular-nums` and `text-align: end`.
   - Virtualise above about 200 rows.
2. **Kanban pipeline** (stages: New → Contacted → Viewing → Offer → Won/Lost for real estate)
   - Columns 280–300px wide in `bg-card rounded-card`. Header: stage name, count, sum (AED), plus a 3px top rule in a stage colour.
   - Cards: `bg-inner rounded-tile`, avatar, name, property or budget, temperature pill, next-task due date (`text-bad` when overdue).
   - Drag and drop **with a keyboard alternative**: a "Move to…" menu, and Space to lift with arrows to move, announced through the live region.
   - Horizontal scroll follows the reading direction (RTL flips the column order automatically with flex and logical props).
3. **Filter bar + saved views**
   - A chip row (existing `chip` style) where each chip is a field/operator/value popover, followed by "+ Filter".
   - Saved views as tabs (`tablist`) above the table: "My hot leads", "Unassigned", "Viewing this week". Each saves filters, columns, sort and density.
   - Views can be scoped per user or per team, and a URL-serialisable state lets users share them.
4. **Unified inbox**
   - Ember's Today, generalised to Email, WhatsApp, SMS and portal enquiries (Bayut, Property Finder, Dubizzle).
   - Channel icon on every row. The queue tabs (Needs reply / Waiting / Done) stay.
   - Keep: the score rail, "then jumps to…", and the 6s undo send.
5. **Dashboards / charts**
   - Keep the split between the Dashboard ("what do I do now", README.md:36-45) and Performance (analytics).
   - Chart tokens are `chart-1…6` and `chart-grid`.
   - Rules (opinion): bars never use pill radius on the value axis (critique: `PerfView.tsx:81`). Axes start at 0. Every series ≥3:1 against the panel. Values are formatted with `Intl` (§8).
6. **Record detail page** (lead, contact, deal, property)
   - Desktop: header (avatar, name, temperature, owner, stage stepper, quick actions), then 2 columns. Left: an **activity timeline** of emails, WhatsApp, calls, notes, stage changes and AI scores, grouped by day, with sticky day labels and a composer at the top. Right: fields in collapsible sections, plus related deals and listings.
   - Mobile: header, then tabs (Activity / Details / Related).
   - The timeline's vertical rule and dots use `border-inline-start`, so they mirror in RTL.

---

## 8. RTL and Arabic

**Layout rules**

- Set `<html dir="rtl" lang="ar">` per user locale. Tailwind v4 ships logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `rounded-s-*`) and the `rtl:`/`ltr:` variants.
- **Ban physical classes** (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`) with a lint rule. Ember has physical values that need converting, e.g. `textAlign: "left"` (`EmberApp.tsx:503`), `margin: "0 0 6px 16px"` (`ui.tsx:337`) and `left: on ? 20 : 2` on the toggle knob (`ui.tsx:211`).
- **Transforms aren't logical.** Ember's sidebar label slide is `translateX(-6px)` (`EmberApp.tsx:40`). Use `calc(-6px * var(--dir))`; `theme.css` sets `--dir: -1` under `[dir=rtl]`. The toggle knob should use `inset-inline-start`.
- **Mirror** directional icons with `rtl:-scale-x-100`: chevrons, arrows, back/forward, send, reply, undo/redo, "list with indent", the sidebar-collapse chevron, progress bars and sliders. **Don't mirror** clock, search, check, plus, play/media, phone, logos, charts' time axis (opinion: keep time left→right in charts; it's the common convention in Gulf business apps), or the ⌘K keycap.
- **Bidi isolation:** wrap phone numbers, emails, URLs, listing refs and English names inside Arabic text in `<bdi>` or `unicode-bidi: isolate`. Phone and email inputs get `dir="ltr"`.
- Centred toasts are direction-neutral. `theme.css` drops the old `translate(-50%)` centring for `inset-inline` + `margin-inline: auto`.

**Font pairing (checked on Google Fonts, 2026-10-25)**

| Font | Weights | Fit |
|---|---|---|
| **IBM Plex Sans Arabic** (recommended) | 100–700, static | UI-oriented, open counters, moderate x-height. Designed as a companion to a neo-grotesque Latin, so it sits well next to Geist. Load 400/500/600/700 through `next/font/google` (`IBM_Plex_Sans_Arabic`, variable `--font-arabic`) |
| Noto Sans Arabic (fallback) | 100–900 | Widest glyph coverage (Persian/Urdu letters for staff and customer names), neutral |
| Cairo | 200–900 | Geometric and friendly, big and wide. Good for marketing headlines, but its wide forms waste space in dense tables **(opinion: not for UI body)** |

- **Order:** `Geist, IBM Plex Sans Arabic, …`. Latin keeps Geist and Arabic glyphs fall through to Plex, so mixed strings look right.
- `:lang(ar)` sets **all letter-spacing to 0** (tracking breaks Arabic joins; Ember's `-0.02em` headings and `.12em` labels would damage text) and raises line-heights to 1.7–1.75 for body and about 1.45 for headings (`theme.css` section 6).
- Uppercase mono labels have no Arabic equivalent. Render them in the sans font at `text-2xs`, weight 600 (opinion).
- Check the visual size: Arabic at the same px often looks smaller. If it does, bump `:lang(ar)` body by one step instead of per-component fixes.

**Numbers, dates, currency (decisions)**

- **Digits:** Western digits (0–9) by default, even in Arabic UI, which is standard in UAE business software. Pin it explicitly: `new Intl.NumberFormat('ar-AE-u-nu-latn')`, so the result doesn't depend on the CLDR default. Make it a per-tenant setting (`latn` / `arab`).
- **Currency:** `Intl.NumberFormat(locale, { style: 'currency', currency: 'AED' })`. Store minor units as integers. The US uses USD. Abbreviate large property prices with `notation: 'compact'` (e.g. "AED 2.4M").
- **Dates:** Gregorian (`-u-ca-gregory`). Week starts Monday in the UAE (Saturday–Sunday weekend since 2022) and Sunday in the US. Time zone is per user (Asia/Dubai, America/*). Relative times through `Intl.RelativeTimeFormat`.
- **Phones:** store E.164 (`+9715…`) and format for display with libphonenumber. Always LTR.

---

## 9. White-label theming

**What a tenant may change:** brand colour, logo (light and dark variants), and a display font for headings and the logo wordmark. **What a tenant may not change:** neutrals, text ramp, feedback colours (good/warn/bad/info), lead-temperature colours, radii, spacing and the body font. That keeps every tenant accessible and recognisably the same product.

**Mechanism (runtime, no rebuild):**

1. The tenant saves a brand colour in settings.
2. **The server resolves the contrast-critical set once, at save time,** and stores it:
   - `--brand` (raw, as entered)
   - `--brand-solid-from`, `--brand-solid-to`: gradient stops. Start from the brand in OKLCH; stops at L+0.04 and L-0.06, chroma capped at 0.2 and gamut-mapped.
   - `--brand-on-solid`: `#ffffff` or ink `#1a0f0a`, whichever gives the higher **minimum** contrast across both stops. If that minimum is below 4.5, lower or raise the stops' L until it passes.
   - `--brand-text-dark`: brand at OKLCH L≈0.78–0.80, C≤0.14. Measured ≥8.9:1 on dark panel and card across all hues.
   - `--brand-text-light`: brand at OKLCH L≈0.48, C≤0.16. Measured ≥5.04:1 on light panel and card across all hues.
   - Reject the save, or show the adjusted swatch with "we adjusted this for readability". Never silently ship a failing pair.
3. On each request the layout prints them inline: `<html data-theme="dark" dir="rtl" lang="ar" style="--brand:#1f6feb;--brand-solid-from:…;…">`.
4. `theme.css` derives only the **non-critical** values in CSS with `color-mix()`: soft tint 13%, tint border 30%, glow 85%, hero wash, selection colour.

**Why CSS doesn't derive the critical values:** I swept every hue, chroma and lightness for a pure-CSS black/white label switch (OKLCH threshold on the brand's L). The best possible worst case was **3.05:1**, which fails AA. The OKLCH lightness of chromatic colours drifts too far from WCAG luminance, and gamut clipping makes it worse. So server-side resolution is the only path that *guarantees* contrast. With no tenant overrides, the defaults are Ember and already verified.

**Reference resolver sketch (server, TypeScript; library choice open, e.g. `culori`):**

```ts
// ponytail: one pure function, run on save; result stored on the tenant row.
// toOklch / gamutMapToHex / contrast come from a colour lib (e.g. culori + a 10-line WCAG ratio).
const INK = "#1a0f0a", WHITE = "#ffffff";
function resolveBrand(hex: string) {
  const { l, c, h } = toOklch(hex);
  const at = (L: number, C: number) => gamutMapToHex({ l: Math.min(Math.max(L, 0), 1), c: C, h });
  const stops = (L: number) => [at(L + 0.04, Math.min(c, 0.2)), at(L - 0.06, Math.min(c, 0.2))] as const;
  const worst = (fg: string, [a, b]: readonly [string, string]) => Math.min(contrast(fg, a), contrast(fg, b));

  let s = stops(l);
  const on = worst(WHITE, s) >= worst(INK, s) ? WHITE : INK;
  for (let shift = 0.02; worst(on, s) < 4.5 && shift <= 0.4; shift += 0.02) {
    s = stops(on === WHITE ? l - shift : l + shift); // push the fill away from its label
  }
  return {
    brand: hex, solidFrom: s[0], solidTo: s[1], onSolid: on,
    textDark: at(0.79, Math.min(c, 0.14)),  // >=8.9:1 on dark panel/card (swept)
    textLight: at(0.48, Math.min(c, 0.16)), // >=5.04:1 on light panel/card (swept)
  };
}
// The one check: a unit test sweeping hue 0-355 x chroma {.05,.12,.2,.3} x L {.3..0.9}
// asserting every returned pair >= 4.5:1.
```

**Other tenant rules**

- **Never put text on raw `--brand` (`bg-brand`).** `--brand-on-solid` is verified only against the two gradient stops. Solid fills are `bg-(image:--gradient-accent) text-on-accent`. Badges and counts use the soft pair `bg-accent-soft text-accent` (7.40:1). Charts use the resolved `--brand-text-*` as series 1, not the raw brand.

- **Focus ring** is `--ring` = the resolved brand text, so it's always ≥4.5:1 (well above the 3:1 non-text minimum). If a tenant's brand text was adjusted, the ring follows the adjusted value.
- **Logo:** upload SVG or PNG, light and dark variants, max height 32px in the sidebar and 40px on sign-in. Fallback is the Ember round monogram (`EmberApp.tsx:260-287`) filled with the brand gradient and initials in `--brand-on-solid`.
- **Display font:** `--brand-font`, from an allow-list (Google Fonts with Arabic coverage if the tenant uses Arabic). Applies only to `font-display` (headings, wordmark). Body stays Geist + Plex Arabic for legibility and coverage **(opinion)**.
- **Favicon, email templates, PDFs** read the same resolved values from the tenant row.
- **"Hot" stays orange** for every tenant (C9).

---

## 10. Token naming conventions

- **Three tiers:**
  - **Primitive:** raw values; only in `tokens.json` comments and sources.
  - **Semantic:** `--panel`, `--fg-muted`, `--line-control`, `--good`, `--lead-hot`. These are the only values components use.
  - **Component:** dimensions only, in `tokens.json > component`.
- **CSS vars:** kebab-case, role-first, no colour names (`--fg-muted`, never `--grey-500`). State as a suffix: `-hover`, `-soft` (tint fill), `-line` (tint border). Pairs: `on-*` for the foreground on a fill (`--on-inverse`, `--brand-on-solid`, `--on-bad`).
- **Tailwind utilities** come from `@theme inline`: `bg-panel`, `bg-card`, `text-fg-muted`, `border-line`, `border-line-control`, `text-accent`, `bg-accent-soft`, `text-on-accent`, `bg-hot-soft text-hot border-hot-line`, `rounded-panel/card/tile/row/menu/dense/tight/modal`, `rounded-full` for pills, `text-2xs … text-4xl`, `tracking-label`, `shadow-glow`, `shadow-pop`, `ease-ember`, `animate-view/in/pop/toast`, `font-display`, and the breakpoints `desk:` and `wide:`.
- **Non-theme vars** use the v4 arbitrary-var syntax: `h-(--control-md)`, `w-(--w-sidebar)`, `duration-(--dur-fast)`, `bg-(image:--gradient-accent)`, `z-(--z-modal)`.
- **Modes** are `data-theme="dark|light"`, density is `data-density`, direction is `dir`, and locale is `lang`, all on `<html>`. `dark:` is bound to `data-theme` through `@custom-variant`.
- `theme.css` was compile-tested with `@tailwindcss/cli` 4.1.18: every utility above is generated.

---

## 11. Component inventory: v1 priority

P0 = needed for the first usable release. P1 = needed for the full v1 CRM. P2 = after v1.

| Component | Priority | Build note |
|---|---|---|
| App shell (sidebar ↔ rail ↔ bottom bar) | P0 | Port `EmberApp.tsx:234-633` to CSS breakpoints. Keep the collapse animation, but animate `transform`/`grid-template` rather than `width` |
| Button (primary / secondary / ghost / danger / icon; sm–xl; loading; disabled) | P0 | Ink label on gradient (§4.1). Loading = inline spinner (`emSpin`) |
| Input, textarea, search, field + label + help + error | P0 | Pill single-line, `rounded-card` textarea. `line-control` border. Error = `text-bad` + `aria-describedby` |
| Select / combobox (single, multi, async) | P0 | Native `<select>` first. ARIA listbox/combobox for search and multi |
| Checkbox, radio, toggle | P0 | Toggle from `ui.tsx:168-222` with the knob converted to logical props |
| Badge / pill (temperature, status, count, score) | P0 | Tokens `hot/warm/cold`, `good/warn/bad/info` |
| Avatar (+ group) | P0 | Keep the hashed hue (`ui.tsx:49-53`) |
| Data table (sort, sticky header, select, bulk bar, column chooser, density) | P0 | §7.1 |
| Filter bar + saved views | P0 | §7.3 |
| Toast + undo bar + live region | P0 | Port `EmberApp.tsx:724-826` |
| Dialog / drawer / bottom sheet | P0 | Native `<dialog>` |
| Menu / popover / tooltip | P0 | `rounded-menu`, `bg-overlay`, `shadow-pop`, Escape and focus return |
| Tabs / segmented control | P0 | `tablist` with arrow keys |
| Empty state + skeleton | P0 | Real-shape skeletons (README.md:263) |
| Unified inbox (3-pane) | P0 | Generalise `TodayView.tsx` |
| Record detail + activity timeline | P1 | §7.6 |
| Kanban pipeline | P1 | §7.2 |
| Score ring, glance tile, stat card | P1 | Port from `DashboardView.tsx` / `ui.tsx:61` |
| Command palette (⌘K) | P1 | `<dialog>` + combobox |
| Date / date-range picker | P1 | Native `<input type="date">` first. Range picker only if needed |
| Charts (bar, line, funnel, donut) | P1 | `chart-*` tokens. Linear bars, square value ends |
| Stage stepper, progress bar | P1 | `--gradient-bar-h` |
| Rich-text email composer | P1 | Legacy `components/Editor.tsx` + `.editor` styles (`globals.css:164-179`) |
| Calendar / viewings scheduler | P2 | |
| Map / listing gallery | P2 | |
| Theme / brand editor (tenant admin) | P2 | Uses the §9 resolver with a live preview |

---

## 12. Opinions and open questions (summary)

Opinions taken here, each reversible:

1. Ink label on the primary gradient rather than deepening it.
2. Collapse FAINT/DIM into a single `fg-muted`.
3. Add small radii for dense data while keeping pills and 26px panels.
4. Warm paper light theme.
5. IBM Plex Sans Arabic over Cairo.
6. Western digits by default.
7. Tenant body font locked.
8. Charts keep time left→right in RTL.
9. Drop Inter.
10. `--line-control` makes inputs visibly stronger.

Open:

- Will tenants want light as the default? (The current default is dark.)
- Should tenants get a choice of digit system per user rather than per tenant?
- Does the brand editor need to accept a secondary brand colour? (Suggested no for v1.)

## ROI-Maxi port: how the signature pieces are built

These were ported from `components/ember` without inline colors. `design/theme.css` holds the tokens.

- **Score ring:** an SVG circle using `pathLength` and `strokeDasharray`, not a conic gradient, so no inline style is needed.
- **Avatar:** `bg-avatar` reads `--hue`, hashed from the name and set on the element. Lightness stays at 30%, so white initials clear 4.5:1.
- **Temperature fills:** `--gradient-hot`, `--gradient-warm` and `--gradient-cold` are pinned and never follow a client's brand. Ember's white label became `--on-temperature` ink, and the cold end moved from `#41678f` to `#5f8bb8` to reach AA.
- **Brand-derived gradients and washes** are declared on `:root, [data-theme]`. A custom property's `var()` resolves where it is declared, so the portal's brand override only reaches them if they are redeclared on its wrapper.
- **Allowed inline styles:** only data values, meaning bar width or height and `--hue`. Never a color.
