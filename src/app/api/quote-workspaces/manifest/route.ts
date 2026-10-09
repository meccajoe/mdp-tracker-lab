import {NextResponse} from 'next/server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
import {canPerformQuoteAction, type QuoteWorkspaceRole} from '@/lib/quote-permissions';

export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One bounded page of revision numbers, never workbook documents. Both workspace
// and revision reads use the verified actor's RLS client, not the service role.
export async function GET(request:Request){
  const access=await requireQuoteProductAccess();
  if(!access.ok){access.response.headers.set('Cache-Control','private, no-store');return access.response;}
  const cursor=new URL(request.url).searchParams.get('cursor');
  if(cursor&&!uuid.test(cursor))return json({error:'Invalid quote cursor.'},400);
  const roles=new Map<string,QuoteWorkspaceRole>();
  for(let offset=0;;offset+=1000){
    const result=await access.supabase.from('quote_workspace_members').select('workspace_id, workspace_role')
      .eq('user_id',access.actorId).eq('email_normalized',access.actorEmail).is('removed_at',null)
      .order('workspace_id').range(offset,offset+999);
    if(result.error)return json({error:'Quote permissions could not load.'},500);
    for(const row of result.data??[])roles.set(row.workspace_id,row.workspace_role);
    if((result.data?.length??0)<1000)break;
  }
  const actorKey=`${access.actorId}:${access.actorEmail}`;
  if(!roles.size)return json({actorKey,workspaces:[],nextCursor:null});
  let query=access.actorSupabase.from('ada_quote_workspaces')
    .select('id, title, status, lifecycle_status, archived_at, quote_workbook_revisions(revision)')
    .in('id',[...roles.keys()]).neq('lifecycle_status','archived').is('archived_at',null)
    .order('id').limit(101)
    .order('revision',{referencedTable:'quote_workbook_revisions',ascending:false})
    .limit(1,{referencedTable:'quote_workbook_revisions'});
  if(cursor)query=query.gt('id',cursor);
  const result=await query;
  if(result.error)return json({error:'Quote revision manifest could not load.'},500);
  const rows=result.data??[];
  const workspaces=rows.slice(0,100).map(row=>({
    id:row.id,title:row.title,lifecycle:row.lifecycle_status,
    revision:row.quote_workbook_revisions?.[0]?.revision??0,
    canEdit:canPerformQuoteAction({email:access.actorEmail,systemRole:access.actorRole,
      workspaceRole:roles.get(row.id)??null,isActiveMember:roles.has(row.id),capabilities:[]},'edit_draft'),
  }));
  return json({actorKey,workspaces,nextCursor:rows.length>100?workspaces[99].id:null});
}
