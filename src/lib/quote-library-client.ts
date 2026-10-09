import type {QuoteV27} from './quote-v27';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from './quote-v27-validation';
import {supabase} from './supabase';
import {createQuoteLibraryCache} from './quote-library-cache';
const cache=createQuoteLibraryCache(adaFetch,parseQuoteV27);
const actorKey=(user:{id:string;email?:string}|null)=>user?`${user.id}:${user.email?.toLowerCase()??''}`:null;
let identity:string|null=null;
function identify(key:string|null){
  cache.setIdentity(key);
  if(identity!==key){const previous=identity;identity=key;if(previous!==null&&typeof window!=='undefined')window.dispatchEvent(new Event('quote-library-identity-changed'));}
}
if(typeof window!=='undefined')supabase.auth.onAuthStateChange((_event,session)=>identify(actorKey(session?.user??null)));
export function invalidateQuoteLibrary(){
  cache.invalidate();
  if(typeof window!=='undefined')window.dispatchEvent(new Event('quote-workbook-saved'));
}
export async function loadSavedQuotes(options:{excludeWorkspaceId?:string;maxAgeMs?:number}={}){
  const {data,error}=await supabase.auth.getSession();
  identify(error?null:actorKey(data.session?.user??null));
  return cache.load(options);
}
export async function loadQuoteLibrary(options:{excludeWorkspaceId?:string;maxAgeMs?:number}={}):Promise<{quotes:{workspace:string;workspaceId:string;document:QuoteV27}[];failures:number}> {
  const result=await loadSavedQuotes(options);
  return {quotes:result.quotes.flatMap(quote=>quote.document?[{workspace:quote.workspace,workspaceId:quote.workspaceId,document:quote.document}]:[]),failures:result.failures};
}
