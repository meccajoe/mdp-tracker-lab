# Integrated workback schedule

## Architecture inspection and implementation plan — October 13, 2026

Reuse QuoteV27 immutable workbook revisions, stable line/takeoff IDs, calculateQuoteV27 labor, BOM snapshot data, production-calendar date-only arithmetic, production-plan item/trade dependency engine, shared roster and append-only lab_production_schedule_revisions. No duplicate quotes/material catalog or external sharing integration.

The quote currently has buildStart/buildFinish/installDate, but no independent due date, explicit client approval/artwork responsibility, procurement lead times, curing periods or company holiday calendar. Add operational workback configuration to the existing production plan, rather than rewriting commercial quote snapshots. Due date is explicitly entered until a quote date is available; installation remains separately recorded. Existing weekend options remain available, default weekdays. Store baseline, generated recommendation, manual dates and actual dates independently.

Scope mapping: exact quoted trade mappings retain hours and IDs. BOM descriptions/notes provide candidate CNC (CNC/machining), carpentry (wood/plywood/MDF/assembly), finish (paint/primer/coatings), graphics (vinyl/print/SEG), client-supplied and purchased material requirements. Candidate detection never infers approval responsibility, delivery promises or crew feasibility. Per-item explicit responsibility/approval/lead-time settings override candidates. Unassigned labor stays explicit. No cost fields enter the client DTO or PDF.

Plan:
1. Pure workback model/validation and deterministic largest-remainder whole-day baseline (ties in stage order), configurable minimums/calendar/offsets and conditions. Retain original 15/5/10/40/20/10 reference alongside adjusted planning.
2. Generate relevant milestone tasks from existing dynamic labor tasks and BOM, retaining dependencies/source IDs; flag missing facts and locked-date conflicts. Reuse roster-aware proposal generation rather than treating hours as elapsed days.
3. Server-authoritative generation in the existing schedule revision stream. Final triggers generation; saved quote edits refresh preliminary recommendations; active/approved schedules retain their working dates with a proposed comparison. Optimistic concurrency prevents duplicate or stale writes. Existing quotes have an explicit Generate action.
4. Quote Workback Schedule tab with overview/internal/client views, scoped editable requirements and milestone dates, history, approval and client-only PDF. Link from project Capacity. Preserve first approved baseline and existing plan actuals/rules.
5. Test calendar/rounding/scope/privacy/idempotence/approval preservation, production build, dedicated lab UI verification and documented deployment.

Lifecycle interpretation: Final is quote completion; Closed Won / In production activates the operational workback while approval remains a separate PM action. No automatic rush fees, customer messages, quote repricing or staff reservation.

## Operating guide

1. Save the quote, including build dates and labor. Mark **Final** to automatically persist a preliminary workback before finalization. Existing quotes can use **Workback Schedule → Generate initial schedule** without changing their commercial revision.
2. In Overview, confirm **Project due date**, the whole-day stage baseline and shipping/install buffer. Default 25-day split is 4 / 1 / 3 / 10 / 5 / 2. If a boundary is a nonworking day, the schedule warns and uses the first/last available working day; it never invents extra production days. A zero-day stage is an explicit compression warning.
3. In Internal Schedule, select an item and confirm artwork responsibility, approvals, finish specification, client-supplied quantities, receipt, vendor lead time and cure/dry working days. Unknown means unknown, not zero. Material/description detection is a candidate rule, not AI interpretation of construction intent.
4. Generated dates, manual dates, actual completion, owner and internal notes remain separate. Edit prerequisites in Dependencies / source. Labor-task manual dates also become rules in the existing planner; actual completion is shared. Use Capacity’s detailed planner for daily crew-hours, waits and quoted labor reconciliation. Removing a workback labor row does not remove quoted demand.
5. Save schedule edits, review warnings and proposed changes, then approve. Closed Won activates workback while retaining PM approval. Approval freezes the first effective baseline and publishes proposed dates as the working schedule. Subsequent quote saves generate proposed comparisons rather than replacing approved working dates. Original baseline and append-only prior revisions remain intact. Creating workback for an already approved older labor plan does not replace that plan until explicit workback approval.
6. Client Schedule downloads a private PDF with six stages, applicable confirmed obligations and the configured conditions. It includes no monetary fields, estimated labor, employee assignments or internal notes. This is a download, not a public sharing or email service. Review missing-requirement warnings before sending a preliminary PDF.
7. Company administrators use **Capacity → Roster & Settings → Company workback defaults** for nonworking dates, stage shares/minimums, deadline offsets and conditions; Save roster & settings persists them. Existing workbacks keep their own settings, editable in Overview. Default offsets are editable starting assumptions (files 3, drawing corrections 2, approvals/receiving 1, scope cutoff 2, rush cutoff 1 working days), not confirmed client commitments.

## Storage and boundaries

Uses optional `workback` inside the existing `lab_production_schedule_revisions.document`; no new database migration required. The existing table already provides membership RLS, append-only history, revision sequencing and protected production baseline. The older planner endpoint preserves the authoritative workback metadata, preventing older clients from erasing it. Workback inputs are validated; all generated dates and history are computed server-side. A stale save returns 409.

Quote save success is retained if follow-up schedule refresh fails; a visible warning directs the user to retry generation. Finalization stops if initial workback persistence fails. An unsuccessful/stale Final status transaction may leave a harmless preliminary workback; retrying reuses the same schedule stream rather than duplicating schedules. This is not an external webhook/queue integration.

No automated global resource leveling, employee reservation, partial-batch CAD release, inferred supplier promises or automatic rush charges. Per-item work can overlap, and explicit dependencies support different handoffs; missing information and infeasible deadlines are flagged. Company staffing remains a planning estimate. The client PDF is an explicit allowlist projection, separate from internal task records.
