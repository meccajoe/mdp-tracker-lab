import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';

// Never print the bearer secret. Keep credentials out of Git and command arguments.
const [destination,id,expiresAt]=process.argv.slice(2);
if(!destination||!/^[-a-zA-Z0-9_]{1,60}$/.test(id??'')||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw Error('Usage: node scripts/lab/create-reporting-key.mjs /absolute/private-file credential-id future-ISO-expiry');
const token='tlr_'+randomBytes(32).toString('base64url');
const registration={id,sha256:createHash('sha256').update(token).digest('hex'),expiresAt,reports:['projects','roster','capacity','team-schedule']};
writeFileSync(destination,JSON.stringify({token,registration},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({credentialFile:destination,registration}));
