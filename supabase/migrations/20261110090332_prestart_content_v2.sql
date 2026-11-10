-- Pre-start content v2 (10 Nov 2026): items from the client's sample "Daily
-- Plant Inspection Check List" (Tuffa) and the request for explicit ROPS, FOPS
-- and fire suppression checks (mine sites). Submitted pre-starts keep their
-- own copy of every question, so changing templates never alters records.

-- Room between items: sort orders x10.
update public.inspection_template_items set sort_order = sort_order * 10
where template_id in (select id from public.inspection_templates where organisation_id is null and code in ('safety', 'generic'));

-- Safety: ROPS and FOPS separately; fire suppression Critical; neutral start.
update public.inspection_template_items i
set prompt = 'ROPS (roll-over protective structure) is undamaged: no cracks, bends, rust-through or missing bolts'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'safety' and i.code = 'S-04';
update public.inspection_template_items i
set prompt = 'Fire suppression system is armed: gauge in the green, tags in date, actuators accessible', severity = 'critical'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'safety' and i.code = 'S-19';
update public.inspection_template_items i
set prompt = 'Cab access and exit: steps, handrails and grab handles secure, clean and not slippery'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'safety' and i.code = 'S-17';

-- Generic: wording from the sample sheet.
update public.inspection_template_items i
set prompt = 'Walk-around: no new damage to panels, guards or attachments'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'generic' and i.code = 'G-01';
update public.inspection_template_items i
set prompt = 'Daily checklist, operator''s manual, plant security information and any load chart are in the machine'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'generic' and i.code = 'G-18';
update public.inspection_template_items i
set prompt = 'Cab clean; seat secure; no loose objects that could jam controls or pedals'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'generic' and i.code = 'G-14';
update public.inspection_template_items i
set prompt = 'Hydraulics: rams and hoses not leaking, rubbing, cracked or worn'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'generic' and i.code = 'G-09';
update public.inspection_template_items i
set prompt = 'No small leaks: engine, transmission, final drives, hydraulics or cooling system'
from public.inspection_templates t where t.id = i.template_id and t.organisation_id is null and t.code = 'generic' and i.code = 'G-08';

insert into public.inspection_template_items (template_id, code, prompt, severity, na_allowed, operator_item, sort_order)
select t.id, v.code, v.prompt, v.severity::public.defect_severity, v.na, false, v.sort
from (values
  ('safety', 'S-22', 'FOPS (falling object protective structure) is undamaged: no dents, cracks or missing bolts', 'critical', true, 45),
  ('safety', 'S-23', 'Neutral start: the engine only starts with the transmission in neutral or park', 'critical', true, 135),
  ('generic', 'G-21', 'No cracks to the chassis, frame or body', 'critical', false, 15),
  ('generic', 'G-22', 'Wheels, tyres and tracks: wear, tension and pressure OK; wheel nuts tight', 'minor', false, 16),
  ('generic', 'G-23', 'Hitch: safety pin in place and not worn', 'critical', true, 17),
  ('generic', 'G-24', 'Articulated joint and linkage: pins secure, no excessive play', 'minor', true, 18),
  ('generic', 'G-25', 'Compulsory signs, reflective tape and reflectors in place and readable', 'minor', false, 135),
  ('generic', 'G-26', 'Environmental spill kit on board and stocked', 'minor', true, 175),
  ('generic', 'G-27', 'Plant security: keys, isolator lock-out and immobiliser working', 'advisory', true, 185)
) as v(template, code, prompt, severity, na, sort)
join public.inspection_templates t on t.code = v.template and t.organisation_id is null;

update public.inspection_templates set version = 2 where organisation_id is null and code in ('safety', 'generic');
