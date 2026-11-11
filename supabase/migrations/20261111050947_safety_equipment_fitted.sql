-- ROPS, FOPS and fire suppression: "fitted" tick-boxes on each piece of
-- equipment (decision 11 Nov 2026). The matching pre-start checks appear only
-- on equipment where they are ticked, whatever its type, so a mine-spec light
-- vehicle or haul truck can carry them too.
--
-- New equipment left unset takes its class's default: mobile plant (equipment
-- classes except portable or fixed equipment) starts with all three ticked, so
-- no machine loses a safety check without someone deciding it; vehicles start
-- unticked. Existing equipment is set the same way.

alter table public.assets
  add column rops_fitted boolean,
  add column fops_fitted boolean,
  add column fire_suppression_fitted boolean;

create or replace function app.class_is_mobile_plant(p_class_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.category = 'equipment' and c.code is distinct from 'portable_fixed_equipment'
                   from public.asset_classes c where c.id = p_class_id), false)
$$;
revoke execute on function app.class_is_mobile_plant(uuid) from public, anon;

create or replace function app.assets_safety_fitted_defaults() returns trigger
language plpgsql set search_path = '' as $$
declare v_plant boolean;
begin
  if new.rops_fitted is null or new.fops_fitted is null or new.fire_suppression_fitted is null then
    v_plant := app.class_is_mobile_plant(new.asset_class_id);
    new.rops_fitted := coalesce(new.rops_fitted, v_plant);
    new.fops_fitted := coalesce(new.fops_fitted, v_plant);
    new.fire_suppression_fitted := coalesce(new.fire_suppression_fitted, v_plant);
  end if;
  return new;
end $$;

-- Runs after the API guard (triggers fire in name order).
create trigger assets_safety_fitted before insert or update of rops_fitted, fops_fitted, fire_suppression_fitted on public.assets
  for each row execute function app.assets_safety_fitted_defaults();

update public.assets a set
  rops_fitted = app.class_is_mobile_plant(a.asset_class_id),
  fops_fitted = app.class_is_mobile_plant(a.asset_class_id),
  fire_suppression_fitted = app.class_is_mobile_plant(a.asset_class_id);

alter table public.assets
  add constraint assets_safety_fitted_set check (rops_fitted is not null and fops_fitted is not null and fire_suppression_fitted is not null);

-- Checklist items that apply only when the feature is fitted.
alter table public.inspection_template_items
  add column requires_fitted text check (requires_fitted in ('rops', 'fops', 'fire_suppression'));

update public.inspection_template_items i
set requires_fitted = case i.code when 'S-04' then 'rops' when 'S-22' then 'fops' when 'S-19' then 'fire_suppression' end
from public.inspection_templates t
where t.id = i.template_id and t.organisation_id is null and t.code = 'safety' and i.code in ('S-04', 'S-22', 'S-19');

update public.inspection_templates set version = version + 1 where organisation_id is null and code = 'safety';

create or replace function app.prestart_items(p_asset_id uuid)
returns table (
  template_code text, template_name text, template_version integer, template_sort integer,
  item_code text, prompt text, severity public.defect_severity, na_allowed boolean, operator_item boolean, item_sort integer
) language sql stable security definer set search_path = '' as $$
  select t.code, t.name, t.version, t.sort_order, i.code, i.prompt, i.severity, i.na_allowed, i.operator_item, i.sort_order
  from public.assets a
  join public.asset_classes c on c.id = a.asset_class_id
  join public.inspection_templates t on t.active and t.kind = 'prestart'
    and (t.organisation_id is null or t.organisation_id = a.organisation_id)
    and (
      (t.applies_to_all and not (coalesce(c.code, '') = any (t.exclude_class_codes)))
      or c.code = any (t.asset_class_codes)
    )
  join public.inspection_template_items i on i.template_id = t.id and i.active
  where a.id = p_asset_id
    and (
      i.requires_fitted is null
      or (i.requires_fitted = 'rops' and a.rops_fitted)
      or (i.requires_fitted = 'fops' and a.fops_fitted)
      or (i.requires_fitted = 'fire_suppression' and a.fire_suppression_fitted)
    )
  order by t.sort_order, i.sort_order
$$;
revoke execute on function app.prestart_items(uuid) from public, anon, authenticated;
