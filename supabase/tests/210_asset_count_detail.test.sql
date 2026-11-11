-- Count events record before/after and who caused them.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.k@example.test', 'Kim Owner') as owner \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Kilo Civil') as org \gset
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values (:'org', 'K-1', tests.class_id('excavator'), 'CAT', '320');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model) values (:'org', 'K-2', tests.class_id('excavator'), 'CAT', '330');
reset role;

select results_eq(
  format($$select count_before, count_after, delta::int from public.asset_count_events where organisation_id = %L order by id$$, :'org'),
  $$values (0, 1, 1), (1, 2, 1)$$,
  'each event records the count before and after');
select is((select count(*) from public.asset_count_events where organisation_id = :'org' and actor_user_id = :'owner')::int, 2, 'and who added the equipment');
select lives_ok(format($$insert into public.asset_count_events (organisation_id, asset_id, delta, reason)
  select %L, id, -1, 'merged' from public.assets where asset_number = 'K-2' and organisation_id = %L$$, :'org', :'org'), 'merged is a reason');
select is((select count_after from public.asset_count_events where organisation_id = :'org' order by id desc limit 1), 1, 'merging lowers the count');

select * from finish();
rollback;
