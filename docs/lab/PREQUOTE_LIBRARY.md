# Independent prequote library

The library lives at `/prequote-items`, separate from quote workspaces. Explicit Save as reusable on Takeoffs or Quote Builder creates a single-item snapshot. Each item has its own append-only revisions and the normal workbook editor/Undo/Redo/autosave. Source quotes and previously inserted copies stay unchanged. Insert uses the current Materials DB catalog, preserves explicit quote-item overrides, and fills the first unused item slot and first adequate blank takeoff run. A missing/ambiguous catalog match blocks insertion without modifying the quote.

Earlier quote-linked reusable designations remain in saved revisions. “Find earlier saved items” lets Paul explicitly copy them to the new library. New saves never write reusable designations into quote workspaces.

## Hosted setup for Joe

Only Supabase lab `gkvaeqlqrthztobxitvn`. Apply `supabase/migrations/20261006150000_lab_prequote_library.sql` once through the lab SQL editor or a reviewed lab migration workflow. Do not replay historical migrations or use `db push --include-all`.

The migration adds `lab_prequote_revisions`, a latest-item view, append sequencing and actor RLS. Existing quote data is untouched. Access uses the existing quote product allowlist and active `create_workspace` capability for writes. No service-role write path is granted. API routes enforce the exact lab project URL.

Before applying, verify neither new relation already exists; if they do, inspect their definitions instead of rerunning. After applying, refresh `/prequote-items`, save a dedicated test item from a test quote, reopen/edit/save it, and insert it into a test quote. Check that the source quote remains unchanged. Test conflicting revision saves and unauthorized access. The UI reports a setup error until the migration is installed; it does not silently fall back to storing items in quotes.

Local database checks: `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/prequote-db.test.mjs` runs in a disposable database and requires no hosted credentials. General quote checks: `npm run lab:check`.
