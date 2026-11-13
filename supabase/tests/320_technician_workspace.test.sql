-- Technician workspace: assignees, own jobs only, reports, files, next service due.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.tw@example.test', 'Tara Owner') as owner \gset
select tests.create_user('tech.tw@example.test', 'Ted Tech') as tech \gset
select tests.create_user('tech2.tw@example.test', 'Tina Tech') as tech2 \gset
select tests.create_user('fin.tw@example.test', 'Fay Finance') as fin \gset
select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Tango Transport') as org \gset
reset role;
select tests.add_member(:'org', :'tech', 'technician');
select tests.add_member(:'org', :'tech2', 'technician');
select tests.add_member(:'org', :'fin', 'finance');
insert into public.assets (organisation_id, asset_number, asset_class_id, make, model, meter_type)
values (:'org', 'TK-1', tests.class_id('excavator'), 'Isuzu', 'FVZ', 'km') returning id as asset \gset
insert into public.service_plans (organisation_id, asset_id, name, interval_days, last_done_on)
values (:'org', :'asset', '6-monthly service', 180, current_date - 170) returning id as plan \gset

select tests.authenticate_as(:'owner', 'aal2');
select is(tests.error_code(format($$select public.create_work_order(%L, %L, 'Service', null, 'internal', null, 'normal', %L)$$, :'org', :'asset', :'fin')),
  'invalid_assignee', 'a Finance user cannot be given a job');
select public.create_work_order(:'org', :'asset', '6-monthly service', null, 'internal', null, 'normal', :'tech', null, :'plan') as wo \gset
select (:'wo'::jsonb ->> 'id') as wo_id \gset
reset role;

-- Only the assigned technician works on it
select tests.authenticate_as(:'tech2');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'start')$$, :'wo_id')), 'forbidden', 'another technician cannot start it');
select is(tests.error_code(format($$select public.submit_work_order_report(%L, 'pre', 'Looks fine')$$, :'wo_id')), 'forbidden', 'or report on it');
reset role;

select tests.authenticate_as(:'tech');
select lives_ok(format($$select public.submit_work_order_report(%L, 'pre', 'Minor oil weep at sump; tyres OK', '{"walkaround": "ok"}')$$, :'wo_id'),
  'the assigned technician files the pre-work report');
select lives_ok(format($$select public.update_work_order_status(%L, 'start')$$, :'wo_id'), 'and starts it');
select is(tests.error_code(format($$select public.update_work_order_status(%L, 'complete', 'Done')$$, :'wo_id')), 'reports_required',
  'completing needs the post-work report too');
select is(tests.error_code(format($$select public.submit_work_order_report(%L, 'post', 'Serviced', '{}', '{}', null, null, current_date)$$, :'wo_id')),
  'invalid_next_due', 'the next service date must be in the future');
select lives_ok(format($$select public.submit_work_order_report(%L, 'post', 'Oil and filters changed', '{}', '{}', null, null, current_date + 120)$$, :'wo_id'),
  'post-work report with the next service due');
select lives_ok(format($$select public.update_work_order_status(%L, 'complete', 'Oil and filters changed')$$, :'wo_id'), 'now it can be completed');

-- Documents
select is(tests.error_code(format($$select public.add_work_order_file(%L, 'invoice', 'elsewhere/inv.pdf', 'inv.pdf')$$, :'wo_id')), 'invalid_file',
  'a document must be uploaded for this work order');
select public.add_work_order_file(:'wo_id', 'invoice', :'org' || '/' || :'wo_id' || '/inv.pdf', 'inv.pdf', 'Parts Co', 'INV-77', 12345) as file_id \gset
select is((select amount_cents from public.work_order_files where id = :'file_id'), 12345::bigint, 'the invoice is recorded in cents');
reset role;
select tests.authenticate_as(:'tech2');
select is(tests.error_code(format($$select public.remove_work_order_file(%L)$$, :'file_id')), 'forbidden', 'others cannot remove it');
reset role;

-- Closing applies the technician's next service due, with history
select tests.authenticate_as(:'owner', 'aal2');
select lives_ok(format($$select public.update_work_order_status(%L, 'close', 'Checked')$$, :'wo_id'), 'the Owner closes it');
select is((select next_due_on from public.service_schedule where id = :'plan'), current_date + 120, 'the schedule uses the chosen next due');
select ok((select next_due_chosen from public.service_schedule where id = :'plan'), 'and shows it was chosen');
select is((select count(*) from public.service_plan_due_history where service_plan_id = :'plan')::int, 1, 'the choice is kept in the history');
select is((select set_by from public.service_plan_due_history where service_plan_id = :'plan'), :'tech'::uuid, 'credited to the technician');
reset role;

select * from finish();
rollback;
