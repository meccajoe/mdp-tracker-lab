# PRD: MDP Project Cost Tracker — Web App

**Product:** Internal project cost tracking tool for Mecca Design & Production (MDP)
**Replaces:** Google Sheet "MDP - Project Tracker (Beta)"
**Owner:** Joe Mecca
**Builder:** Rex
**Date:** 2026-03-17

---

## Context

MDP is a fabrication/experiential design company. They run 20-40 active projects at any time, each with a contract value, a project manager (PM), labor budgets, and line-item expenses across ~20 COGS categories.

The current Google Sheet works but has compounding problems: formula errors from missing data, no mobile entry, no multi-project dashboard, and no enforcement of data integrity. The new app replaces it with a proper web tool.

**Ada integration is a first-class goal.** Ada is MDP's AI estimator. Once this app is live, Ada will query the historical project database to improve estimates — matching project type, client, and scope against real actuals. Every schema decision should make Ada's job easier.

---

## Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Subdomain of meccadesign.com (to be set up — use `localhost:3000` + Tailscale serve for now)
- **Auth:** Supabase Auth — email/password. Users are PMs + admins (Paul).

---

## Phase 1 Scope (this build)

### Data Model

**`projects` table**
```sql
id              text PRIMARY KEY        -- e.g. "26023"
name            text NOT NULL
client          text NOT NULL
pm              text NOT NULL           -- initials: VW, GM, MS, AS, NG, PM
close_date      date
contract_amount numeric(12,2)
status          text DEFAULT 'Active'   -- Active | Completed | On Hold
notes           text
-- Budget columns (from Deal Hub breakdown)
budget_hrs      numeric(8,2)
budget_design   numeric(10,2)
budget_pm       numeric(10,2)
budget_shipping numeric(10,2)
budget_id_labor numeric(10,2)
budget_travel   numeric(10,2)
budget_props    numeric(10,2)
budget_equipment numeric(10,2)
budget_flooring numeric(10,2)
-- Ada metadata (for future use)
project_type    text                    -- e.g. "trade show", "event activation", "retail install"
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

**`expenses` table**
```sql
id              text PRIMARY KEY        -- auto: EXP-001, EXP-002...
project_id      text REFERENCES projects(id)
date            date NOT NULL
category        text NOT NULL           -- from COGS list (see Key tab)
cogs_code       text                    -- 500100, 500200, etc.
vendor          text
amount          numeric(10,2) NOT NULL
amount_pending  boolean DEFAULT false
purchaser       text                    -- initials
notes           text
created_at      timestamptz DEFAULT now()
```

**`labor_entries` table**
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
project_id      text REFERENCES projects(id)
date            date NOT NULL
person          text NOT NULL           -- initials or name
hours           numeric(6,2) NOT NULL
labor_type      text                    -- Production Labor | I&D Labor | Design Labor
notes           text
created_at      timestamptz DEFAULT now()
```

**`cogs_categories` table** (seeded from Key tab)
```sql
code            text PRIMARY KEY        -- "500100"
name            text NOT NULL           -- "Production Labor"
definition      text
```

### Views / Computed Fields (Postgres views or in-app)
- `total_hrs_used` — sum of labor_entries.hours per project
- `total_spent` — sum of expenses.amount per project
- `budget_labor_$$` — budget_hrs * $30/hr (or configurable rate)
- `pct_hrs_used`, `pct_hrs_remaining`, `$$_remaining`

### Pages

**1. Projects List (`/projects`)**
- Table: all projects, sortable by status/PM/close date/contract value/% budget used
- Color coding: red = over budget, yellow = >80%, green = healthy
- Quick filters: Active / Completed / All | PM dropdown
- "+ New Project" button
- Each row links to project detail

**2. Project Detail (`/projects/[id]`)**
- Header: project name, client, PM, status, contract amount, close date
- Budget summary card: hrs used / budgeted, $$ used / remaining, % bars
- Budget breakdown table: category | budgeted | actual | variance
- Expenses tab: sortable table of all line-item expenses, "+ Add Expense" inline
- Labor tab: hours log by person/date, "+ Log Hours" inline
- Edit project button

**3. Add/Edit Project (`/projects/new`, `/projects/[id]/edit`)**
- Form with validation — no empty contract_amount or close_date allowed without explicit "Not Set" toggle
- Budget allocation fields for each category
- Project type tag (for Ada)

**4. Dashboard (`/` home)**
- Portfolio summary: total active projects, total contract value, total committed spend, total remaining
- Active projects table (same as projects list filtered to Active)
- Over-budget alerts (projects where $$ used > budget)
- Recent expenses feed (last 10)

### Auth
- Single shared login for Phase 1 (simplicity — Paul's team can share credentials)
- Role field on users table for Phase 2 PM-level views

### Data Import
- One-time CSV import script for existing sheet data
- Import Deal Hub → projects
- Import Expense Hub → expenses
- Leave Labor Hub (it's empty)

---

## COGS Categories (seed data)

From the Key tab — seed into `cogs_categories`:

| Code   | Name                           |
|--------|-------------------------------|
| 500100 | Production Labor               |
| 500150 | I&D Labor                      |
| 500200 | Fabrication                    |
| 500300 | On-site Show Services          |
| 500400 | Shipping/Trucking              |
| 500450 | Fuel Costs                     |
| 500500 | Storage                        |
| 500600 | Graphics                       |
| 500700 | Design Labor                   |
| 500800 | Rental                         |
| 500900 | Forklifts and Trucks           |
| 501000 | Show Prep                      |
| 501200 | Fab Supplies and Small Equipment |
| 501300 | Design                         |
| 501400 | Install/Strike                 |
| 501500 | Production Meals               |
| 501700 | Machinery Repairs & Maintenance |
| 505000 | Travel                         |
| 500510 | Travel-Hotels                  |
| 500520 | Travel-Per Diem                |
| 500530 | Travel-Airfare & Baggage Fees  |

---

## Phase 2 (future — do not build now)
- Mobile-optimized expense entry
- PM-level auth views (each PM sees their projects)
- Budget alerts via email/Slack when project hits 80%/100%
- Export to CSV/Excel
- Ada query API: `GET /api/ada/similar-projects?type=trade_show&budget_range=50000-100000`

## Phase 3 (future)
- QBO sync: push expense entries to QuickBooks using COGS codes
- Eliminate double-entry between this tool and accounting

---

## Notes for Rex

- Keep the schema clean and well-indexed — Ada will be querying this heavily later
- No em dashes in UI copy
- Mobile-responsive but desktop-first
- Use shadcn/ui components throughout for consistency
- Supabase RLS: enable but keep permissive for Phase 1 (all authenticated users see all data)
- No external API dependencies for Phase 1
- Tailwind only — no additional CSS frameworks
- Commit after every meaningful milestone

## Notify when done
When completely finished with Phase 1, run:
openclaw system event --text "Done: MDP Project Tracker Phase 1 built — ready for review" --mode now
