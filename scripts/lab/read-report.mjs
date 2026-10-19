// Run in the bot's supported secret environment; never put the token in arguments.
const report=process.argv[2]??'projects';
if(!['projects','roster','capacity','team-schedule'].includes(report))throw Error('Unknown report.');
const token=process.env.TRACKER_LAB_REPORTING_TOKEN;
if(!token)throw Error('Configure the TRACKER_LAB_REPORTING_TOKEN secret.');
const url=new URL('https://mdp-tracker-lab.vercel.app/api/lab-reporting/v1');
url.searchParams.set('report',report);
if(report==='capacity'){
 for(const [key,value] of [['start',process.argv[3]],['weeks',process.argv[4]],['basis',process.argv[5]]])if(value)url.searchParams.set(key,value);
}
const response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error('Tracker reporting returned HTTP '+response.status+'; request ID '+(response.headers.get('x-request-id')??'unavailable'));
console.log(JSON.stringify(await response.json(),null,2));
