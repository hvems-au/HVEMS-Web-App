-- The assets table grants writes column by column: people who manage equipment
-- (RLS and the API guard still apply) may set the safety equipment fitted.
grant insert (rops_fitted, fops_fitted, fire_suppression_fitted) on public.assets to authenticated;
grant update (rops_fitted, fops_fitted, fire_suppression_fitted) on public.assets to authenticated;
