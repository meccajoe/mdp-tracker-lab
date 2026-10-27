'use client';
import {createRoot} from 'react-dom/client';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription} from './ui/alert-dialog';
import {Button} from './ui/button';

let pending:Promise<boolean>|null=null;
/** A centered, focus-trapped confirmation for application actions. */
export function confirmAction(message:string):Promise<boolean>{
 if(pending)return Promise.resolve(false);
 const host=document.createElement('div');document.body.append(host);
 const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const root=createRoot(host);
 pending=new Promise<boolean>(resolve=>{
  let finished=false;
  const finish=(answer:boolean)=>{if(finished)return;finished=true;pending=null;resolve(answer);queueMicrotask(()=>{root.unmount();host.remove();previous?.focus();});};
  root.render(<AlertDialog open onOpenChange={open=>{if(!open)finish(false);}}><AlertDialogContent><AlertDialogTitle>Please confirm</AlertDialogTitle><AlertDialogDescription>{message}</AlertDialogDescription><div className="flex justify-end gap-2"><Button variant="outline" autoFocus onClick={()=>finish(false)}>Cancel</Button><Button onClick={()=>finish(true)}>Confirm</Button></div></AlertDialogContent></AlertDialog>);
 });
 return pending;
}
const allowedLinks=new WeakSet<HTMLAnchorElement>();
/** Stop navigation synchronously, then replay the original link only after approval. */
export function confirmLinkNavigation(event:MouseEvent|React.MouseEvent,message:string){
 const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
 if(!link||allowedLinks.has(link))return;
 event.preventDefault();event.stopPropagation();
 void confirmAction(message).then(accepted=>{if(accepted&&link.isConnected){allowedLinks.add(link);link.click();allowedLinks.delete(link);}});
}
