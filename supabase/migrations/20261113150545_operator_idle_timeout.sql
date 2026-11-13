-- One sign-in portal for the whole company (13 Nov 2026, Ahmad): operator screens
-- live on the company portal, where site tablets are shared, so they sign out
-- sooner than staff screens.
insert into public.platform_settings (key, value, description, status, sow_reference) values
  ('security.idle_timeout_minutes_operator', '20', 'Minutes without activity before the operator screens sign out (shared site tablets)', 'recommended', '§2.5 CFG-45')
on conflict (key) do nothing;
