# Platform redesign: progress record

Brief: redesign every portal and module (modern, calm, industrial; Light / Dark / System; desktop and phone equal), keeping the logo, orange/charcoal identity, data, permissions and business rules. Started 12/11/2026. Work happens on `develop` (development site); nothing is released to production by this work.

## Direction
Refined industrial operations product: neutral working surfaces, charcoal structure (sidebar), orange kept for primary actions, active navigation and record links only, so it never competes with statuses (green / amber / red / blue each have their own tokens). Readable text (no faint grey), modest headings, comfortable density, few shadows, no decorative gradients or glass.

## Foundations (done)
- **Tokens** (`apps/web/app/globals.css`): semantic colours with light and dark values: canvas, surface, surface-raised, surface-muted, surface-hover, nav, ink / ink-muted / ink-subtle, stroke / stroke-strong, brand / brand-hover / brand-active / brand-ink / brand-soft, ok / warn / danger / info each with soft, ink and line variants, overlay, shadow-card / shadow-pop.
- **Contrast fix**: the old "subtle" grey (#a7a6ab, about 2.4:1 on white) is now #6c6c73 (about 5.3:1); secondary text #55555b (about 7.3:1). Dark theme text levels chosen for at least 4.5:1 on its surfaces.
- **Hard-coded colours removed**: 46 component files moved from hex values / `bg-white` to tokens. Intentional exceptions: the MFA QR code and company-logo containers stay white; white text on brand fills and the sidebar.
- **Appearance** (`components/theme/theme.tsx`): Light, Dark, System (default). Stored per device in the browser (`localStorage`, key `hvems.theme`); there is no user-preferences table and appearance doesn't justify one. A head script applies the theme before first paint (no flash); System follows device changes live; other tabs follow. Controls: account menu (menu radio items) and every sign-in style page (segmented control, arrow keys).
- **Logo**: never recoloured. Charcoal version on light surfaces, the supplied white-text version on dark surfaces (switches with the theme); the sidebar always uses the white version.
- **Shared components**: page header (smaller title, readable description, breadcrumb), table rows (hover, whole-row links via `STRETCHED_LINK`), detail lists (wrap instead of truncating), filter bar (folds behind "Filters (n)" on phones, Apply / Reset).

## Representative set
| Area | Done | Desktop | Phone | Light / dark | Functional check |
|---|---|---|---|---|---|
| Sign-in, sign-up, recovery, email links, invitations (shared frame) | ✅ | ✅ | ✅ | ✅ | sign-in ✅ |
| Navigation shell (grouped, collapsible, account menu, appearance) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inspections list (cards on phones, whole-row links, count, filters) | ✅ | ✅ | ✅ | ✅ | open / filter ✅ |
| Inspection detail (faults first, defect links, answers folded) | ✅ | ✅ | ✅ | ✅ | open ✅ |
| Pre-start completion (compact summary, full-width answers, sticky progress + next unanswered) | ✅ | ✅ | ✅ | ✅ | answering / progress / jump ✅ (not submitted in tests) |

## Rollout (12/11/2026)
Every page now inherits the tokens (both themes), the page header, the table component (sideways scroll inside the card, first column pinned on phones, minimum width so columns stay readable), row hover, detail lists that wrap, and the filter bar.

| Area | Bespoke work done | Inherited only | Phone | Dark | Checked (dark, 390px: loads, no overflow, no console errors) |
|---|---|---|---|---|---|
| Equipment list | phone cards, whole-row links | | ✅ | ✅ | ✅ |
| Work orders list | phone cards, whole-row links, "Overdue" in words | | ✅ | ✅ | ✅ |
| Defects list | defect first, whole-row links | | table | ✅ | ✅ |
| Dashboard, equipment detail / history / new, clients & sites, alerts, operators, maintenance, technicians, team, audit, settings, account security, module placeholders | | ✅ | table / stacked | ✅ | ✅ |
| Super Admin console: dashboard, organisations, asset classes, audit, settings | | ✅ | table | ✅ | ✅ |
| Provider dashboard | | ✅ | | ✅ | desktop ✅ |
| Operator portal (direct sign-in, dashboard, equipment search, pre-start, issue report, my pre-starts / issues) | pre-start form shared with company portal | ✅ | ✅ | ✅ | pre-start ✅ |

## Still to do (next session)
1. Phone cards (like Equipment / Work orders) for: defects, technicians, operators, team, maintenance schedule, audit, admin organisations.
2. Dashboard: lead with the To-do card on phones; stat tiles one row of two.
3. Equipment detail: compact identity header on phones; actions into an overflow menu.
4. Forms: error summary at the top of long forms (equipment form, pre-start) and unsaved-change protection on the equipment form.
5. ~~Operator portal review on a phone in both themes~~ (done 12/11/2026 with the operator workspace).
6. Not-found / error / loading pages in dark mode review.
7. Accessibility pass: keyboard-only walk-through of each portal, 200% zoom, screen reader spot checks; measure contrast with a tool.

## Checks
- Typecheck, lint, unit tests and CI on every commit.
- Screenshots: `scratchpad/shoot.mjs` captures a page in light and dark at 1440×900 and 390×844 (not committed).

## Known limitations
- Appearance is per device (browser storage), not per account.
- PDFs and CSV exports are unaffected by the theme (intended).
- Not yet verified with a screen reader or 200% zoom; contrast values are calculated, not measured with a tool.
