import type {Settings} from './quote-v27';
export const ALLOWANCE_DEFAULTS={perDiemInstall:70,perDiemTravel:50,perDiemOff:70,leadBonusInstall:50,leadBonusTravel:0,leadBonusOff:0};
export const ALLOWANCE_KEYS=Object.keys(ALLOWANCE_DEFAULTS) as (keyof typeof ALLOWANCE_DEFAULTS)[];
export function travelAllowanceRows(settings:Settings,legacy:{perDiem:number;roadBonus:number},days:{install:number;dismantle:number;travel:number;off:number},bonusEnabled:boolean,travelOverride?:number){
 const modern=settings.perDiemInstall!==undefined;
 return (['travel','install','dismantle','off'] as const).map(key=>{
  const category=key==='dismantle'?'install':key,rate=modern?settings[({install:'perDiemInstall',travel:'perDiemTravel',off:'perDiemOff'} as const)[category]]!:legacy.perDiem;
  const bonusRate=bonusEnabled?(modern?settings[({install:'leadBonusInstall',travel:'leadBonusTravel',off:'leadBonusOff'} as const)[category]]!:legacy.roadBonus):0;
  const effective=key==='travel'&&travelOverride!==undefined?travelOverride:rate;
  return {label:{travel:'Travel',install:'Install',dismantle:'Dismantle',off:'Off'}[key],days:days[key],rate:effective,quotedRate:rate,perDiem:days[key]*effective,quotedPerDiem:days[key]*rate,bonusRate,bonus:days[key]*bonusRate};
 });
}
