-- Super Admin can read every organisation's fleet records (decision O-05,
-- Ahmad, 10 Nov 2026). This departs from spec §2.3 / ADM-07 / CS-06, where
-- HVEMS staff see customer records only inside a logged support-access
-- session, so it needs HVEMS approval through change control and a mention in
-- the privacy policy.
--
-- Scope: read-only, Platform Administrators (Super Admin) with an MFA session
-- only. Support Agents keep the support-access rule. Team members, roles,
-- grants and invitations were already readable by staff (spec B.5).
-- The console records a security event each time a Super Admin opens an
-- organisation's records, which the company's admins can see.

create policy clients_read_super_admin on public.clients for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy sites_read_super_admin on public.sites for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy assets_read_super_admin on public.assets for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy operator_perms_read_super_admin on public.asset_operator_permissions for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy condition_causes_read_super_admin on public.asset_condition_causes for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy condition_history_read_super_admin on public.asset_condition_history for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
create policy meter_readings_read_super_admin on public.meter_readings for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
