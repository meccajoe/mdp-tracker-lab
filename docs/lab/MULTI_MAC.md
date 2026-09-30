# Working across Macs

GitHub stores shared source code and these working notes. Tracker Lab on Vercel runs the shared application; the lab Supabase database stores saved quote revisions. Each Mac has its own checkout and sign-in. A localhost preview and its browser-local test saves do not move between Macs.

## Use shared quotes

Open https://mdp-tracker-lab.vercel.app/quotes on each Mac and sign in with the same authorized Mecca Google account. Save a revision before switching computers, then reload the saved quote on the other Mac. Unsaved edits are local to the open page. A stale-save conflict means another revision was saved: download your draft before reloading and reconciling it.

Your account must have access to the same quote workspace on both Macs. A Google sign-in alone does not grant workspace membership. Do not create a separate workspace for each computer.

## Prepare a development Mac

1. Install GitHub CLI and Node 24 with npm from their official distributions (or an existing trusted package manager). `.nvmrc` pins the tested Node version; if nvm is already installed, run `nvm install` followed by `nvm use` in the checkout.
   For an existing Homebrew installation, `brew install gh node@24` installs the tools. Homebrew keeps Node 24 separate; add its bin directory to the shell PATH using the instructions printed by Homebrew (Apple Silicon: `/opt/homebrew/opt/node@24/bin`). Reopen the terminal before running npm.
2. Authenticate independently on that Mac:

   ```bash
   gh auth login --hostname github.com --git-protocol https --web
   gh auth setup-git --hostname github.com
   ```

3. Clone **only** the lab repository into a normal local folder, outside iCloud Drive/Dropbox or another folder-sync service:

   ```bash
   gh repo clone meccajoe/mdp-tracker-lab
   cd mdp-tracker-lab
   npm ci
   npm run lab:doctor
   npm run lab:check
   ```

4. Configure a Git name and an email associated with your GitHub account if the doctor reports they are missing. Open this checkout as the project in Codex. Read `AGENTS.md`, `LAB_STATUS.md` and `docs/lab/WORKING_BRIEF.md` before continuing work. A new task can resume from these notes and Git history; it does not need temporary files from the other Mac.

Quote tests and TypeScript do not need Supabase keys. For a full local app session, obtain **lab-only** settings through Joe's approved secure channel and place them in ignored `.env.local`. Never paste credentials into chat or commit/copy production environment files. Use the hosted lab for shared quote entry; do not transfer server credentials merely to view quotes on another Mac.

## Switch computers without losing work

Before leaving a Mac, save any quote revision in the hosted app. For code, check `git status`, run relevant tests, record the completed change and next step in `LAB_STATUS.md`, commit, and push. A local commit alone is not available on another Mac.

On the next Mac, check for local uncommitted work before pulling. On a clean main checkout:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run lab:doctor
npm run lab:check
```

If the checkout has local edits or the pull reports diverged history, preserve that work and ask Codex to reconcile it. Do not force-push, reset, or overwrite it. For concurrent development, use a distinct `codex/…` branch per change and push the branch before handing it off; check out that same branch on the next Mac. Do not edit the same branch simultaneously on multiple Macs.

## Publish to Tracker Lab

Push completed, checked work to the lab repository's `main` branch when ready to deploy. Existing Vercel Git integration is documented to deploy main to the lab's primary URL. Verify that the Vercel deployment is READY and its source commit matches the pushed SHA, then test the hosted app. A successful Git push alone is not deployment verification.

Only destination: Vercel project `mdp-tracker-lab` (`prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF`) in team `team_EEoCcHOGaLxcpWCZACyMGC54`. Only database: `gkvaeqlqrthztobxitvn`. Vercel calls this lab URL the production target; it is not business production. Joe controls promotion to business production.

## First two-Mac acceptance check

After the new build is deployed, create a clearly named test quote in an authorized lab workspace on Mac A, edit one estimate, and save its revision. Open that same quote on Mac B, confirm the value/revision, edit and save, then reload it on Mac A. Preserve the test quote unless Paul authorizes removal. This check is still required before claiming cross-Mac quote persistence is verified.
