# Production Tracking & Quoting Optimization Call

**Date:** 2026-08-31  
**Participants:** Joe and Paul  
**Recording length:** 1:13:05  
**Source:** `2026-08-31-production-tracking-quoting-call.transcript.vtt`

> Speaker diarization was not available. Named ownership below is used only where the conversational role is clear; otherwise, the owner is a function. The speakers also referenced shared screens and spreadsheets that are not contained in the audio, so verbal formula descriptions are not treated as implementation-ready specifications.

## Executive synthesis

The call converged on a single operating model:

1. Use one consistent quote/takeoff format for every project, whether the quote is prepared by a person or Ada.
2. Give every labor-bearing work package a stable item number within its project.
3. Carry the project/item/trade identity from the quote into HubSpot, QuickBooks Time, and MDP Tracker.
4. Compare quoted versus actual hours by project, item, trade, and eventually worker.
5. Use those actuals to create better production handoffs, richer post-mortems, and better future estimates in Ada.
6. Preserve the final approved quote/spreadsheet version so Ada learns from final outcomes rather than intermediate drafts.

The immediate project is not tablets, cameras, worker scoring, or an incentive plan. It is the underlying data contract and a tightly controlled pilot proving that `project + item + trade` can be captured reliably from the quote through QuickBooks Time and into Tracker.

## High-confidence decisions and operating direction

### 1. Standardize the quote format

A consistent quote/takeoff format is required regardless of whether Ada, Joe, Paul, or a future estimator creates the quote. The format should account for the full work scope and produce structured data that can be handed to production and returned to Ada as learning evidence. **[14:00–15:52]**

The current spreadsheet concept already includes:

- automatic downstream calculations;
- a resale classification with different markup and no fabrication labor;
- a production handoff showing hours and material budget;
- the ability to decode an older quote into the same structure. **[00:00–01:13]**

The decode-an-old-quote capability was explicitly described as useful direction but **not the immediate priority**. **[00:50–01:13]**

### 2. Keep a human in the quoting loop

The quotes are too unique and underspecified for Ada to complete every quote autonomously today. Humans themselves regularly need client calls, renderings, notes, external product research, and clarification after award. Ada should function as a deeply informed collaborator rather than pretend uncertainty does not exist. **[01:20–04:12]**

This implies that the product needs:

- explicit clarification questions;
- easy human correction;
- access to drawings, notes, historical quotes, materials, and outside-product research;
- durable capture of the final accepted result.

### 3. Use project-scoped item numbers instead of globally unique QuickBooks Time items

The preferred first test is a reusable `Item 1` through `Item 25` list in QuickBooks Time, interpreted inside the selected project. `Item 1` in one project is unrelated to `Item 1` in another. The composite identity must therefore be at least `project_id + item_number`; item number alone is meaningless. **[08:18–10:18; 31:06–34:44]**

The expected clock-in flow is:

1. select project;
2. select trade/service item;
3. select build item number. **[10:18–10:36]**

The alternative—creating every unique project item as a permanent QuickBooks Time option—would create hundreds or thousands of similarly named choices and should be avoided unless the reusable-number model cannot work. **[09:03–09:41; 33:16–38:20]**

This is a **proposed implementation that requires a technical spike**, not a confirmed QuickBooks Time capability. The call repeatedly notes that documentation is thin and the mobile behavior has not been proven. **[31:29–33:14]**

### 4. Reduce and clarify QuickBooks Time trade choices

Most irrelevant service items have been hidden rather than deleted, reducing the worker-facing list to roughly ten choices. Labels may need to be rewritten without abbreviations so workers can select the correct trade easily on a phone. Historical records may be useful because Rooster reportedly corrected service-item coding after the fact. **[06:30–08:17]**

The canonical trade list and naming still need formal approval before synchronization logic depends on them.

### 5. Measure quoted versus actual labor by item and trade

The target dataset is quoted and actual hours for every build by project, item, and trade. Example: a cabinet might carry separate carpentry, laminate, CNC, and paint hour budgets. **[15:35–16:43]**

Tracker should expose:

- labor grouped by item;
- labor grouped by trade/type;
- item × trade detail;
- filters by trade/type;
- quoted hours, actual hours, and variance;
- worker contribution only after the underlying coding is trustworthy. **[11:31–13:05; 15:35–16:43]**

The CNC example showed the value: actual CNC time looked materially higher than the estimator expected, but the current data could not distinguish estimating error, process inefficiency, or worker behavior. **[12:05–13:05]**

### 6. Separate shop, design, installation, and dismantle labor

Project-wide labor totals currently create contention because installation hours can make shop performance appear worse. Design hours also need to be separated from shop hours in Budget Detail. Installation and dismantle should use distinct codes; they generally do not need item numbers because they apply to the overall setup, but they still need their own budgets and actuals. **[45:12–46:31; 51:25–55:35]**

Verbal design economics discussed:

- client billing rate: `$125/hour`;
- internal design wage/cost approximation: up to `$25/hour`, possibly `$22–$23/hour` for some employees;
- example: 10 hours bills at $1,250 while an internal budget might be $250. **[45:19–46:31]**

This is **not yet an approved formula**. The exact internal-rate policy, provenance, and whether Tracker should show wage cost, budget cost, billing value, or all three must be confirmed. No guessed `$25` fallback should be implemented.

There is a material terminology conflict to resolve before implementation: the call references `$105/hour` in quote economics, prior approved fabrication logic uses `selling price / 210` for allowed hours and `$41/hour` for internal labor-budget dollars, actual labor evidence uses verified employee pay rates, and design was described as `$125/hour` client billing versus roughly `$22–$25/hour` direct wage cost. These are different measures and must remain separate. Overtime, holiday/salary treatment, excluded employees, and any PM-bonus/COGS impact also require explicit policy.

### 7. Tracker is the operational scoreboard; Monday remains the task checklist

The desired 2027 operating model is:

- Tracker contains authoritative project, purchase, expense, calculation, and labor performance facts;
- Monday remains the execution checklist;
- email remains communication;
- Tracker becomes the accurate scoreboard/stat sheet and a primary management hub for production and project managers. **[21:19–22:50]**

A roughly four-month horizon was stated for getting the core system complete enough to operate this way, excluding later iterations. **[21:19–22:18]**

### 8. Completed projects should auto-generate post-mortems

The expected workflow was explicitly confirmed: marking a project completed automatically generates the post-mortem. Regeneration is for late-arriving labor, expenses, or other evidence. **[42:14–44:38; 49:23–50:31]**

Post-mortems are currently useful but too generic. Item/trade data should allow statements such as “CNC exceeded estimate by X hours” rather than only reporting total labor overage. **[24:17–25:17; 42:54–43:39]**

During the call, a browser-authentication error prevented one participant from opening/generating a post-mortem. That issue has since been addressed in Tracker commit `7a37a0f`; single-action completion and automatic generation were already shipped in `542013e`.

### 9. Preserve final quote/spreadsheet versions for Ada

Ada’s long-term value depends on having the final approved quote and spreadsheet, not only intermediate generations. Ada supports split-view spreadsheet editing and can recognize either conversational or manual sheet updates. Final files should land in Ada’s Mecca Google Drive location or another durable, versioned destination Ada can read. **[01:10:49–01:12:48]**

The exact “finalization” action and version policy still need definition.

### 10. Bill.com budgets need deterministic membership and request-based access

Current behavior described in the call:

- Tracker automatically creates a Bill.com budget when travel or props has a budget;
- Joe is assigned as owner;
- the PM is added when available;
- request-based access is required so members can request specific funds rather than being allocated the entire budget. **[56:19–01:00:02]**

The PM is intermittently missing because the HubSpot close-won event, Tracker project creation, and Bill budget creation happen in a short window. Bill budget logic may be reading the PM from Tracker before the PM is persisted. The preferred correction is deterministic PM propagation/reconciliation, not a guessed delay. **[57:45–58:32; 01:02:17–01:06:15]**

Desired recurring access discussed:

- Joe: owner/approver;
- Emily: owner/admin or equivalent backup approver;
- David: always assigned;
- Rooster: always assigned;
- assigned PM: always assigned. **[01:01:07–01:08:44]**

The exact Bill role for each person and approval authority must be confirmed before changing live access.

The broader Bill operating policy also remains open: whether every purchase should require individual approval, how budget top-ups should work, whether requests should be batched, and whether materials are intentionally excluded from project budgets. **[01:06:54–01:08:46]**

## Material insights and opportunities

### Economic opportunity

The call estimates:

- roughly 4–5 percentage points of cost-of-sales items are not consistently accounted for in quoting;
- at least 5%, potentially 10%, fabrication optimization may be achievable over time;
- approximately 20% was mentioned as a longer-range optimization potential;
- together, better accounting and efficiency were framed as the path to roughly 10 net-margin points currently missing. **[12:53–14:20]**

These are management hypotheses, not audited financial conclusions. They should become measurable targets only after a baseline is reconciled.

### Production handoff and work orders

Once quotes contain item/trade budgets, Tracker could generate a work order for each item with:

- item description;
- drawings keyed to the same item number;
- material budget/list;
- hours by trade;
- total/remaining hours. **[16:18–17:03]**

This is a strong phase-two feature after the identity and labor-capture pilot is proven.

### Automated worker feedback

A later workflow could send each worker a weekly list of items worked, identify on-time versus late items, and request comments on exceptions. That would preserve production knowledge now lost in paper notes or informal conversations. **[28:34–29:23]**

### Better quoting models from actuals

Once enough item-level examples exist, Ada may infer simpler pricing/effort models for recurring structures—potentially square-foot or component-based rules for walls, decking, wood builds, and similar categories. **[15:03–15:52]**

This should be evidence-derived, not implemented now as a generic formula.

### Incentive compensation

A possible bonus was discussed for finishing an item under assigned hours—illustratively `$10` per saved hour, compared with a quote economics example using `$105/hour`. **[25:56–27:53]**

This was explicitly exploratory. Before any rollout, policy must address:

- whether the budget was accurate and unchanged;
- scope changes, rework, waiting, shared work, and reassignment;
- quality and safety gates;
- individual versus team attribution;
- wage/hour and compensation review;
- whether `$105` is a billing rate, contribution rate, or another metric.

Do not build or announce this until the data has been validated over a meaningful pilot period.

### Worker scoring, assignment, tablets, and cameras

Longer-term ideas included:

- assigning work based on proven worker strengths;
- workstation tablets showing the next assignment, drawings, materials, and remaining hours;
- escalation from the workstation;
- automated performance measurement;
- camera-assisted process analysis. **[17:03–19:18; 24:48–25:55]**

These are not near-term commitments. Worker-level scoring and video analysis require data-quality, privacy, employment-policy, and human-review safeguards.

## Other workstreams and commitments

### Venturity / WIP reconciliation

The financial/WIP automation is blocked on Venturity validating whether the output matches the accounting result they want. Engineering can prove the mechanism works, but only Venturity can approve the accounting semantics. A focused one-hour review was proposed. The WIP correction has already slipped across multiple months and is creating reporting/line-of-credit timing concerns. **[38:35–41:35]**

### User feedback loop

Alina is providing frequent operational feedback that catches real workflow friction. Emily requested design/shop labor separation. Maribel likely has automation opportunities, but has not yet provided process detail; employee concern about AI/job displacement may inhibit feedback. AR-side efficiency was prioritized over lower-risk back-office improvements. **[45:12–49:18]**

## Action items

| Priority | Workstream | Action | Owner/function | Dependency/status |
|---|---|---|---|---|
| P0 | Quote source | Obtain the blank current quote template and one filled final example, including version labels and all tabs. | Joe / quote owner | The files were shared during the call; Ferris needs links or copies. |
| P0 | Item identity | Run a technical spike proving whether QuickBooks Time exposes the reusable item field through UI, API, exports, and phone clock-in. Validate composite identity `project + item`. | Tracker engineering | No live template changes until proven. |
| P0 | Data contract | Define canonical fields for project, item number, item description, work-package type, quoted hours by trade, material budget, and source revision. | Tracker engineering + quote owner | Requires spreadsheet examples. |
| P0 | Trade taxonomy | Approve the worker-facing trade/service list and map old codes to canonical codes without deleting history. | Production owner + Tracker engineering | Need the exact visible QuickBooks Time list. |
| P0 | Bill access | Audit the close-won → Tracker → Bill budget sequence and PM source. Confirm always-assigned users and roles. | Tracker/Bill engineering + Joe | Avoid time-delay workaround if direct HubSpot data/reconciliation solves it. |
| P0 | Design labor | Confirm the design budget/cost rule and its provenance. | Finance + quote owner | `$25` was approximate, not final. |
| P0 | Post-mortems | Have Paul review 5 representative drafts and state what is missing. | Paul / production owner | Browser-auth issue is already fixed. |
| P0 | Venturity | Schedule a one-hour output-validation session and obtain explicit accepted/tweak feedback. | Joe + Venturity/accounting | Accounting-semantic blocker. |
| P1 | HubSpot | Add the approved item/work-package fields to quote line items/templates without breaking current quote generation. | Tracker/HubSpot engineering | After the data-contract spike. |
| P1 | Sync | Carry item identity and quoted trade budgets from HubSpot into Tracker; carry actual item/trade selection from QuickBooks Time into canonical labor rows. | Tracker engineering | Idempotent sync and historical-safe migration required. |
| P1 | Tracker UI | Add Item and Item × Trade labor views, trade filters, and quoted/actual/variance reporting. | Tracker engineering | After source fields are reliable. |
| P1 | Pilot | Pilot on 2–3 active projects with a small worker group; validate phone UX and daily coding accuracy. | Production lead + Tracker engineering | Define success/error thresholds first. |
| P1 | Data quality | Define the historical comparability boundary, completeness flags, correction audit trail, and whether any old entries are backfilled. | Tracker engineering + production owner | Earlier projects and corrected time entries are not uniformly complete. |
| P2 | Production handoff | Generate item work orders with drawings, materials, and labor budgets. | Tracker product/engineering | Requires proven item contract. |
| P2 | Post-mortems/Ada | Enrich snapshots with item/trade variance and feed only reviewed structured lessons into Ada. | Tracker/Ada engineering + reviewer | Preserve immutable snapshots and approval gate. |
| P2 | Final artifacts | Add an explicit final/approved spreadsheet action and durable Drive/version linkage. | Ada engineering + quote owner | Define revision policy. |
| P2 | Feedback | Automate exception-focused weekly worker feedback and preserve responses by item. | Production + Tracker engineering | After pilot trust. |
| P3 | Optimization | Derive category formulas from accumulated quoted/actual evidence. | Ada/analytics + quoting owner | Minimum trusted sample size required. |
| P3 | Workforce systems | Evaluate incentives, worker assignment recommendations, tablets, and any camera analysis. | Leadership/HR/production | Separate approval; quality, privacy, and labor-policy review required. |

## Recommended execution plan

### Phase 0 — Lock the model before modifying live systems

1. Review the two shared quote spreadsheets and identify every source field/formula.
2. Inventory current HubSpot quote properties/template dependencies.
3. Inspect QuickBooks Time custom-field configuration, API payloads, exports, and phone workflow.
4. Define the canonical `Project Work Item` contract.
5. Confirm trade taxonomy, design rate policy, and Bill.com role policy.
6. Select pilot projects and measurable acceptance criteria.

**Exit gate:** a written, reviewed field map and a successful non-production round trip for one sample project/item/trade.

### Phase 1 — Capture project/item/trade end to end

1. Add the approved item property to HubSpot line items/template.
2. Persist item number/description/revision and quoted hours by trade in Tracker.
3. Extend QuickBooks Time sync to capture the item selection without changing canonical labor IDs or rate provenance.
4. Reconcile by the composite key, never by `Item 1` alone.
5. Add data-quality exceptions for missing/invalid item or trade selection.

**Exit gate:** pilot source counts reconcile across HubSpot, QuickBooks Time, and Tracker.

### Phase 2 — Make the data operational

1. Add dense Item and Item × Trade views in Tracker.
2. Show quoted hours, actual hours, variance, and coding completeness.
3. Keep design, shop, install, and dismantle separate.
4. Validate mobile clock-in behavior with actual workers.
5. Run a short production pilot and correct taxonomy/UX issues.

**Exit gate:** production can use the data daily without manual spreadsheet reconciliation, and selection error is within an agreed threshold.

### Phase 3 — Close the learning loop

1. Enrich post-mortems with item/trade variance.
2. Capture structured exception reasons and worker/lead feedback.
3. Link final approved quote/spreadsheet revisions.
4. Allow reviewed structured lessons—not raw narrative—to inform Ada.
5. Build evidence-backed quoting benchmarks after enough clean samples exist.

### Phase 4 — Production orchestration

Only after the first three phases are trustworthy:

- generated item work orders;
- workstation/tablet queue;
- remaining-hour visibility;
- assignment recommendations;
- incentive-program evaluation;
- camera/process analytics, if separately approved.

## Questions and inputs required before implementation

1. **Quote artifacts:** Please provide Ferris the links or files for the blank/current template and the filled final example shared at the end of the call. Identify which is v8 and which completed file is based on v5.
2. **Item definition:** Should a project item mean only a fabricated deliverable, or any discrete labor-bearing work package, including pull/pack/prep and test-fit work? The call supports the broader definition but uses both descriptions.
3. **Design labor policy:** Is the internal design budget a fixed approved rate, the employee’s verified pay rate, or another loaded rate? Should Tracker show client billing value, internal budget, verified wage cost, or all three?
   Also confirm fabrication budget rate, overtime/holiday/salary handling, excluded employees, and whether any of these measures affect PM bonus or COGS reporting.
4. **Trade list:** What exact ten or so choices should workers see? Should `Install` and `Dismantle` be separate? Please provide a screenshot/export of the final QuickBooks Time configuration before it is activated.
5. **Pilot:** Which 2–3 active projects and which workers should be the pilot? Is `Item 1–25` sufficient, and who will verify clock-in accuracy daily?
6. **Bill.com roles:** Confirm whether Joe and Emily are owners/admins, David and Rooster are members, and the assigned PM is a member. Who can approve requests and change budget amounts?
   Also confirm the intended top-up/request workflow and whether project materials should remain outside these budgets.
7. **Final artifact rule:** What action declares a spreadsheet final, and should the final copy automatically land in Ada’s Mecca Drive folder while preserving all prior revisions?
8. **Post-mortem target:** After Paul reviews five drafts, what numeric sections and explanations should every post-mortem contain?
9. **Venturity:** Has the one-hour validation session been scheduled, and can we get their written acceptance criteria or annotated output?

## Risks and safeguards

- Do not change the live HubSpot quote template until dependencies and rollback are documented.
- Do not assume QuickBooks Time supports the proposed reusable-item model until API/export/mobile behavior is proven.
- Do not join labor by item number alone; it must be scoped by project and, where needed, source revision.
- Do not treat historical service-item coding as perfect ground truth; preserve confidence and correction history.
- Do not compare incomplete early projects to the pilot without an explicit completeness flag and historical-data boundary.
- Do not mix installation/dismantle/design hours into shop-efficiency conclusions.
- Do not use approximate wage rates or call direct wage cost fully loaded labor cost.
- Do not infer worker quality from speed alone.
- Do not automate bonuses, discipline, assignments, or video-based evaluation without human review and explicit policy approval.
- Do not let final spreadsheet edits happen outside Ada/Drive without ingestion and version lineage, or the highest-value learning evidence will be lost.
