/** Session-only history. Saved workbook revisions are separate and never rewritten. */
export type EditHistory<T> = {past:T[]; present:T; future:T[]; group:object|null};
export function newEditHistory<T>(present:T):EditHistory<T> {return {past:[],present,future:[],group:null};}
export function recordEdit<T>(history:EditHistory<T>, next:T, group:object|null=null):EditHistory<T> {
  if(JSON.stringify(history.present)===JSON.stringify(next))return history;
  const merge=group!==null&&history.group===group;
  return {past:merge?history.past:[...history.past.slice(-99),history.present],present:next,future:[],group};
}
export function moveEditHistory<T>(history:EditHistory<T>, direction:'undo'|'redo'):EditHistory<T> {
  if(direction==='undo') {
    if(!history.past.length)return history;
    return {past:history.past.slice(0,-1),present:history.past.at(-1)!,future:[history.present,...history.future],group:null};
  }
  if(!history.future.length)return history;
  return {past:[...history.past,history.present],present:history.future[0],future:history.future.slice(1),group:null};
}
