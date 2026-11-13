/** Equipment register reference data — SoW §3.1 asset categories. Mirrors the asset_classes seed. */

export type AssetCategory = "vehicle" | "equipment";
export type MeterType = "none" | "kilometres" | "hours" | "both";
export type AssetOwnerType = "own" | "client_owned" | "hired_in";

export type AssetField = "make" | "model" | "registration_number" | "registration_state" | "vin" | "serial_number";

export interface AssetClassDefinition {
  code: string;
  name: string;
  category: AssetCategory;
  defaultMeterType: MeterType;
  /** Recommended defaults; HVEMS can change them in settings. */
  requiredFields: readonly AssetField[];
}

const VEHICLE_FIELDS: AssetField[] = ["make", "model", "registration_number", "registration_state", "vin"];
const PLANT_FIELDS: AssetField[] = ["make", "model", "serial_number"];

export const ASSET_CLASSES: readonly AssetClassDefinition[] = [
  { code: "prime_mover", name: "Prime mover", category: "vehicle", defaultMeterType: "kilometres", requiredFields: VEHICLE_FIELDS },
  { code: "rigid_truck", name: "Rigid truck", category: "vehicle", defaultMeterType: "kilometres", requiredFields: VEHICLE_FIELDS },
  { code: "trailer", name: "Trailer", category: "vehicle", defaultMeterType: "none", requiredFields: VEHICLE_FIELDS },
  { code: "bus", name: "Bus", category: "vehicle", defaultMeterType: "kilometres", requiredFields: VEHICLE_FIELDS },
  { code: "light_vehicle", name: "Light vehicle", category: "vehicle", defaultMeterType: "kilometres", requiredFields: VEHICLE_FIELDS },
  { code: "excavator", name: "Excavator", category: "equipment", defaultMeterType: "hours", requiredFields: PLANT_FIELDS },
  { code: "loader", name: "Loader", category: "equipment", defaultMeterType: "hours", requiredFields: PLANT_FIELDS },
  { code: "dozer", name: "Dozer", category: "equipment", defaultMeterType: "hours", requiredFields: PLANT_FIELDS },
  { code: "grader", name: "Grader", category: "equipment", defaultMeterType: "hours", requiredFields: PLANT_FIELDS },
  { code: "other_mobile_plant", name: "Other mobile plant", category: "equipment", defaultMeterType: "hours", requiredFields: PLANT_FIELDS },
  { code: "portable_fixed_equipment", name: "Portable or fixed equipment", category: "equipment", defaultMeterType: "none", requiredFields: ["make", "model"] },
];

export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"] as const;
export type AuState = (typeof AU_STATES)[number];

export const CONDITION_LABELS = {
  active: "Active",
  needs_attention: "Needs attention",
  out_of_service: "Broken/Out of service",
} as const;

/** Mobile plant (equipment classes except portable or fixed) starts with ROPS, FOPS and fire suppression ticked. Mirrors app.class_is_mobile_plant. */
export function isMobilePlantClass(cls: { category: string; code: string | null } | null | undefined): boolean {
  return !!cls && cls.category === "equipment" && cls.code !== "portable_fixed_equipment";
}

export const SAFETY_FITTED_LABELS = {
  rops_fitted: { title: "ROPS fitted", body: "Roll-over protective structure" },
  fops_fitted: { title: "FOPS fitted", body: "Falling object protective structure" },
  fire_suppression_fitted: { title: "Fire suppression fitted", body: "Automatic or manual fire suppression system" },
} as const;
export type SafetyFittedField = keyof typeof SAFETY_FITTED_LABELS;

export const METER_TYPE_LABELS: Record<MeterType, string> = {
  none: "Nothing (no odometer or hour meter)",
  kilometres: "Kilometres (odometer)",
  hours: "Hours (hour meter)",
  both: "Both kilometres and hours",
};

export const OWNER_TYPE_LABELS: Record<AssetOwnerType, string> = {
  own: "Own",
  client_owned: "Client-owned",
  hired_in: "Hired-in",
};

export type MeterAssessment =
  | { kind: "ok" }
  | { kind: "lower_needs_reason_and_acceptance"; previous: number }
  | { kind: "implausible_jump_needs_confirmation"; difference: number };

/** SoW §3.1 meter rules; thresholds are Recommended settings (meter.max_*_per_day). */
export function assessMeterReading(
  previous: { value: number; readAt: Date } | null,
  next: { value: number; readAt: Date },
  maxPerDay: number,
): MeterAssessment {
  if (!previous) return { kind: "ok" };
  if (next.value < previous.value) return { kind: "lower_needs_reason_and_acceptance", previous: previous.value };
  const days = Math.max((next.readAt.getTime() - previous.readAt.getTime()) / 86_400_000, 1);
  const diff = next.value - previous.value;
  return diff / days > maxPerDay ? { kind: "implausible_jump_needs_confirmation", difference: diff } : { kind: "ok" };
}

/** Columns of the standard CSV import template (SoW §3.1). */
export const ASSET_IMPORT_COLUMNS = [
  "asset_number",
  "asset_class",
  "make",
  "model",
  "year",
  "registration_number",
  "registration_state",
  "vin",
  "serial_number",
  "owner_type",
  "client",
  "site",
  "meter_type",
  "odometer_km",
  "engine_hours",
  "notes",
  "duplicate_reason",
] as const;
export const ASSET_IMPORT_MAX_ROWS = 1000;
