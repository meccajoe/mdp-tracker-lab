# MDP Tracker Architecture

## Ada quote workspace

Ada is a private, pre-project estimating workspace under `/ada`. A workspace belongs to one Ada-enabled Tracker user and owns its projects/chats, messages, private assets, drawing analyses, immutable quote revisions, revision-linked Sheets, reviewed Sheet changes, and audit events. Existing Tracker operational data is read-only evidence until an accepted revision is handed off through a separately approved workflow.

### Authorization

Browser calls use the active Supabase bearer session through `src/lib/ada-client.ts`. Server routes resolve and validate that session in `src/lib/ada-server.ts`, require `ada_access`, and scope direct workspace operations to `created_by_email`. Admin user-role mutations run through protected server routes rather than direct browser writes.

### Conversation and streaming

`POST /api/ada/workspaces/[workspaceId]/messages` claims a durable request ID through `ada_chat_turns`, persists the user message, loads permission-aware Tracker context, and returns newline-delimited JSON (`application/x-ndjson`). Event types are:

- `status` — context/evidence/responding/quote-update phase
- `delta` — user-facing Markdown text
- `final` — canonical persisted user message, assistant message, revision, and delta
- `error` — durable failed-turn result

`src/lib/ada-conversation.ts` streams natural-language text from Anthropic first, then validates a hidden `finalize_ada_turn` tool payload for citations, one clarification, limitations, and a possible quote-revision instruction. Quote mutations happen only after that control payload validates. A disconnected browser does not abort the server generation; the durable request claim and final response support safe replay without duplicate messages or revisions.

The client decodes the stream in `src/lib/ada-stream-protocol.ts`, renders incremental safe Markdown, and replaces the temporary stream with the canonical persisted message on `final`.

### Reader-intent scroll model

`src/components/ada-conversation-scroller.tsx` owns transcript position. A submitted user turn is the explicit anchor. Streaming follows only while the reader remains at the live edge. Scrolling away, selecting text, keyboard navigation, opening links, or search pauses following. New content may continue offscreen; **Jump to latest** returns to the live edge and resumes following. The last meaningful turn/offset is stored per workspace, resize compensation preserves the visible anchor, and older messages use containment plus `content-visibility` for long-thread responsiveness.

`src/components/ada-conversation-rail.tsx` maps user turns to accessible navigation markers. Desktop/iPad show a slim persistent rail; phone uses a compact expandable navigator. Jumping to an older turn pauses live following.

### Tracker intelligence and quote integrity

`src/lib/ada-intelligence/` plans bounded, role-aware retrieval across authorized materials, vendor prices, comparables, quote lines, expenses, labor summaries, and formulas. Evidence carries source identity, rationale, freshness, confidence, and limitations. Historical financial anchors require enough meaningful authorized comparables.

### Drawing-first initial quote workflow

A new quote can begin with a client-provided PDF or image and no typed scope. The signed upload completes first, then the client automatically invokes server-side vision analysis and the owner-scoped `assets/[assetId]/initial-quote` route. The route requires a persisted `ready` analysis, combines all ready workspace assets with bounded Tracker intelligence, generates and atomically persists Revision 1, and adds truthful upload/analysis/quote messages to the conversation with an exact asset citation. If a revision already exists, the new file is analyzed and retained as evidence but never silently replaces or revises the quote. Analysis questions are review prompts for improving the next revision; they do not block the initial expert estimate.

### Alpha feedback and backlog mirror

Every Ada screen renders a persistent `AdaFeedbackWidget`. Authenticated Ada users can submit categorized feedback with the current page and optional owned-workspace context through `POST /api/ada/feedback`; the server validates length/category, verifies workspace ownership, and writes to the service-only `ada_feedback` table. A deterministic scheduled script mirrors all non-resolved records into a local Markdown backlog for internal review. Feedback status lives in the database (`new`, `triaged`, `planned`, `resolved`); marking an item resolved removes it from the active mirror on the next sync. The monitor never exposes service credentials or makes product changes.

Tracker evidence calibrates pricing but is not a prerequisite for an estimate. Ada's pricing hierarchy is explicit user guidance, authorized Tracker evidence, Opus expert industry judgment, or a labeled blend. Only pricing stated directly by a user is `user_input`; an estimate from an earlier Ada turn remains `expert_estimate` and must never be described as client-supplied. When source rates are sparse, Ada must still produce a single best point estimate using reasonable market-aware material rates, labor productivity, logistics, margin, and risk allowances. Model-derived lines are labeled `expert_estimate`, include an assumption and confidence, and never pretend to be Tracker citations. Unknowns become working assumptions, contingencies, or review items rather than blocking quote delivery.

All quote creation paths use canonical server validation and the atomic `create_ada_quote_revision` database function. Acceptance is latest-revision-only, revision-specific, audited, and idempotent. Creating a newer revision invalidates prior acceptance.
