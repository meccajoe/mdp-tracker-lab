// Builds a read-only export from the actual approved Production view definition.
// The costing CTEs and reconciliation aggregation are retained verbatim.
export function approvedCostingQuery(definition:string,projectId:string,entryIds:string[]){
 if(!/^[A-Za-z0-9-]+$/.test(projectId)||!entryIds.length||!entryIds.every(id=>/^ts_\d+$/.test(id))||new Set(entryIds).size!==entryIds.length)throw Error('Invalid reviewed source scope.');
 const text=definition.trim().replace(/;$/,'');
 if(!/^WITH resolved AS/i.test(text)||/[;]/.test(text)||/\b(insert|update|delete|create|alter|drop|copy|call|notify)\b|pg_(read|write|ls|stat)_/i.test(text))throw Error('Expected a read-only approved view.');
 const marker="WHERE labor.qbo_entry_id ~~ 'ts_%'::text",split='\n SELECT project_id,';
 if(text.split(marker).length!==2||text.split(split).length!==2)throw Error('Approved costing definition changed; review the export adapter.');
 const bound=text.replace(marker,`WHERE labor.project_id='${projectId}' AND labor.qbo_entry_id = ANY(ARRAY[${entryIds.map(id=>`'${id}'`).join(',')}]::text[])`);
 const cut=bound.lastIndexOf(split),ctes=bound.slice(0,cut),aggregate=bound.slice(cut+1);
 return `${ctes}
 SELECT jsonb_build_object(
 'resolvedAt',now(),
 'project',jsonb_build_object('id',p.id,'jobNumber',p.job_number,'dealId',p.hubspot_deal_id),
 'summary',coalesce((select to_jsonb(summary) from (${aggregate}) summary),'{}'::jsonb),
 'rows',coalesce((select jsonb_agg(jsonb_build_object(
  'entryId',c.qbo_entry_id,'employeeName',c.employee_name,'workerId',c.qbo_time_user_id,'normalizedName',c.normalized_worker_name,
  'date',c.date,'regHours',coalesce(c.reg_hours,0),'otHours',coalesce(c.ot_hours,0),
  'basis',case when c.cost_basis='excluded' then 'excluded' when c.effective_rate_source is null then 'missing' when c.cost_basis='daily' then 'daily' else 'hourly' end,
  'source',c.effective_rate_source,'amount',c.effective_labor_cost,'hourlyRate',c.effective_hourly_rate,
  'dailyRate',case when c.cost_basis='daily' and c.effective_rate_source is not null then c.policy_rate else null end,
  'verifiedAt',case when c.effective_rate_source in ('qbo_time_users','qbo_time_users_matched') then c.rate_verified_at else null end,
  'approval',case when c.effective_rate_source='payroll_rate_sheet' then authority.meta
   when c.effective_rate_source in ('fixed_design_rate','approved_daily_rate','approved_contractor_rate','approved_historical_payroll_rate','salary_below_gross_profit') then policy.meta else null end
 ) order by c.qbo_entry_id)
 from costed c
 left join lateral (select jsonb_build_object('id',w.id,'approvedBy',w.approved_by,'approvedAt',w.approved_at,'effectiveStart',w.effective_start_date,'effectiveEnd',w.effective_end_date) meta
  from public.labor_worker_cost_policies w where w.normalized_name=c.normalized_worker_name and w.cost_basis=c.cost_basis
   and w.source=c.policy_source and w.rate_amount is not distinct from c.policy_rate and c.date>=w.effective_start_date and (w.effective_end_date is null or c.date<=w.effective_end_date)
  order by w.effective_start_date desc,w.id limit 1) policy on true
 left join lateral (select jsonb_build_object('id',r.id,'approvedBy',i.approved_by,'approvedAt',i.approved_at,'effectiveStart',r.effective_start_date,'effectiveEnd',r.effective_end_date,'importId',i.id,'sourceLabel',i.source_label,'sourceSha256',i.source_sha256) meta
  from public.labor_worker_rate_authority r join public.labor_rate_imports i on i.id=r.import_id
  where r.normalized_name=c.normalized_worker_name and r.base_hourly_rate=c.effective_hourly_rate and i.approved_at is not null and i.revoked_at is null
   and c.date>=r.effective_start_date and (r.effective_end_date is null or c.date<=r.effective_end_date)
  order by r.effective_start_date desc,r.id limit 1) authority on true),'[]'::jsonb)) as costing_export
 from public.projects p where p.id='${projectId}';`;
}
