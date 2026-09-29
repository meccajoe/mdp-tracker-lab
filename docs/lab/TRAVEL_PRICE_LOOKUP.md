# Travel price lookup in Tracker Lab

The v27 Travel estimator already owns traveler and trip shape, room nights, shared vehicles, per diem, and quote-line links. This lab slice adds a research control that proposes unit costs for airfare, hotel, and vehicle rental. Selected values feed the existing estimator and workbook math; the quote's configured travel markup remains authoritative.

## Lab boundary

The endpoint `POST /api/quote-workspaces/:id/travel-prices` requires authenticated `edit_draft` membership and the lab Supabase project URL. It returns a fixed, visibly labeled sample catalog. No external request, live inventory claim, booking action, credential, or database migration is involved. Its prices are independent of the submitted route and dates.

The `travelResearch` field is optional in a v27 workbook revision. Each selected sample records its kind, fixed sample ID and amount, unit, airport/date search, search time, and selection time. The parser checks the values against the fixed sample catalog. Manual edits to airfare, hotel, or vehicle unit costs clear that category's selection. Older revisions without this field remain valid.

## Acceptance path

1. Open a lab Quote Workspace with edit access and load or create a v27 workbook.
2. In Estimators → Travel, enter airport codes and departure/return dates, then select **Find sample prices**.
3. Select one sample in each of airfare, hotel, and vehicle; confirm the unit-cost fields and Travel cost change.
4. Save the workbook revision; reload it and confirm amounts and sample provenance persist.
5. Edit one unit cost manually; confirm only its sample provenance clears, then save again.
6. A viewer or archived workspace must not be able to call the lookup or save changes.

## Later provider integration

A live provider needs its own approved lab-only outbound policy and key. It should return the same unit categories, with explicit baggage, taxes, occupancy, and vehicle class assumptions. Provider prices must remain suggestions until a person selects them. Do not carry the sample provider ID or its fixed-price validation into production. Confirm the current markup policy before any production promotion.
