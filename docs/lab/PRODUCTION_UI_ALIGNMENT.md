# Lab UI alignment with Production Tracker

Prepared November 11, 2026. Target: meccajoe/mdp-tracker-lab only. Production read as design reference, never changed.

## Design source and scope

Confirmed the active production process directory read-only as /Users/archie/projects/mdp-tracker-releases/5798ddf191fc4975ed94bbe2c41485badb6027e9. Its approved experience, not the stale production repository root, is the UI reference. Imported its scoped approved-ui.css and adapted its shell. Existing Lab sidebar and shared primitives remain intact for protected workspaces.

- New presentation applies to Dashboard, Projects, project details, Find and existing administration/forms.
- /quotes and every /quotes/* page, /capacity and every /capacity/* page retain their original shell and styles. Legacy Ada workspaces and login retain their existing presentation as well.
- My Work is not added. Primary navigation remains Dashboard, Projects, Quotes, Capacity and Find. Find contains Expenses, Items, Materials and Quoted Items, as Joe requested. Existing Lab URLs and administration actions remain available.
- No database migrations, imports, role changes, source refreshes, quote edits, capacity edits or outbound integrations are part of this change. Existing Lab datasets remain the sources for Find/Materials; production's live-workbook integration was not imported.

## User-visible changes

Overview now has delivery/PM/status, status-aware countdown, cost and hour health, attention, notes and disclosed schedule/source details. Quote foundation and missing-rate information remain visible. Seed import notes are labeled historical and collapsed; stored notes are not edited.

Budget Detail, Quote Allocation and Activity use open rows and labeled narrow-screen records. Expenses and Labor share an Activity tab. Original source detail/documents remain available. Overview and Budget Detail consume the same activity provider and summary, with one activity request across tabs. Missing costs remain pending; unavailable activity remains unknown rather than zero.

Dashboard and Projects use the same pinned quote sources and newest eligible activity capture as project detail, with search, status, PM and sort controls. Directory GET verifies Lab, quote-product identity and actor RLS, pages sources and captures completely, chooses one newest snapshot per project, rejects changed links, and returns no private payroll rows. Source failures return no partial directory.

Find Expenses and Items adopt reviewed production presentation with Lab endpoints. Item-source selection filters the stored Lab rows on the server; this read endpoint now checks the existing Lab/product access boundary and the browser supplies its normal bearer identity. No external HubSpot or QBO calls occur. Find Materials retains its Lab source, filters and editors, with the open workspace layout. User/reference administration retains its operations and permissions with the approved open sections and type treatment.

## Visual fidelity ledger

Reference: production docs/design/reference/mdp-projects-directory-20261008.png plus the current approved source at commit 5798ddf.

| Point | Verified result |
| --- | --- |
| Sidebar and branding | Black #000, existing Mecca mark, neutral separators, red #990100 selected item; Tracker V2 label identifies the Lab successor |
| Container model | Full available width, normal gutters, white content, open rows with thin dividers; no enclosed dashboard table cards |
| Typography | Production heading scale, compact metadata, readable table/body labels and financial alignment |
| Navigation | Production-style Find tabs and active states; Dashboard retained; no My Work; V2 source/documents retained |
| Project overview | Production status strip, countdown, health and attention hierarchy with actual pinned quote/snapshot values |
| Narrow screens | Mobile navigation, wrapped project tabs, labeled activity records and two-column project directory; no body horizontal overflow |
| Protected pages | Quotes and Capacity before/after screenshots byte-identical; source files unchanged |

Intentional differences: Lab quote labels and incomplete-cost caveats replace unsupported production contract/profit claims. Activity not imported is explicit. Provider names in Find Items use text labels because referenced production SVG URLs are unavailable; no broken logo requests are introduced. Production live materials, My Work, private history/photo integrations and new operational workflows are not enabled by a presentation update.

## Verification

314 Lab tests plus TypeScript passed, including nested-route boundaries, incomplete/zero/over-budget health, source matching, directory auth/pagination and item-source filtering. Sanitized Node 24 webpack build passed. Local vet attempted after each code unit but tokenizer download failed under sandbox DNS; no external private-code upload attempted.

Browser plugin unavailable; used isolated headless Playwright with the actual components and read-only captured Lab fixture data. Checked 2560x1267 (reference size), 1440x1000 Find and 390x844 mobile. Passed: 12-project status/search filtering, opening Fossil, $24,293.09 known subtotal, budget/Activity navigation, 21 expense rows, 141 labor rows, one activity request across tabs, mobile navigation/record labels, Find source selector, Materials and Dashboard. No JS errors. Real signed-in hosted acceptance remains separate from fixture verification.

Screenshots remain outside Git under /tmp/mdp-v2-ui-*.png. Protected screenshot SHA-256 pairs:
- Quotes: f52d4e8bb01769dcccab6894011e8a7a2fa2ca172a16cdd8cd4603a2a5628935 both before/after.
- Capacity: 27edb6cee0389fdcee9218d71c663e8db473aff09ada96b257ea9e6ecf4be99e both before/after.

No material visual mismatch remained in the checked flows; these are presentation adaptations, not a claim of new production integration feature parity.
