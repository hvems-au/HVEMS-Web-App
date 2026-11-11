-- ROPS, FOPS and fire suppression checks follow the "fitted" tick-boxes on each machine.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.f@example.test', 'Fay Owner') as owner \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Foxtrot Civil') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, serial_number, meter_type)
  values (:'org', 'DZ-F1', tests.class_id('dozer'), 'CAT', 'D6', 'SNF1', 'hours') returning id as dz \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, registration_number, registration_state, vin, meter_type)
  values (:'org', 'LV-F1', tests.class_id('light_vehicle'), 'Toyota', 'Hilux', 'ABC123', 'QLD', '1HGCM82633A004352', 'kilometres') returning id as lv \gset

create function pg_temp.has(p_asset uuid, p_code text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.prestart_checklist(p_asset)) e where e ->> 'item_code' = p_code)
$$;

select ok((select rops_fitted and fops_fitted and fire_suppression_fitted from public.assets where id = :'dz'), 'mobile plant starts with all three ticked');
select ok((select not (rops_fitted or fops_fitted or fire_suppression_fitted) from public.assets where id = :'lv'), 'a vehicle starts unticked');
select ok(pg_temp.has(:'dz', 'S-04') and pg_temp.has(:'dz', 'S-22') and pg_temp.has(:'dz', 'S-19'), 'the dozer gets ROPS, FOPS and fire suppression checks');
select ok(not (pg_temp.has(:'lv', 'S-04') or pg_temp.has(:'lv', 'S-22') or pg_temp.has(:'lv', 'S-19')), 'the light vehicle gets none of them');

update public.assets set rops_fitted = true, fire_suppression_fitted = true where id = :'lv';
select ok(pg_temp.has(:'lv', 'S-04') and pg_temp.has(:'lv', 'S-19') and not pg_temp.has(:'lv', 'S-22'), 'a mine-spec vehicle gets the checks for what is ticked');

update public.assets set fops_fitted = false where id = :'dz';
select ok(not pg_temp.has(:'dz', 'S-22') and pg_temp.has(:'dz', 'S-04'), 'unticking FOPS removes only the FOPS check');
select is(jsonb_array_length(public.prestart_checklist(:'dz')), 55, 'the dozer checklist is one shorter (safety 22, general 27, dozer 6)');
reset role;

select * from finish();
rollback;
