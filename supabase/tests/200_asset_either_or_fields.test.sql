-- AST-01: vehicles need a registration or a VIN; equipment needs no serial number.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.r@example.test', 'Rex Owner') as owner \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Romeo Transport') as org \gset
reset role;

create function pg_temp.errs(cls text, f jsonb) returns jsonb language sql as $$
  select app.asset_validation_errors(null, null, f || jsonb_build_object('asset_class_id', tests.class_id(cls), 'asset_number', 'T-1'))
$$;

select is(jsonb_array_length(pg_temp.errs('rigid_truck', '{"make":"Isuzu","model":"FVZ","vin":"JALFVZ123"}')), 0, 'a truck with only a VIN is fine');
select is(jsonb_array_length(pg_temp.errs('rigid_truck', '{"make":"Isuzu","model":"FVZ","registration_number":"123ABC","registration_state":"QLD"}')), 0,
  'a truck with only a registration is fine');
select ok(pg_temp.errs('rigid_truck', '{"make":"Isuzu","model":"FVZ"}') @> '[{"field":"registration_number","code":"required"}]',
  'a truck with neither is refused');
select is(pg_temp.errs('rigid_truck', '{"make":"Isuzu","model":"FVZ"}') -> 0 ->> 'message', 'Registration or VIN is required for Rigid truck',
  'the message names both options');
select ok(pg_temp.errs('rigid_truck', '{"make":"Isuzu","model":"FVZ","registration_number":"123ABC"}') @> '[{"field":"registration_state"}]',
  'a registration needs its state');
select is(jsonb_array_length(pg_temp.errs('excavator', '{"make":"CAT","model":"320"}')), 0, 'equipment needs no serial number');
select ok(pg_temp.errs('excavator', '{"model":"320"}') @> '[{"field":"make"}]', 'make is still required');

reset role;
select tests.authenticate_as(:'owner', 'aal2');
select (public.create_asset_class(:'org', 'Water cart', 'vehicle', 'kilometres')).id as wc \gset
reset role;
select is((select required_fields from public.asset_classes where id = :'wc'), '{make,model,registration_number|vin}'::text[],
  'new company vehicle classes get the either-or rule');

select * from finish();
rollback;
