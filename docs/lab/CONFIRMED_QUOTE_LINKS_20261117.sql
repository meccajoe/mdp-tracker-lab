-- Executed once in Lab gkvaeqlqrthztobxitvn after Joe confirmed these associations.
-- Metadata only: source names, statuses and workbook documents unchanged.
begin;
create temporary table confirmed_quote_links(workspace_id uuid primary key,expected_title text,job_number text,deal_id text) on commit drop;
insert into confirmed_quote_links values
('3ed34736-e772-4f54-a53c-172e716b6f71','Advent_FSU_v27 v3','26249','348856417015'),
('31de6499-f70f-466e-863b-31f615bde18d','Baby Block Base','26247','364183401195'),
('39cdcf5c-a920-4fd4-acdf-ab4f614bc2cd','Rock n Roll Denim v2','26248','320838254310'),
('82127568-2e56-4831-bd11-10951b756961','BDNY 2026_V2_v27_Mecca_Quote_Builder','26128','321011251926'),
('17f08fbf-2098-480c-b9ca-9fcb63a5434a','CNC_Ford_v10_v27','26198','340221270751'),
('63aa7bf6-4ba9-45a0-8b95-45aa7be78363','PBC Duncanville Letter Removal','26226','354898642625'),
('e5572a34-b3e9-4dca-9588-f57a87790fbf','Teambridge Denver','26217','351935625939');
do $$ begin
 if (select count(*) from public.ada_quote_workspaces w join confirmed_quote_links l on l.workspace_id=w.id where w.title=l.expected_title and w.job_number is null and w.hubspot_deal_id is null and w.tracker_project_id is null and w.archived_at is null)<>7 then raise exception 'Quote link precondition changed';end if;
 if exists(select 1 from public.projects p join confirmed_quote_links l on p.job_number=l.job_number or p.hubspot_deal_id=l.deal_id) then raise exception 'Existing Lab project association must be reconciled first';end if;
end $$;
update public.ada_quote_workspaces w set job_number=l.job_number,hubspot_deal_id=l.deal_id from confirmed_quote_links l where w.id=l.workspace_id;
select w.id,w.title,w.job_number,w.hubspot_deal_id from public.ada_quote_workspaces w join confirmed_quote_links l on l.workspace_id=w.id order by w.title;
commit;
