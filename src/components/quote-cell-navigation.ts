/** Resolve after React commits so an edited cell's replacement does not steal focus. */
export function moveToVerticalCell(element:HTMLElement,direction:number):boolean {
 const cell=element.closest('td,th') as HTMLTableCellElement|null;
 const row=cell?.parentElement as HTMLTableRowElement|null,body=row?.parentElement;
 if(!cell||!row||body?.tagName!=='TBODY')return false;
 const next=row.sectionRowIndex+direction,column=cell.cellIndex;
 if(!(body.children[next] as HTMLTableRowElement|undefined)?.cells[column])return false;
 element.blur();
 queueMicrotask(()=>{const targetCell=(body.children[next] as HTMLTableRowElement|undefined)?.cells[column];if(!targetCell)return;const target=targetCell.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')??targetCell;if(target===targetCell)target.tabIndex=-1;target.focus();if(target instanceof HTMLInputElement&&target.type==='text')target.select();});
 return true;
}
