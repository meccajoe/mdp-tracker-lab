import {NextResponse} from 'next/server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return NextResponse.json({error:'Prequote items are available only in Tracker Lab.'},{status:403});
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 const items=[];
 for(let offset=0;;offset+=500){const result=await actor.actorSupabase.from('lab_prequote_items').select('item_id,revision,title,created_at').order('title').order('item_id').range(offset,offset+499);
 if(result.error)return NextResponse.json({error:'The independent prequote library needs its lab database setup. Existing saved quote items are preserved.'},{status:503});
 items.push(...result.data);if(result.data.length<500)break;}
 return NextResponse.json({items},{headers:{'Cache-Control':'private, no-store'}});
}
