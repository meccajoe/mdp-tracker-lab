import {createClient} from '@supabase/supabase-js';
import {sourceReader} from '@/lib/lab-project-sync-source';
import {runProjectSync} from '@/lib/lab-project-sync';
export function syncConfigured(){return !!process.env.LAB_TRACKER_READ_TOKEN?.startsWith('sbp_fc')&&!!process.env.LAB_HUBSPOT_READ_TOKEN;}
export async function executeSync(mode:'manual'|'preview'|'scheduled'){
 if(!syncConfigured())throw Error('Sync source configuration missing');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
 return runProjectSync({db,query:sourceReader(process.env.LAB_TRACKER_READ_TOKEN!),hubspotToken:process.env.LAB_HUBSPOT_READ_TOKEN!,mode});
}
