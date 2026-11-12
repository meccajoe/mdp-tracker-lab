'use client';
import type {calculateQuoteV27,QuoteV27} from '@/lib/quote-v27';
import {budgetHandoffHours} from '@/lib/quote-budget-handoff';
import {quoteMoney as money,quoteNumber as number} from '@/lib/quote-format';
import {quoteItemLabel} from '@/lib/quote-takeoff-grid';
import {QuoteReportTable} from './quote-report-table';
const cell='p-2 text-left align-top';
export function QuoteBudgetHandoff({quote,calculation}:{quote:QuoteV27;calculation:ReturnType<typeof calculateQuoteV27>}){
 const hours=budgetHandoffHours(quote,calculation);
 return <div className="space-y-4">
  <section aria-label="Budget Handoff labor summary" className="rounded-lg border bg-muted/30 p-4">
   <h2 className="font-semibold">Labor hours — all items</h2>
   <dl className="my-3 flex flex-wrap gap-x-10 gap-y-3">
    {[['Total hours',hours.total],['Assigned trade hours',hours.assigned],['Hours without a trade',hours.untyped]].map(([label,value])=><div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{number(Number(value))} hrs</dd></div>)}
   </dl>
   <p className="text-xs text-muted-foreground">Total hours are the budget’s allowed hours across all items, including CAD and field labor. Trade hours follow Takeoffs assignments or exact, unique trade-name matches for older labor rows. Unmatched hours are listed separately.</p>
   {hours.overallocated>0.005&&<p role="status" className="mt-2 text-sm text-amber-800">Trade assignments exceed allowed hours on some items by {number(hours.overallocated)} hrs in total. Review those items’ hours or overrides; the figures have not been rescaled.</p>}
  </section>
  <section aria-label="Total hours per trade"><h2 className="mb-2 font-semibold">Total hours per trade</h2><div className="max-w-xl"><QuoteReportTable label="Total hours per trade" widths={[280,140]} identityColumns={1}><thead><tr><th className={cell}>Trade</th><th className={cell}>Total hours</th></tr></thead><tbody>{hours.trades.map(trade=><tr className="border-t" key={trade.id}><th scope="row" className={cell}>{trade.name}</th><td className={`${cell} tabular-nums`}>{number(trade.hours)}</td></tr>)}{!hours.trades.length&&<tr><td colSpan={2} className={cell}>No trade hours assigned.</td></tr>}</tbody><tfoot><tr className="border-t font-semibold"><th scope="row" className={cell}>All assigned trades</th><td className={cell}>{number(hours.assigned)}</td></tr><tr><th scope="row" className={cell}>Without a trade assignment</th><td className={cell}>{number(hours.untyped)}</td></tr></tfoot></QuoteReportTable></div></section>
  <h2 className="font-semibold">Per-item budget and hours</h2>
  <><QuoteReportTable label="Budget Handoff" widths={[90,260,150,120,130,140,320,120]}><thead><tr>{['Item #','Item name','Materials / other','Allowed hours','Labor cost','Build budget','Trade hours','Untyped hours'].map(h=><th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{hours.lines.filter(line=>line.buildBudget!==0||line.finalPrice!==0||line.hoursAllowed!==0||Object.values(line.tradeHours).some(hours=>hours!==0)).map(line=><tr key={line.id} className="border-t"><td className={cell}>{quoteItemLabel(quote,line.id)}</td><td className={cell}>{line.name}</td><td className={cell}>{money(line.materialsBudget)}</td><td className={cell}>{number(line.hoursAllowed)}</td><td className={cell}>{money(line.laborBudget)}</td><td className={cell}>{money(line.buildBudget)}</td><td className={cell}>{Object.entries(line.tradeHours).map(([id,hours])=>`${quote.trades.find(t=>t.id===id)?.name||`Unknown trade (${id})`}: ${number(hours)}`).join(', ')||'—'}</td><td className={cell}>{number(line.untypedHours)}</td></tr>)}</tbody></QuoteReportTable><p className="mt-4 font-semibold">Total build budget: {money(calculation.totals.buildBudget)}</p><p className="mt-2 text-sm">Contingency held separately: {money(calculation.totals.contingency)}</p></>
 </div>;
}
