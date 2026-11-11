-- The fitted-defaults trigger runs as the person saving the equipment, so they
-- must be able to call the (read-only) class check. Without this, adding
-- equipment failed with "permission denied for function class_is_mobile_plant".
grant execute on function app.class_is_mobile_plant(uuid) to authenticated, service_role;
