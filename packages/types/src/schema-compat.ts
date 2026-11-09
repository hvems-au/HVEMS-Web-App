/**
 * Compile-time drift check between the hand-written shared types and the
 * schema generated from the hosted database. If a migration adds, removes or
 * renames an enum value, `pnpm typecheck` fails here until both sides agree.
 * Nothing in this file runs.
 */
import type {
  AssetCategory,
  AssetCondition,
  AssetOwnerType,
  ConditionCauseKind,
  MeterType,
} from "@hvems/domain";
import type { MemberGrant, MemberRole, OrganisationKind, PlatformAuthority, PlatformRole } from "@hvems/permissions";
import type { Database } from "./database.generated";
import type {
  AssetDisposal,
  IdentificationMethod,
  MembershipStatus,
  MeterReadingSource,
  MeterReadingStatus,
  MeterUnit,
  OrganisationStatus,
} from "./index";

type DbEnums = Database["public"]["Enums"];
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type SchemaCompat = [
  Assert<Equal<DbEnums["asset_category"], AssetCategory>>,
  Assert<Equal<DbEnums["asset_condition"], AssetCondition>>,
  Assert<Equal<DbEnums["asset_owner_type"], AssetOwnerType>>,
  Assert<Equal<DbEnums["condition_cause_kind"], ConditionCauseKind>>,
  Assert<Equal<DbEnums["meter_type"], MeterType>>,
  Assert<Equal<DbEnums["member_grant"], MemberGrant>>,
  Assert<Equal<DbEnums["member_role"], MemberRole>>,
  Assert<Equal<DbEnums["organisation_kind"], OrganisationKind>>,
  Assert<Equal<DbEnums["platform_authority"], PlatformAuthority>>,
  Assert<Equal<DbEnums["platform_role"], PlatformRole>>,
  Assert<Equal<DbEnums["asset_disposal"], AssetDisposal>>,
  Assert<Equal<DbEnums["identification_method"], IdentificationMethod>>,
  Assert<Equal<DbEnums["membership_status"], MembershipStatus>>,
  Assert<Equal<DbEnums["meter_reading_source"], MeterReadingSource>>,
  Assert<Equal<DbEnums["meter_reading_status"], MeterReadingStatus>>,
  Assert<Equal<DbEnums["meter_unit"], MeterUnit>>,
  Assert<Equal<DbEnums["organisation_status"], OrganisationStatus>>,
];
