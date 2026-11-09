import {PEOPLE} from './quote-v27-estimators';
export type PerDiemRecipients=Partial<Record<typeof PEOPLE[number],string>>;
export function parsePerDiemRecipients(value:unknown):PerDiemRecipients{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid recipient names.');
 const result:PerDiemRecipients={};
 for(const [role,name] of Object.entries(value)){
  if(!PEOPLE.includes(role as typeof PEOPLE[number])||typeof name!=='string'||name.trim().length>120||/[\u0000-\u001f\u007f]/.test(name))throw Error('Enter a name of up to 120 characters for a listed role.');
  if(name.trim())result[role as typeof PEOPLE[number]]=name.trim();
 }
 return result;
}
