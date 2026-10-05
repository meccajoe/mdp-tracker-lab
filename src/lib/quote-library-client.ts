import type {QuoteV27} from './quote-v27';
import {adaFetch} from '@/lib/ada-client';
import {parseQuoteV27} from './quote-v27-validation';
export async function loadQuoteLibrary():Promise<{quotes:{workspace:string;workspaceId:string;document:QuoteV27}[];failures:number}> {
  const response=await adaFetch('/api/quote-workspaces');const body=await response.json();
  if(!response.ok)throw new Error(body.error||'Could not load saved quotes.');
  const results=await Promise.allSettled((body.workspaces??[]).map(async(workspace:{id:string;title:string})=>{
    const response=await adaFetch(`/api/quote-workspaces/${workspace.id}/workbook`),body=await response.json();
    if(!response.ok)throw new Error('Quote unavailable.');
    return body.document?{workspace:workspace.title,workspaceId:workspace.id,document:parseQuoteV27(body.document)}:null;
  }));
  return {quotes:results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]),failures:results.filter(result=>result.status==='rejected').length};
}
