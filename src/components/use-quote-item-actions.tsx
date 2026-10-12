'use client';
import {useState} from 'react';
import type {QuoteV27} from '@/lib/quote-v27';
import {cloneQuoteItem,deleteQuoteItem} from '@/lib/quote-item-actions';
import {savePrequoteItem} from './quote-reusable-items';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import styles from './quote-sheet.module.css';

/** Shared whole-item actions for Quote Builder and Takeoffs; one dialog per worksheet. */
export function useQuoteItemActions({quote,edit,readOnly,libraryItem=false,onChanged}:{
 quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;readOnly:boolean;libraryItem?:boolean;onChanged?:()=>void;
}){
 const [pendingDelete,setPendingDelete]=useState<string|null>(null);
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 function menu(id:string,label:string){
  const line=quote.lines.find(line=>line.id===id);
  if(!line||libraryItem)return null;
  return <DropdownMenu><DropdownMenuTrigger data-quote-item-menu disabled={readOnly||saving} aria-label={label} title={`Actions for ${line.name}`} className={styles.itemMenuButton}>⋮</DropdownMenuTrigger>
   <DropdownMenuContent className="min-w-48" onKeyDown={event=>event.stopPropagation()}>
    <DropdownMenuItem disabled={readOnly} onClick={()=>{try{edit(next=>{cloneQuoteItem(next,id);});setError('');onChanged?.();}catch(error){setError(error instanceof Error?error.message:'Could not clone item.');}}}>Clone</DropdownMenuItem>
    <DropdownMenuItem disabled={readOnly} onClick={()=>setPendingDelete(id)}>Delete</DropdownMenuItem>
    <DropdownMenuItem disabled={readOnly||saving} onClick={async()=>{setSaving(true);setError('');try{await savePrequoteItem(quote,id);setNotice(`Saved ${line.name} to the Prequote items library.`);}catch(error){setError(error instanceof Error?error.message:'Could not save item.');}finally{setSaving(false);}}}>Save as prequote item</DropdownMenuItem>
   </DropdownMenuContent>
  </DropdownMenu>;
 }
 const feedback=<>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  <AlertDialog open={pendingDelete!==null} onOpenChange={open=>{if(!open)setPendingDelete(null);}}>
   <AlertDialogContent onKeyDown={event=>event.stopPropagation()}>
    <AlertDialogTitle>Are you sure you want to delete this item?</AlertDialogTitle>
    <AlertDialogDescription>{quote.lines.find(line=>line.id===pendingDelete)?.name} and all its linked takeoff rows will be removed from this quote. Undo restores the item.</AlertDialogDescription>
    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={readOnly} onClick={()=>{if(pendingDelete&&!readOnly){edit(next=>deleteQuoteItem(next,pendingDelete));setPendingDelete(null);onChanged?.();}}}>Delete item</AlertDialogAction></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog></>;
 return {menu,feedback};
}
