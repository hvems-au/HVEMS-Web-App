/**
 * Input validation shared by web forms, server actions and the future mobile
 * app. The database re-validates everything; these schemas exist for fast,
 * friendly feedback and to keep clients consistent.
 */
import { z } from "zod";
import { AU_STATES, isValidAbn, type AssetField } from "@hvems/domain";
import { COMPANY_ROLES, MARKETPLACE_CUSTOMER_ROLES, PROVIDER_ROLES } from "@hvems/permissions";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/** Recommended password policy (SoW §2.5 "password checks"): 10+ characters, not only letters. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use 128 characters or fewer")
  .refine((v) => /[^A-Za-z]/.test(v), "Include at least one number or symbol");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    fullName: trimmed(200).min(2, "Enter your full name"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { message: "You must accept the terms to continue" }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const abnSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ""))
  .refine((v) => v === "" || isValidAbn(v), "Enter a valid 11-digit ABN");

export const createOrganisationSchema = z
  .object({
    kind: z.enum(["company", "marketplace_customer", "provider"]),
    name: trimmed(200).min(2, "Enter a name"),
    abn: abnSchema.optional().default(""),
  })
  .refine((v) => v.kind !== "provider" || v.abn.length === 11, { path: ["abn"], message: "Provider accounts need an ABN" });
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum([...COMPANY_ROLES, ...MARKETPLACE_CUSTOMER_ROLES, ...PROVIDER_ROLES]),
});

const stateSchema = z.enum(AU_STATES);

export const assetFormSchema = z
  .object({
    asset_number: trimmed(40).min(1, "Enter an asset number"),
    // Standard or company class code; the database checks it belongs to this company (O-03).
    asset_class: z.string().trim().min(1, "Choose an asset class").max(40),
    make: optionalText(100),
    model: optionalText(100),
    year: z
      .union([z.literal(""), z.coerce.number().int().min(1900).max(2100)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    registration_number: optionalText(20).transform((v) => v?.toUpperCase()),
    registration_state: z.union([z.literal(""), stateSchema]).optional().transform((v) => (v ? v : undefined)),
    vin: optionalText(40).transform((v) => v?.toUpperCase()),
    serial_number: optionalText(60),
    owner_type: z.enum(["own", "client_owned", "hired_in"]).default("own"),
    client_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => (v ? v : undefined)),
    site_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => (v ? v : undefined)),
    meter_type: z.enum(["none", "kilometres", "hours", "both"]),
    notes: optionalText(5000),
    duplicate_reason: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    // Class-specific mandatory fields are checked by the database for every
    // route; forms add them up front with assetFormSchemaFor(classes).
    if (v.owner_type === "client_owned" && !v.client_id) {
      ctx.addIssue({ code: "custom", path: ["client_id"], message: "Client-owned assets need a client" });
    }
  });
export type AssetFormInput = z.input<typeof assetFormSchema>;

/** Asset form schema that also enforces the chosen class's mandatory fields (for instant feedback). */
export function assetFormSchemaFor(classes: readonly { code: string; name: string; required_fields: readonly string[] }[]) {
  return assetFormSchema.superRefine((v, ctx) => {
    const cls = classes.find((c) => c.code === v.asset_class);
    if (!cls) {
      ctx.addIssue({ code: "custom", path: ["asset_class"], message: "Choose an asset class" });
      return;
    }
    for (const field of cls.required_fields) {
      if (!v[field as AssetField]) ctx.addIssue({ code: "custom", path: [field], message: `Required for ${cls.name.toLowerCase()}` });
    }
  });
}

/** A new asset class (company or standard). */
export const assetClassSchema = z.object({
  name: trimmed(80).min(2, "Enter a class name"),
  category: z.enum(["vehicle", "equipment"], { message: "Choose vehicle or equipment" }),
  default_meter_type: z.enum(["none", "kilometres", "hours", "both"]),
});
export type AssetClassInput = z.output<typeof assetClassSchema>;
export type AssetFormValues = z.output<typeof assetFormSchema>;

export const clientFormSchema = z.object({
  name: trimmed(200).min(1, "Enter a client name"),
  abn: abnSchema.optional().transform((v) => (v ? v : undefined)),
  contact_name: optionalText(200),
  contact_email: z.union([z.literal(""), emailSchema]).optional().transform((v) => (v ? v : undefined)),
  contact_phone: optionalText(40),
  address: optionalText(500),
  notes: optionalText(5000),
});
export type ClientFormValues = z.output<typeof clientFormSchema>;

export const siteFormSchema = z.object({
  name: trimmed(200).min(1, "Enter a site name"),
  client_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((v) => (v ? v : undefined)),
  address_line1: optionalText(200),
  address_line2: optionalText(200),
  suburb: optionalText(100),
  state: z.union([z.literal(""), stateSchema]).optional().transform((v) => (v ? v : undefined)),
  postcode: z
    .union([z.literal(""), z.string().regex(/^\d{4}$/, "Postcodes have four digits")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  timezone: z.string().default("Australia/Brisbane"),
  contact_name: optionalText(200),
  contact_phone: optionalText(40),
  contact_email: z.union([z.literal(""), emailSchema]).optional().transform((v) => (v ? v : undefined)),
  shift_times: optionalText(1000),
  access_instructions: optionalText(5000),
  safety_instructions: optionalText(5000),
});
export type SiteFormValues = z.output<typeof siteFormSchema>;

export const meterReadingSchema = z.object({
  unit: z.enum(["km", "hours"]),
  value: z.coerce.number().min(0, "Readings cannot be negative").max(99_999_999),
  read_at: z.coerce.date().optional(),
  lower_reason: optionalText(500),
  confirm_jump: z.coerce.boolean().optional().default(false),
  client_request_id: z.string().uuid().optional(),
  /** Start tracking this unit too when the asset doesn't yet (manager roles only). */
  add_meter: z.coerce.boolean().optional().default(false),
});

export const archiveAssetSchema = z.object({
  reason: trimmed(1000).min(3, "Give a reason"),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  disposal: z.enum(["retired", "sold", "other"]).default("retired"),
  open_issues_acknowledged: z.coerce.boolean().optional().default(false),
});

/** Super Admin edit of an organisation (ADM-02). ABN rules are checked again by the database. */
export const adminOrganisationSchema = z.object({
  name: trimmed(200).min(2, "Enter a name of at least 2 characters"),
  legal_name: optionalText(200),
  abn: abnSchema.optional().transform((v) => (v ? v : undefined)),
  timezone: z.string().min(1, "Choose a timezone"),
});
export type AdminOrganisationValues = z.output<typeof adminOrganisationSchema>;

/** Suspend or reinstate an organisation: always with a reason (ADM-02, ACC-18). */
export const organisationSuspensionSchema = z.object({
  suspend: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: trimmed(1000).min(10, "Give a reason of at least 10 characters"),
});

export { z };
