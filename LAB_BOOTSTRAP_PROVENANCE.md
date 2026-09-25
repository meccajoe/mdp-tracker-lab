# Lab Bootstrap Provenance

- Source repository: `meccajoe/mdp-tracker`
- Original baseline: `8e9abf754307437bbae469f735f462e2a31104b9`
- Sanitized rewritten baseline: `8cebfb56c1b1443caf8bccd7f7efdbd73a3a986a`
- Destination: `meccajoe/mdp-tracker-lab`

The reachable source history was rewritten to remove a tracked Supabase
service-role credential. The current diagnostic script requires its Supabase
URL and service-role key through environment variables and has no hardcoded
credential fallback.