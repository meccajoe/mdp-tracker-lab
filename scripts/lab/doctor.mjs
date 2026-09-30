import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
let problems = 0;
function check(ok, message) {
  console.log(`${ok ? 'OK' : 'NEEDS SETUP'}: ${message}`);
  if (!ok) problems++;
}
function command(name, args) {
  try { return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}
check(Number(process.versions.node.split('.')[0]) === 24, `Node ${process.versions.node}; use Node 24 (.nvmrc pins the tested version).`);
check(Boolean(command('npm', ['--version'])), 'npm available for the existing package-lock.json.');
const remote = command('git', ['remote', 'get-url', 'origin']);
check(['https://github.com/meccajoe/mdp-tracker-lab.git','https://github.com/meccajoe/mdp-tracker-lab','git@github.com:meccajoe/mdp-tracker-lab.git'].includes(remote), 'origin points only to meccajoe/mdp-tracker-lab.');
check(existsSync('node_modules/next/package.json'), 'Locked application dependencies installed (npm ci).');
check(Boolean(command('git', ['config', 'user.name'])) && Boolean(command('git', ['config', 'user.email'])), 'Git commit identity configured.');
const gh = command('gh', ['auth', 'status', '--hostname', 'github.com']);
console.log(gh !== null ? 'OK: GitHub CLI authentication available (write permission still requires a push check).' : 'INFO: GitHub CLI is not installed or signed in; use gh auth login, or authenticated GitHub Desktop.');
const trackedEnv = command('git', ['ls-files', '.env.local', '.env.production.local', '.env.development.local']);
check(!trackedEnv, 'Local credential files are not tracked.');
console.log(existsSync('.env.local') ? 'INFO: Local environment file present; values were not read or printed.' : 'INFO: No .env.local. Quote tests work without keys; use the hosted lab for shared quotes.');
if (existsSync('.vercel/project.json')) {
  const link = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
  check(link.projectId === 'prj_H6frjmh8wPjYXFzK4aBHRjd7VhmF' && link.orgId === 'team_EEoCcHOGaLxcpWCZACyMGC54', 'Vercel link matches Tracker Lab.');
} else console.log('INFO: No direct Vercel link needed for Git-triggered deployments.');
console.log('Shared quote URL: https://mdp-tracker-lab.vercel.app/quotes');
process.exitCode = problems ? 1 : 0;
