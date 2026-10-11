import {createBlankQuoteV27} from './quote-v27-template';
import {parseQuoteV27} from './quote-v27-validation';
import type {QuoteV27} from './quote-v27';
export type QuoteDefaults=Pick<QuoteV27,'settings'|'trades'|'commission'|'pricingVersion'|'contingencyByType'>;
export function quoteDefaults(quote:QuoteV27):QuoteDefaults {
 const {settings,trades,commission,pricingVersion,contingencyByType}=quote;
 return structuredClone({settings,trades,commission,pricingVersion,contingencyByType});
}
export function quoteFromDefaults(value:unknown):QuoteV27 {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid global settings.');
 const v=value as QuoteDefaults;
 if(v.pricingVersion!=='levies-v1')throw new Error('Global settings require current levy pricing.');
 return parseQuoteV27({...createBlankQuoteV27(),settings:v.settings,trades:v.trades,commission:v.commission,pricingVersion:v.pricingVersion,contingencyByType:v.contingencyByType});
}
export function cloneQuoteDocument(source:QuoteV27,copySchedule=false):QuoteV27 {
 const copy=parseQuoteV27(structuredClone(source));
 if(!copySchedule){delete copy.schedule;delete copy.planning;}
 return copy;
}
export function requiredQuoteNames(body:Record<string,unknown>){
 const title=typeof body.title==='string'?body.title.trim():'';
 const clientName=typeof body.clientName==='string'?body.clientName.trim():'';
 if(!title||title.length>300)throw new Error('Project Name is required (maximum 300 characters).');
 if(!clientName||clientName.length>300)throw new Error('Client Name is required (maximum 300 characters).');
 return {title,clientName};
}
