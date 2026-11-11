export const FIND_SECTIONS=[
 {key:'expenses',label:'Expenses',href:'/expenses'},
 {key:'items',label:'Items',href:'/line-item-search'},
 {key:'materials',label:'Materials',href:'/admin/materials'},
 {key:'quoted-items',label:'Quoted Items',href:'/prequote-items'},
] as const;
export function findSectionForPath(path:string){
 if(path==='/find')return 'expenses';
 return FIND_SECTIONS.find(s=>path===s.href||path.startsWith(s.href+'/'))?.key??null;
}
export function usesTrackerV2Ui(path:string){
 return path!=='/login'&&!['/quotes','/capacity','/ada'].some(root=>path===root||path.startsWith(root+'/'));
}
