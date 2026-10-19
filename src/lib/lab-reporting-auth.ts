import {createHash, timingSafeEqual} from 'node:crypto';

export const REPORTING_LAB_URL='https://gkvaeqlqrthztobxitvn.supabase.co';
export const REPORTS=['projects','roster','capacity','team-schedule'] as const;
export type Report=typeof REPORTS[number];
export type ReportingKey={id:string;sha256:string;expiresAt:string;reports:Report[]};

/** Only dedicated opaque reporting tokens; cookies and human JWTs never grant access. */
export function reportingIdentity(header:string|null,registry:string|undefined,now=Date.now()):ReportingKey|null {
 const match=/^Bearer (tlr_[A-Za-z0-9_-]{43})$/.exec(header??'');
 if(!match||!registry)return null;
 try{
  const keys=JSON.parse(registry) as ReportingKey[];
  if(!Array.isArray(keys)||keys.length>20)return null;
  const digest=createHash('sha256').update(match[1]).digest();
  for(const key of keys){
   if(!key||!/^[-a-zA-Z0-9_]{1,60}$/.test(key.id)||! /^[a-f0-9]{64}$/.test(key.sha256)||!Number.isFinite(Date.parse(key.expiresAt))||Date.parse(key.expiresAt)<=now||!Array.isArray(key.reports)||key.reports.some(r=>!REPORTS.includes(r)))continue;
   if(timingSafeEqual(digest,Buffer.from(key.sha256,'hex')))return key;
  }
 }catch{/* Misconfiguration fails closed without logging credential material. */}
 return null;
}

/** Best-effort per-instance guard; not a distributed quota. No unbounded attacker keys. */
const windows=new Map<string,{start:number;count:number}>();
export function reportingRateLimit(id:string,now=Date.now()){
 let window=windows.get(id);
 if(!window||now-window.start>=60000){window={start:now,count:0};windows.set(id,window);}
 if(windows.size>40)for(const [key,value] of windows)if(now-value.start>=60000)windows.delete(key);
 return ++window.count<=30;
}
