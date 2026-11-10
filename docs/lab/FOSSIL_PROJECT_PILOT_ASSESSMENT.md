# Tracker V2 project activity pilot assessment

Assessed November 10, 2026. Read-only review of Lab and Production Tracker; no project data, quote revisions, financial records, or integrations changed. This is a source assessment, not a completed activity import or published interface.

## Selected pilot

**Fossil Holiday 2026 — job 26218**, HubSpot deal `343941874378`.

- Active in Lab and Production Tracker. Job number and HubSpot deal ID both match.
- Lab project ID and Production Tracker project ID are both `26218`.
- Lab pinned quote: workspace `c9315109-5b4d-485e-ad86-66a3a7b22e31`, revision **22**, 23 budget lines. This is the selected quote version and still its latest saved revision.
- An older-created quote in the same group has revision 48 and Not Active status. That is a separate workspace/version; revision numbers are workspace-local. It must not replace the pinned quote merely because its revision number is larger.
- Production's stored quote provenance identifies HubSpot quote **337545214656**, Fossil Holiday (v7), applied October 29. Its latest recorded check on November 10 identifies the same quote. This assessment did not call the live HubSpot quote-allocation endpoint.

The original 12 imported projects currently comprise seven Active, four Completed, and one Pending in Lab. Production still marks all 12 Active. Restrict the active pilot shortlist using Lab's quote-driven project state rather than importing Production status.

| Active Lab project | Job | Expense records | Time records | Assessment |
| --- | --- | ---: | ---: | --- |
| Fossil Holiday 2026 | 26218 | 21 | 141 | Best full pilot; both sources have substantial activity |
| Ford AV - Irving ISD CTE | 26219 | 0 | 23 | Labor only |
| Westmoor Mfg. Co. - Hat Steaming Fixture | 26229 | 2 | 0 | Expenses only |
| Disasterville - Ice Storm | 26237 | 0 | 0 | No recorded activity |
| Tyson’s Booth - Thanksgiving Game | 26238 | 0 | 16 | Labor only |
| MLW Logo Fixture | 26240 | 0 | 0 | No recorded activity |
| salt - Netflix House Items | 26246 | 1 | 6 | Smaller secondary pilot; earlier association concerns make Fossil preferable |

## Baseline comparison

| Measure | Lab pinned quote | Production stored project budget |
| --- | ---: | ---: |
| Selling price / contract amount | $116,021.10 | $116,643.00 |
| Hours | 323 total: 279 fabrication, 24 design, 20 lead installer | 447 fabrication hours; design and I&D tracked separately |
| Materials / other purchased costs | $37,560.53, including $4,500 install support | $23,481 materials; other categories separate |
| Employee labor budget | $12,684.21 | Different formulas/rates; do not substitute |
| Total direct build budget | $50,244.74 | Not directly comparable without category reconciliation |

The sell/contract difference is **$621.90** after display rounding. The two hour figures have different scope as well as different values. Do not present 447 versus 323 as a like-for-like labor variance.

Lab's labor budget is $39.27 per quoted hour. Production's allocation code uses different rules: fabrication sell divided by 210 for hours, $41 per shop hour, and design sell divided by 125 with $25 per design hour. Production's stored fabrication amount of $93,923 yields 447 rounded hours and $23,481 materials at 25%. A live line-level allocation may differ from stored category totals; the live endpoint has not been reconciled in this assessment.

Lab's Materials / other amount includes purchased installation support, rentals/resale and other costs. It is not a pure fabrication-materials allowance. Budget Detail should split these using explicit quote types/inputs; any ambiguous items need a visible Unmapped category rather than a guessed allocation.

## Actual expenses

Production table: `public.expenses`, scoped to `project_id = 26218`.

| Category | Source | Records | Amount |
| --- | --- | ---: | ---: |
| Fabrication | manual | 19 | $15,167.39 |
| Fabrication | billcom | 1 | $3,525.85 |
| Fab Supplies and Small Equipment | manual | 1 | $51.56 |
| **Total** | | **21** | **$18,744.80** |

Expense dates October 29–November 10. None marked pending or flagged. All 21 IDs are unique. The BILL row has an external ID; manual rows do not. No duplicate candidates share the same normalized vendor, date and amount; this limited check does not prove that differently described transactions never overlap.

Use **Production project + expense ID** as the import identity for every row, preserving source/external ID. Do not use external ID alone, since manual records lack one. Credits, corrections, pending amounts and flags must retain their source values. Do not independently import BILL transactions into the same totals: they are already represented in Production expenses.

## Actual labor

Production table: `public.qbo_labor_entries`, scoped to `project_id = 26218` and canonical QBO Time source IDs starting `ts_`.

- **141 unique source records; 309.02 hours**, October 19–November 9, last source sync November 10 at 03:01 America/Chicago.
- 88 entries / **208.32 hours** have verified `qbo_time_users` rates. Their base wage cost is **$5,548.285**, displayed **$5,548.29** when rounded after aggregation.
- 53 entries / **100.70 hours** have no verified rate. Their cost is **unknown**, not zero. This includes all 50.33 design hours.
- All recorded OT-hour fields are zero. Base wage cost does not establish loaded labor cost, payroll reconciliation or overtime-premium completeness.
- No manual `labor_entries` or manual `project_actuals` adjustments exist for this pilot. Future projects must inspect both sources before claiming parity with V1.

| Work category | Hours |
| --- | ---: |
| Design | 50.33 |
| Shop / fabrication, including CNC, electrical, graphics, laminate, packing, paint and welding | 258.69 |
| Install / dismantle | 0.00 |
| **Total** | **309.02** |

Like-for-like Lab hour comparison: shop **258.69 actual / 279 quoted**; design **50.33 / 24**; installer **0 / 20**. Remaining hours are arithmetic budget differences, not a forecast of work needed to finish.

Preserve source entry ID, employee, work date, service item, regular/OT hours, rate, rate source and verification timestamp. Import only the canonical feed for cost/hours; do not add duplicate QBO TimeActivity records. Missing-rate hours remain in hour totals while their costs stay explicitly incomplete.

## Implementation mapping

1. **Budget Detail** derives from the pinned Lab quote. Show the baseline workspace/revision. Keep the Production stored budget and HubSpot contract as labeled comparison evidence; never apply V1 allocation percentages to Lab's quote behind the scenes.
2. **Quote allocation** uses the 23 pinned Lab quote lines, retaining their IDs, sell, hours, labor and purchased-cost budgets. Current source activity has no reliable Lab quote-line attribution, so show actuals at project level. Do not distribute actuals by sell percentages or imply item profitability.
3. **Expense activity** mirrors the 21 Production rows into separate Lab-only activity storage as a dated snapshot, with source identity, captured-at timestamp and reconciliation totals. Repeated loads must replace/upsert the same source identities, not append costs.
4. **Labor activity** mirrors the 141 canonical time rows, with separate hour, verified base-wage-cost and missing-rate totals. No assumed pay rates. Do not combine salaried/unrated hours into a fabricated complete cost.
5. Include a source-import manifest: project/job/deal match, source capture time, row counts, source IDs/hash and totals. A later refresh must account for deleted/corrected source rows, not only upsert additions.
6. Use a manual bounded import for the pilot; no new scheduled sync or outbound writes. Store data only in Lab, protected by existing quote-workspace membership and server-only write permissions. Production and HubSpot remain read-only sources.
7. Acceptance: all row counts and totals reconcile at capture time; repeated import has identical totals; source corrections/deletions are reflected; unauthorized users cannot read/write; pinned quote/source hash and project status remain unchanged; incomplete labor cost is visible on desktop/mobile.

## Remaining decisions and limits

- Lab quote versus HubSpot customer-contract difference remains unresolved. Both values can be displayed with provenance; neither should silently overwrite the other.
- Missing rates prevent a complete actual labor cost or final margin. They do not prevent importing activity or comparing hours.
- No item-level actual allocation can be supported until explicit source-to-quote-line links exist.
- Activity import, UI implementation and hosted acceptance have not been performed as part of this assessment.
