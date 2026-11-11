-- Company logo: only settings managers set it, and only from their own folder.
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('owner.l@example.test', 'Lia Owner') as owner \gset
select tests.create_user('other.l@example.test', 'Oli Other') as other \gset

select tests.authenticate_as(:'other');
select public.create_organisation('company', 'Lima Two') as org2 \gset
reset role;

select tests.authenticate_as(:'owner');
select public.create_organisation('company', 'Lima Plant') as org \gset

select lives_ok(format($$update public.organisations set logo_path = %L where id = %L$$, :'org' || '/logo-abc-123.png', :'org'),
  'the owner sets a logo from the company''s own folder');
select is((select logo_path from public.organisations where id = :'org'), :'org' || '/logo-abc-123.png', 'the logo is saved');
select is(tests.error_code(format($$update public.organisations set logo_path = %L where id = %L$$, :'org2' || '/logo-abc.png', :'org')),
  'invalid_logo', 'a logo from another company''s folder is refused');
select is(tests.error_code(format($$update public.organisations set logo_path = %L where id = %L$$, :'org' || '/../x.svg', :'org')),
  'invalid_logo', 'only PNG or JPEG logo files named by HVEMS are accepted');
select lives_ok(format($$update public.organisations set logo_path = null where id = %L$$, :'org'), 'the logo can be removed');
reset role;

select tests.authenticate_as(:'other');
update public.organisations set logo_path = :'org' || '/logo-zzz.png' where id = :'org';
reset role;
select is((select logo_path from public.organisations where id = :'org'), null, 'someone outside the company cannot set its logo');

select * from finish();
rollback;
