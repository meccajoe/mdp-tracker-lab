# Separate quote, forecast and project statuses

Implemented on codex/quote-project-status. Paul confirmed applying the migration in the lab SQL Editor on October 21; released as b374b05. Hosted Final project/forecast saves and reload verified on an internal test quote, subsequently archived. Direct SQL inspection and migration-ledger registration remain unverified. Do not replay.

## Required lab database step

An authorized administrator must open the SQL Editor for **gkvaeqlqrthztobxitvn** (Tracker Lab), paste and run only:

`supabase/migrations/20261021220000_lab_project_status.sql`

This transaction updates the Final-quote guard to allow the validated schedule.projectStatus metadata field. It does not rewrite quotes, revisions, prices, approvals or roster data. Do not run historical migrations or db push --include-all.

Confirm the function contains the new field:
```sql
select pg_get_functiondef('public.lab_quote_final_guard()'::regprocedure);
```
Record this migration using the project's verified migration-history procedure; do not replay it blindly.

After the database step, merge the tested branch into lab main, verify its Vercel deployment, then use an internal test quote to confirm all three status controls save/reopen. Check that Complete drops demand to zero, Not Active retains forecast demand but is excluded from named assignments, and Active is eligible. Existing approved schedules must be explicitly regenerated/reviewed, not silently replaced.

## Behavior

- Forecast: Not Likely, Possible, Likely, Highly Likely, Closed Won, Closed Lost.
- Quote: Draft or Final.
- Project: Not Active, Active, Complete; independently stored in the quote's schedule metadata.
- Old In production maps to Active; old Completed maps to Complete. Old Closed won defaults to Active to preserve existing committed scheduling. This is read-time compatibility, not a rewrite.
- Historical lifecycle forecast values remain readable by old workbook/capacity controls. New main Quotes controls use the six sales choices.
- Each edit appends a revision and retains commercial data. Project edits normalize legacy lifecycle forecast values to Closed Won. Final guard retains commercial/date/engine protection.
- Quote status is independent of forecast and project status. Not Active projects retain forecast weighting; Active projects are committed at full demand; Complete projects have zero future demand.
- The new Project Status column is sortable and resizable.
