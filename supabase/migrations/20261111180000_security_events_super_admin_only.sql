-- Decision (11 Nov 2026, Ahmad): sign-in and security events (wrong passwords,
-- locks, unlocks, MFA resets, support access, HVEMS record views) are visible
-- only to the platform's Super Admin, not to companies or Support Agents.
-- Companies keep their audit history of changes, and still see HVEMS support
-- sessions and member sign-in locks on the Team page (separate tables/functions).
drop policy security_events_read on public.security_events;
create policy security_events_read on public.security_events for select to authenticated
  using ((select app.is_platform_staff(array['platform_administrator']::public.platform_role[])));
