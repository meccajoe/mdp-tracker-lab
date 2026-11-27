import type {calculateQuoteV27} from './quote-v27';
/** Reporting classification for every quote version; never changes prices or saved inputs. */
export function quoteCostOfSales(t:ReturnType<typeof calculateQuoteV27>['totals']){
 const costOfSales=t.buildBudget+t.contingency+t.indirect+t.waste+t.commission;
 return {costOfSales,grossProfit:t.price-costOfSales};
}
