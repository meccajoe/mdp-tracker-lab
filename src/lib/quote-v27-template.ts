import {applyLevyPricing} from './quote-v27';
import blank from '../data/quote-v27-blank.json';
import { emptyEstimators } from './quote-v27-estimators';
import { parseQuoteV27 } from './quote-v27-validation';

/** New drafts only. Never apply template defaults over a saved revision. */
export function createBlankQuoteV27() {
  const quote = parseQuoteV27(blank);
  const estimators = emptyEstimators();
  estimators.install.lead.lineId = 'line-28';
  estimators.install.second.lineId = 'line-29';
  estimators.install.third.lineId = 'line-30';
  estimators.install.support.lineId = 'line-31';
  estimators.travel.leadLineId = 'line-32';
  estimators.travel.pmLineId = 'line-33';
  estimators.travel.otherLineId = 'line-34';
  estimators.shipping.lineId = 'line-41';
  quote.estimators = estimators;
  applyLevyPricing(quote);
  return quote;
}
