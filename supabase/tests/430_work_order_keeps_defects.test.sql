-- Brief critical test 6 / ADR-005: closing work never clears a safety defect.
-- A work order raised for a Critical defect is completed and closed; the defect stays open
-- and the equipment stays Out of service until someone with Clearance Authority clears it.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.k@example.test', 'Kim Owner') as owner \gset
select tests.create_user('tech.k@example.test', 'Ken Tech') as tech \gset

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Kilo Civil') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
  values (:'org', 'LD-K1', tests.class_id('loader'), 'CAT', '950', 'SNK1', 'hours') returning id as ld \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician');

create function pg_temp.answers(p_asset uuid, p_faults text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('item_code', e ->> 'item_code',
    'answer', case when e ->> 'item_code' = any (p_faults) then 'fault' else 'ok' end,
    'note', case when e ->> 'item_code' = any (p_faults) then 'Fault found' end))
  from jsonb_array_elements(public.prestart_checklist(p_asset)) e
$$;
create function pg_temp.cond(p_asset uuid) returns text language sql as $$
  select condition::text from public.assets where id = p_asset
$$;

-- A Critical fault (LD-02) takes the loader out of service.
select tests.authenticate_as(:'tech');
select public.submit_prestart(:'ld', pg_temp.answers(:'ld', array['LD-02']), null, 100, null, '[]', true);
reset role;
select id as defect from public.defects where asset_id = :'ld' and item_code = 'LD-02' \gset
select is(pg_temp.cond(:'ld'), 'out_of_service', 'the Critical fault takes the loader out of service');

-- A work order for the defect is done and closed.
select tests.authenticate_as(:'owner', 'aal2');
select public.create_work_order(:'org', :'ld', 'Fix LD-02', null, 'internal', null, 'urgent', :'tech', current_date, null, :'defect') as wo \gset
reset role;
select tests.authenticate_as(:'tech');
select lives_ok(format($$select public.update_work_order_status(%L, 'start')$$, :'wo'::jsonb ->> 'id'), 'the technician starts the work order');
select lives_ok(format($$select public.submit_work_order_report(%L, 'pre', 'Brake fault confirmed')$$, :'wo'::jsonb ->> 'id'), 'pre-work report');
select lives_ok(format($$select public.submit_work_order_report(%L, 'post', 'Brakes repaired and tested')$$, :'wo'::jsonb ->> 'id'), 'post-work report');
select lives_ok(format($$select public.update_work_order_status(%L, 'complete', 'Brakes repaired and tested')$$, :'wo'::jsonb ->> 'id'),
  'and completes it');
reset role;
select is(pg_temp.cond(:'ld'), 'out_of_service', 'completing the work order leaves the loader out of service');
select is((select status::text from public.defects where id = :'defect'), 'open', 'and the defect open');

select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.update_work_order_status(%L, 'close', 'Reviewed')$$, :'wo'::jsonb ->> 'id'), 'the Owner closes the work order');
reset role;
select is(pg_temp.cond(:'ld'), 'out_of_service', 'closing the work order still leaves the loader out of service');
select is((select status::text from public.defects where id = :'defect'), 'open', 'and the defect still open');

select * from finish();
rollback;
