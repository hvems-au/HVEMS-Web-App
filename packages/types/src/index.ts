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
export type AssetDisposal = "retired" | "sold" | "other";

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
