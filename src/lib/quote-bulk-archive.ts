/** Independent results: never report all archived when one request was denied or failed. */
export async function changeQuoteArchives(ids:string[],restore:boolean,fetcher:(url:string,init:RequestInit)=>Promise<Response>){
 const succeeded:string[]=[],failed:string[]=[],errors:string[]=[];
 for(const id of [...new Set(ids)]){
  try{const response=await fetcher(`/api/quote-workspaces/${encodeURIComponent(id)}${restore?'/restore':''}`,{method:restore?'POST':'DELETE'});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Quote could not be changed.');succeeded.push(id);}
  catch(error){failed.push(id);errors.push(error instanceof Error?error.message:'Quote could not be changed.');}
 }
 return {succeeded,failed,errors};
}
