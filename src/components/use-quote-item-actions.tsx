'use client';
import {useState} from 'react';
import type {QuoteV27} from '@/lib/quote-v27';
import {cloneQuoteItem,deleteQuoteItem} from '@/lib/quote-item-actions';
import {savePrequoteItem} from './quote-reusable-items';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import styles from './quote-sheet.module.css';

/** Shared whole-item actions for Quote Builder and Takeoffs; one dialog per worksheet. */
export function useQuoteItemActions({quote,edit,readOnly,libraryItem=false,onChanged,onAddExisting}:{
 quote:QuoteV27;edit:(change:(next:QuoteV27)=>void)=>void;readOnly:boolean;libraryItem?:boolean;onChanged?:()=>void;onAddExisting?:()=>void;
}){
 const [rename,setRename]=useState<string|null>(null),[name,setName]=useState('');
 const [pendingDelete,setPendingDelete]=useState<string|null>(null);
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 function menu(id:string,label:string){
  const line=quote.lines.find(line=>line.id===id);
  if(libraryItem||(!line&&!onAddExisting))return null;
  return <DropdownMenu><DropdownMenuTrigger data-quote-item-menu disabled={readOnly||saving} aria-label={label} title={line?`Actions for ${line.name}`:'Add an existing item'} className={styles.itemMenuButton}>⋮</DropdownMenuTrigger>
   <DropdownMenuContent className="min-w-48" onKeyDown={event=>event.stopPropagation()}>
    {onAddExisting&&<DropdownMenuItem disabled={readOnly} onClick={onAddExisting}>Add Existing Item</DropdownMenuItem>}
    <DropdownMenuItem disabled={readOnly||!line} onClick={()=>{try{edit(next=>{cloneQuoteItem(next,id);});setError('');onChanged?.();}catch(error){setError(error instanceof Error?error.message:'Could not clone item.');}}}>Clone</DropdownMenuItem>
    <DropdownMenuItem disabled={readOnly||!line} onClick={()=>{setRename(id);setName(line?.name??'');}}>Rename item</DropdownMenuItem>
    <DropdownMenuItem disabled={readOnly||!line} onClick={()=>setPendingDelete(id)}>Delete</DropdownMenuItem>
    <DropdownMenuItem disabled={readOnly||saving||!line} onClick={async()=>{setSaving(true);setError('');try{await savePrequoteItem(quote,id);setNotice(`Saved ${line?.name} to the Quoted Item Database.`);}catch(error){setError(error instanceof Error?error.message:'Could not save item.');}finally{setSaving(false);}}}>Save to Quoted Item Database</DropdownMenuItem>
   </DropdownMenuContent>
  </DropdownMenu>;
 }
 const feedback=<>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  <AlertDialog open={rename!==null} onOpenChange={open=>{if(!open)setRename(null);}}><AlertDialogContent onKeyDown={e=>e.stopPropagation()}><AlertDialogTitle>Rename item</AlertDialogTitle><AlertDialogDescription>This name updates every linked takeoff row and the Quote Builder item. Existing saved revisions stay unchanged.</AlertDialogDescription><label>Item name<input className="w-full rounded border p-2" autoFocus value={name} maxLength={2000} onChange={e=>setName(e.target.value)}/></label><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={readOnly||!name.trim()||quote.lines.some(l=>l.id!==rename&&l.name.toLowerCase()===name.trim().toLowerCase())} onClick={()=>{edit(next=>{next.lines.find(l=>l.id===rename)!.name=name.trim();});setRename(null);}}>Save name</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={pendingDelete!==null} onOpenChange={open=>{if(!open)setPendingDelete(null);}}>
   <AlertDialogContent onKeyDown={event=>event.stopPropagation()}>
    <AlertDialogTitle>Are you sure you want to delete this item?</AlertDialogTitle>
    <AlertDialogDescription>{quote.lines.find(line=>line.id===pendingDelete)?.name} and all its linked takeoff rows will be removed from this quote. Undo restores the item.</AlertDialogDescription>
    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={readOnly} onClick={()=>{if(pendingDelete&&!readOnly){edit(next=>deleteQuoteItem(next,pendingDelete));setPendingDelete(null);onChanged?.();}}}>Delete item</AlertDialogAction></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog></>;
 return {menu,feedback};
}
