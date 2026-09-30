# MDP Tracker Lab

Paul’s isolated quote-builder development environment. Only meccajoe/mdp-tracker-lab and its lab services are authorized; Joe controls promotion to business production.

## Shared application

Use [Tracker Lab](https://mdp-tracker-lab.vercel.app/quotes) on each Mac with the same authorized Mecca account. Saved lab quote revisions are shared; localhost preview data and unsaved edits are not.

## Development on each Mac

Follow [the multi-Mac setup and handoff guide](docs/lab/MULTI_MAC.md). Read AGENTS.md, LAB_STATUS.md and docs/lab/WORKING_BRIEF.md first. Use Node 24 (tested version in .nvmrc) and the existing npm lockfile.

```bash
npm ci
npm run lab:doctor
npm run lab:check
```

Local app operation additionally needs approved lab-only configuration in ignored .env.local. Do not enable outbound integrations or replay historical migrations. Deployment boundaries are in AGENTS.md and docs/lab/DEPLOYMENT_SETUP.md.

[Historical upstream README](docs/lab/HISTORICAL_README.md) is preserved for reference only; its production/integration instructions are not lab setup instructions.
