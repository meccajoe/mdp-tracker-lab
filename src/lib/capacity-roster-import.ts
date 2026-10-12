import type {WorkBook} from 'xlsx';
import {emptyCapacity,parseCapacity,type RosterPerson} from './capacity';
/** Import roster inputs only; never execute formulas or alter workbook/project settings. */
export function importCapacityRoster(book:WorkBook,makeId:()=>string):RosterPerson[]{
 const sheet=book.Sheets['Roster & Settings'];
 if(!sheet)throw new Error('The workbook needs a Roster & Settings tab.');
 const value=(address:string)=>{const cell=sheet[address];if(cell?.t==='e'||(cell?.f&&cell.v===undefined))throw new Error(`${address}: saved formula result is unavailable.`);return cell?.v;};
 const text=(address:string)=>String(value(address)??'').trim();
 const headers=['Name','Primary trade','Secondary trade (flex)','Hours / week','Hourly rate $','Active? (Yes/No)','Notes'];
 if(headers.some((header,i)=>text(`${String.fromCharCode(65+i)}12`)!==header))throw new Error('Roster columns do not match the v5 template. Expected Name, Primary trade, Secondary trade, Hours / week, Hourly rate, Active and Notes on row 12.');
 const lastRow=Number(/(\d+)$/.exec(String(sheet['!fullref']??sheet['!ref']??''))?.[1]??0);
 if(lastRow>312)throw new Error('Roster worksheet extends beyond the 300-person limit.');
 const rows:RosterPerson[]=[];
 const numeric=(address:string,nullable=false)=>{const v=value(address);if(nullable&&(v===undefined||v===null||v===''))return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw new Error(`${address}: enter a nonnegative number in the spreadsheet.`);return v;};
 // Bound the sheet to the same 300-person limit as shared capacity settings.
 for(const address of Object.keys(sheet)){const match=/^[A-G](\d+)$/.exec(address);if(match&&Number(match[1])>312&&text(address))throw new Error('Roster data extends beyond the 300-person limit.');}
 for(let row=13;row<=312;row++){
  if(!['A','B','C','D','E','F','G'].some(col=>text(`${col}${row}`)))continue;
  const name=text(`A${row}`),primary=text(`B${row}`),active=text(`F${row}`).toLowerCase();
  if(!name||!primary)throw new Error(`Roster row ${row}: Name and Primary trade are required.`);
  if(!['yes','no'].includes(active))throw new Error(`F${row}: Active must be Yes or No.`);
  const hours=numeric(`D${row}`)!;if(hours>168)throw new Error(`D${row}: weekly hours cannot exceed 168.`);
  rows.push({id:makeId(),name,primary,secondary:text(`C${row}`),hours,rate:numeric(`E${row}`,true),active:active==='yes',notes:text(`G${row}`)});
 }
 if(!rows.length)throw new Error('The spreadsheet roster is empty.');
 return parseCapacity({settings:{...emptyCapacity().settings,roster:rows}}).settings.roster;
}
