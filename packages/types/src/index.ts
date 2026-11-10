/**
 * Shared record types for web and (future) React Native clients.
 *
 * These describe rows as returned by the Supabase Data API under RLS. They are
 * the stable contract the UI and api-client depend on. `database.generated.ts`
 * is generated from the hosted schema (`pnpm db:types`) and `schema-compat.ts`
 * fails the typecheck if the two drift apart.
 */
export type { Database, Json } from "./database.generated";
import type {
  AssetCategory,
  AssetCondition,
  AssetOwnerType,
  MeterType,
} from "@hvems/domain";
import type { MemberGrant, MemberRole, OrganisationKind, PlatformAuthority, PlatformRole } from "@hvems/permissions";

export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export type OrganisationStatus = "active" | "restricted" | "suspended" | "closing" | "closed";
export type MembershipStatus = "active" | "suspended" | "removed";
export type IdentificationMethod = "password" | "password_mfa" | "driver_pin" | "support_access" | "system" | "unverified";
export type MeterUnit = "km" | "hours";
export type MeterReadingStatus = "accepted" | "pending_acceptance" | "rejected" | "superseded";
export type MeterReadingSource = "manual" | "inspection" | "work_order" | "import" | "onboarding";
export type AssetDisposal = "disposed" | "sold" | "transferred_out" | "written_off" | "other";

export interface Profile {
  id: UUID;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: ISODateTime;
}

export interface Organisation {
  id: UUID;
  kind: OrganisationKind;
  name: string;
  legal_name: string | null;
  abn: string | null;
  status: OrganisationStatus;
  timezone: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  settings: {
    overdue_service_sets_needs_attention?: boolean;
    repairer_cannot_clear_own_critical?: boolean;
  };
  first_exceeded_free_allowance_at: ISODateTime | null;
  /** Set while HVEMS has suspended the organisation (ACC-18). */
  suspended_at: ISODateTime | null;
  suspension_reason: string | null;
  created_at: ISODateTime;
}

export interface MyContext {
  organisation_id: UUID;
  organisation_name: string;
  kind: OrganisationKind;
  role: MemberRole;
  status: OrganisationStatus;
  mfa_required: boolean;
}

export interface StaffContext {
  role: PlatformRole;
  authorities: PlatformAuthority[];
  mfa_satisfied: boolean;
}

export interface Membership {
  id: UUID;
  organisation_id: UUID;
  user_id: UUID;
  role: MemberRole;
  status: MembershipStatus;
  created_at: ISODateTime;
  profile?: Pick<Profile, "full_name" | "email"> | null;
  grants?: MembershipGrant[];
}

export interface MembershipGrant {
  id: UUID;
  membership_id: UUID;
  grant_type: MemberGrant;
  approval_limit_cents: number | null;
  competency_note: string | null;
  assigned_at: ISODateTime;
  revoked_at: ISODateTime | null;
}

export interface Invitation {
  id: UUID;
  organisation_id: UUID;
  email: string;
  role: MemberRole;
  expires_at: ISODateTime;
  accepted_at: ISODateTime | null;
  revoked_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface AssetClass {
  id: UUID;
  code: string;
  name: string;
  category: AssetCategory;
  default_meter_type: MeterType;
  required_fields: string[];
  sort_order: number;
  /** null = HVEMS standard class; otherwise the company that owns it (O-03). */
  organisation_id: UUID | null;
}

export interface Client {
  id: UUID;
  organisation_id: UUID;
  name: string;
  abn: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Site {
  id: UUID;
  organisation_id: UUID;
  client_id: UUID | null;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  timezone: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  shift_times: string | null;
  access_instructions: string | null;
  safety_instructions: string | null;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Asset {
  id: UUID;
  organisation_id: UUID;
  asset_number: string;
  asset_class_id: UUID;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_number: string | null;
  registration_state: string | null;
  vin: string | null;
  serial_number: string | null;
  owner_type: AssetOwnerType;
  client_id: UUID | null;
  site_id: UUID | null;
  responsible_membership_id: UUID | null;
  meter_type: MeterType;
  current_odometer_km: number | null;
  odometer_read_at: ISODateTime | null;
  current_engine_hours: number | null;
  engine_hours_read_at: ISODateTime | null;
  notes: string | null;
  condition: AssetCondition;
  condition_changed_at: ISODateTime;
  archived_at: ISODateTime | null;
  archive_reason: string | null;
  archive_effective_date: ISODate | null;
  archive_disposal: AssetDisposal | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AssetListItem extends Asset {
  asset_class: Pick<AssetClass, "code" | "name" | "category"> | null;
  site: Pick<Site, "id" | "name" | "suburb" | "state"> | null;
  client: Pick<Client, "id" | "name"> | null;
}

export interface MeterReading {
  id: UUID;
  asset_id: UUID;
  unit: MeterUnit;
  value: number;
  read_at: ISODateTime;
  source: MeterReadingSource;
  status: MeterReadingStatus;
  recorded_by: UUID | null;
  identification_method: IdentificationMethod;
  lower_reading_reason: string | null;
  jump_confirmed: boolean;
  out_of_sequence: boolean;
  amends_reading_id: UUID | null;
  decision_note: string | null;
  created_at: ISODateTime;
}

export interface ConditionHistoryEntry {
  id: number;
  asset_id: UUID;
  from_condition: AssetCondition;
  to_condition: AssetCondition;
  cause_kind: string | null;
  changed_at: ISODateTime;
}

export interface AuditEvent {
  id: number;
  occurred_at: ISODateTime;
  organisation_id: UUID | null;
  actor_user_id: UUID | null;
  actor_method: IdentificationMethod;
  action: string;
  entity_type: string;
  entity_id: UUID | null;
  changes: Record<string, unknown>;
}

export interface ImportRowError {
  row: number | null;
  field: string | null;
  code: string;
  message: string;
}

export interface ImportResult {
  dry_run: boolean;
  row_count: number;
  valid: boolean;
  created: number;
  errors: ImportRowError[];
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  description: string;
  status: "confirmed" | "recommended" | "to_be_confirmed" | "specialist_review";
  sow_reference: string | null;
}

// ---------------------------------------------------------------------------
// Pre-start inspections, defects, notifications (2B start)
// ---------------------------------------------------------------------------
export type DefectSeverityValue = "critical" | "minor" | "advisory";
export type InspectionResult = "pass" | "pass_with_faults" | "fail";
export type InspectionAnswerValue = "ok" | "fault" | "na";

/** One question of the checklist that applies to an asset (rpc prestart_checklist). */
export interface ChecklistItem {
  template_code: string;
  template_name: string;
  template_version: number;
  item_code: string;
  prompt: string;
  severity: DefectSeverityValue;
  na_allowed: boolean;
  /** About the operator (fit for work, licence), not the machine: fails the pre-start without a defect. */
  operator_item: boolean;
}

export interface InspectionHeader {
  asset_number: string;
  asset_class: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  registration_number: string | null;
  registration_state: string | null;
  vin: string | null;
  serial_number: string | null;
  condition_before: string;
  operator_name: string | null;
  last_odometer_km: number | null;
  last_odometer_at: ISODateTime | null;
  last_engine_hours: number | null;
  last_engine_hours_at: ISODateTime | null;
}

export interface Inspection {
  id: UUID;
  organisation_id: UUID;
  asset_id: UUID;
  kind: "prestart";
  result: InspectionResult;
  operator_fault: boolean;
  submitted_by: UUID;
  submitted_at: ISODateTime;
  odometer_km: number | null;
  engine_hours: number | null;
  notes: string | null;
  header: InspectionHeader;
  templates: { code: string; name: string; version: number }[];
}

export interface InspectionAnswer {
  id: number;
  template_code: string;
  template_name: string;
  item_code: string;
  prompt: string;
  severity: DefectSeverityValue;
  operator_item: boolean;
  answer: InspectionAnswerValue;
  note: string | null;
  sort_order: number;
}

export interface InspectionPhoto {
  id: UUID;
  inspection_id: UUID;
  item_code: string | null;
  storage_path: string;
}

export interface Defect {
  id: UUID;
  organisation_id: UUID;
  asset_id: UUID;
  severity: DefectSeverityValue;
  status: DefectStatus;
  title: string;
  description: string | null;
  source: "prestart";
  inspection_id: UUID | null;
  item_code: string | null;
  reported_by: UUID | null;
  reported_at: ISODateTime;
  triaged_at: ISODateTime | null;
  triaged_by: UUID | null;
  /** Minor defects: repair due date (D-07). */
  due_date: ISODate | null;
  deferred_until: ISODate | null;
  deferral_reason: string | null;
  closed_at: ISODateTime | null;
  closed_by: UUID | null;
  resolution_note: string | null;
  repaired_by: UUID | null;
  merged_into: UUID | null;
  evidence_paths: string[];
}

/** "closed" is unused (kept in the enum); closed defects are repaired, dismissed or merged. */
export type DefectStatus = "open" | "closed" | "repaired" | "dismissed" | "merged";

export interface ReturnToServiceEvent {
  id: UUID;
  asset_id: UUID;
  returned_by: UUID;
  returned_at: ISODateTime;
  note: string;
  evidence_paths: string[];
}

export interface OpenConditionCause {
  id: UUID;
  kind: string;
  source_type: string;
  source_id: UUID | null;
  opened_at: ISODateTime;
}

export interface AppNotification {
  id: UUID;
  organisation_id: UUID;
  kind: "critical_defect" | "minor_defect" | "operator_not_fit";
  title: string;
  body: string | null;
  asset_id: UUID | null;
  inspection_id: UUID | null;
  created_at: ISODateTime;
  read_at: ISODateTime | null;
}

export interface PrestartSubmitResult {
  inspection_id: UUID;
  result: InspectionResult;
  operator_fault?: boolean;
  defects?: { id: UUID; severity: DefectSeverityValue; title: string }[];
  duplicate: boolean;
}
