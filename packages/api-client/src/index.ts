/**
 * HVEMS API client — the typed contract over Supabase (tables under RLS +
 * RPC functions) shared by the Next.js web app and the future React Native
 * app. Every function takes a Supabase client authenticated as the end user,
 * so the database enforces permissions; nothing here relies on Next.js.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  AppNotification,
  Asset,
  ChecklistItem,
  Defect,
  Inspection,
  InspectionAnswer,
  InspectionAnswerValue,
  InspectionPhoto,
  PrestartSubmitResult,
  OpenConditionCause,
  ReturnToServiceEvent,
  DefectSeverityValue,
  CriticalAlert,
  Hold,
  Breakdown,
  RegulatorNotice,
  DriverCredential,
  MissedPrestart,
  SecurityEvent,
  SupportSession,
  DriverProfile,
  EquipmentCode,
  EquipmentPublic,
  AssetClass,
  AssetListItem,
  AuditEvent,
  Client,
  ConditionHistoryEntry,
  ImportResult,
  Invitation,
  Membership,
  MeterReading,
  MeterUnit,
  MyContext,
  Organisation,
  PlatformSetting,
  Site,
  StaffContext,
} from "@hvems/types";
import type { AssetFormValues, ClientFormValues, SiteFormValues } from "@hvems/validation";
import type { AllocationWarning, AssetCondition, LeaveKind, MeterType, QualificationKind } from "@hvems/domain";
import type { MemberRole, OrganisationKind } from "@hvems/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HvemsClient = SupabaseClient<any, "public", "public", any, any>;

/** Application error carrying the database's stable error code (app.raise hint). */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const SQLSTATE_MESSAGES: Record<string, string> = {
  "42501": "You don't have permission to do that.",
  "23505": "That record already exists.",
  "23503": "A linked record could not be found.",
  "23514": "Some details are not valid.",
  PGRST116: "Record not found.",
};

/**
 * Australian terms in database messages (HVEMS style: odometer and hour meter
 * readings, never "meter"). Applied to every coded database error, so web and
 * mobile show the same wording.
 */
export function australianWording(message: string): string {
  return message
    .replace(/\ba meter type\b/g, "an odometer or hour meter")
    .replace(/(?<!hour )\bmeter types?\b/gi, (m) => (m[0] === "M" ? "Odometer or hour meter" : "odometer or hour meter"))
    .replace(/\bthis meter\b/gi, "this odometer or hour meter")
    .replace(/(?<!hour )\bmeter readings?\b/gi, (m) => (m.endsWith("s") ? "odometer and hour meter readings" : "odometer or hour meter reading"));
}

export function toAppError(error: PostgrestError | Error | null | undefined): AppError {
  if (!error) return new AppError("unknown", "Something went wrong.");
  const pg = error as PostgrestError;
  if (pg.hint && /^[a-z_]+$/.test(pg.hint)) {
    let details: Record<string, unknown> | undefined;
    try {
      details = pg.details ? (JSON.parse(pg.details) as Record<string, unknown>) : undefined;
    } catch {
      details = undefined;
    }
    return new AppError(pg.hint, australianWording(pg.message), details);
  }
  if (pg.code && SQLSTATE_MESSAGES[pg.code]) return new AppError(pg.code, SQLSTATE_MESSAGES[pg.code] ?? pg.message);
  return new AppError("unknown", error.message || "Something went wrong.");
}

function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

// ------------------------------------------------------------- identity
export async function getMyContexts(db: HvemsClient): Promise<MyContext[]> {
  return unwrap(await db.rpc("my_contexts")) ?? [];
}

export async function getMyCapabilities(db: HvemsClient, organisationId: string): Promise<string[]> {
  return unwrap(await db.rpc("my_capabilities", { p_organisation_id: organisationId })) ?? [];
}

export async function getMyStaffContext(db: HvemsClient): Promise<StaffContext | null> {
  const rows = unwrap<StaffContext[]>(await db.rpc("my_staff_context"));
  return rows?.[0] ?? null;
}

/**
 * Create an organisation; the creator becomes its Owner. A timezone other than
 * the Brisbane default is saved straight after (the Owner may update it; the
 * database rejects unknown timezones).
 */
export async function createOrganisation(
  db: HvemsClient,
  input: { kind: OrganisationKind; name: string; abn?: string; timezone?: string },
): Promise<string> {
  const id = unwrap<string>(await db.rpc("create_organisation", { p_kind: input.kind, p_name: input.name, p_abn: input.abn || null }));
  if (input.timezone && input.timezone !== "Australia/Brisbane") {
    unwrap(await db.from("organisations").update({ timezone: input.timezone }).eq("id", id).select("id").single());
  }
  return id;
}

export async function getOrganisation(db: HvemsClient, id: string): Promise<Organisation> {
  return unwrap(await db.from("organisations").select("*").eq("id", id).single());
}

export async function listMembers(db: HvemsClient, organisationId: string): Promise<Membership[]> {
  return unwrap<Membership[]>(
    (await db
      .from("org_memberships")
      .select("id, organisation_id, user_id, role, additional_roles, status, created_at, profile:profiles!inner(full_name, email), grants:membership_grants(id, membership_id, grant_type, approval_limit_cents, competency_note, assigned_at, revoked_at)")
      .eq("organisation_id", organisationId)
      .neq("status", "removed")
      .order("created_at")) as unknown as { data: Membership[] | null; error: PostgrestError | null },
  );
}

export async function listInvitations(db: HvemsClient, organisationId: string): Promise<Invitation[]> {
  return unwrap(
    await db
      .from("invitations")
      .select("id, organisation_id, email, role, expires_at, accepted_at, revoked_at, created_at")
      .eq("organisation_id", organisationId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  );
}

export async function createInvitation(
  db: HvemsClient,
  input: { organisationId: string; email: string; role: MemberRole },
): Promise<{ invitation_id: string; token: string; expires_at: string }> {
  const rows = unwrap<{ invitation_id: string; token: string; expires_at: string }[]>(
    await db.rpc("create_invitation", { p_organisation_id: input.organisationId, p_email: input.email, p_role: input.role }),
  );
  const row = rows?.[0];
  if (!row) throw new AppError("unknown", "The invitation could not be created.");
  return row;
}

export async function acceptInvitation(db: HvemsClient, token: string): Promise<string> {
  return unwrap(await db.rpc("accept_invitation", { p_token: token }));
}

export async function revokeInvitation(db: HvemsClient, invitationId: string): Promise<void> {
  unwrap(await db.rpc("revoke_invitation", { p_invitation_id: invitationId }));
}

// ------------------------------------------------------------- fleet
/**
 * Active asset classes: the HVEMS standard classes, plus the company's own
 * when `organisationId` is given (O-03). Without it, standard classes only.
 */
export async function listAssetClasses(db: HvemsClient, organisationId?: string): Promise<AssetClass[]> {
  let q = db.from("asset_classes").select("*").eq("active", true);
  q = organisationId ? q.or(`organisation_id.is.null,organisation_id.eq.${organisationId}`) : q.is("organisation_id", null);
  return unwrap(await q.order("sort_order").order("name"));
}

/** Create a company class, or a standard class when organisationId is null (Super Admin). */
export async function createAssetClass(
  db: HvemsClient,
  organisationId: string | null,
  v: { name: string; category: "vehicle" | "equipment"; default_meter_type: MeterType },
): Promise<AssetClass> {
  return unwrap(
    await db.rpc("create_asset_class", {
      p_organisation_id: organisationId,
      p_name: v.name,
      p_category: v.category,
      p_default_meter_type: v.default_meter_type,
    }),
  ) as AssetClass;
}

export interface AssetListQuery {
  organisationId: string;
  search?: string;
  condition?: AssetCondition;
  status?: "current" | "archived";
  page?: number;
  pageSize?: number;
}

export async function listAssets(db: HvemsClient, q: AssetListQuery): Promise<{ rows: AssetListItem[]; total: number }> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  let query = db
    .from("assets")
    .select("*, asset_class:asset_classes(code, name, category), site:sites(id, name, suburb, state), client:clients(id, name)", {
      count: "exact",
    })
    .eq("organisation_id", q.organisationId);
  query = q.status === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q.condition) query = query.eq("condition", q.condition);
  if (q.search?.trim()) {
    const s = q.search.trim().replace(/[%_,()]/g, " ");
    query = query.or(
      ["asset_number", "make", "model", "registration_number", "vin", "serial_number"].map((c) => `${c}.ilike.%${s}%`).join(","),
    );
  }
  const res = await query.order("asset_number").range((page - 1) * pageSize, page * pageSize - 1);
  if (res.error) throw toAppError(res.error);
  return { rows: (res.data ?? []) as AssetListItem[], total: res.count ?? 0 };
}

/**
 * Every asset matching the register's filters, for CSV export. Fetched in
 * chunks of 1,000 (the API's row limit), up to `max` rows.
 */
export async function listAssetsForExport(db: HvemsClient, q: Omit<AssetListQuery, "page" | "pageSize">, max = 20000): Promise<AssetListItem[]> {
  const rows: AssetListItem[] = [];
  for (let from = 0; from < max; from += 1000) {
    let query = db
      .from("assets")
      .select("*, asset_class:asset_classes(code, name, category), site:sites(id, name, suburb, state), client:clients(id, name)")
      .eq("organisation_id", q.organisationId);
    query = q.status === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    if (q.condition) query = query.eq("condition", q.condition);
    if (q.search?.trim()) {
      const s = q.search.trim().replace(/[%_,()]/g, " ");
      query = query.or(["asset_number", "make", "model", "registration_number", "vin", "serial_number"].map((c) => `${c}.ilike.%${s}%`).join(","));
    }
    const res = await query.order("asset_number").range(from, from + 999);
    if (res.error) throw toAppError(res.error);
    const chunk = (res.data ?? []) as AssetListItem[];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}

export async function getAssetConditionCounts(db: HvemsClient, organisationId: string): Promise<Record<AssetCondition | "total", number>> {
  const counts = { total: 0, active: 0, needs_attention: 0, out_of_service: 0 };
  const conditions: AssetCondition[] = ["active", "needs_attention", "out_of_service"];
  const results = await Promise.all(
    conditions.map((c) =>
      db.from("assets").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).is("archived_at", null).eq("condition", c),
    ),
  );
  results.forEach((r, i) => {
    if (r.error) throw toAppError(r.error);
    counts[conditions[i] as AssetCondition] = r.count ?? 0;
  });
  counts.total = counts.active + counts.needs_attention + counts.out_of_service;
  return counts;
}

export async function getAsset(db: HvemsClient, assetId: string): Promise<AssetListItem> {
  return unwrap(
    await db
      .from("assets")
      .select("*, asset_class:asset_classes(code, name, category), site:sites(id, name, suburb, state), client:clients(id, name)")
      .eq("id", assetId)
      .single(),
  );
}

function assetPayload(organisationId: string, classId: string, v: AssetFormValues) {
  return {
    organisation_id: organisationId,
    asset_number: v.asset_number,
    asset_class_id: classId,
    make: v.make ?? null,
    model: v.model ?? null,
    year: v.year ?? null,
    registration_number: v.registration_number ?? null,
    registration_state: v.registration_state ?? null,
    vin: v.vin ?? null,
    serial_number: v.serial_number ?? null,
    owner_type: v.owner_type,
    client_id: v.client_id ?? null,
    site_id: v.site_id ?? null,
    meter_type: v.meter_type,
    notes: v.notes ?? null,
    duplicate_reason: v.duplicate_reason ?? null,
    ...(v.prestart_frequency === undefined
      ? {}
      : { prestart_frequency: v.prestart_frequency || null, prestart_every_days: v.prestart_frequency === "custom" ? (v.prestart_every_days ?? null) : null }),
    ...(v.rops_fitted === undefined ? {} : { rops_fitted: v.rops_fitted }),
    ...(v.fops_fitted === undefined ? {} : { fops_fitted: v.fops_fitted }),
    ...(v.fire_suppression_fitted === undefined ? {} : { fire_suppression_fitted: v.fire_suppression_fitted }),
  };
}

export async function createAsset(db: HvemsClient, organisationId: string, classId: string, v: AssetFormValues, id?: string): Promise<Asset> {
  return unwrap(
    await db
      .from("assets")
      .insert({ ...(id ? { id } : {}), ...assetPayload(organisationId, classId, v) })
      .select("*")
      .single(),
  );
}

export async function updateAsset(db: HvemsClient, assetId: string, classId: string, v: AssetFormValues): Promise<Asset> {
  const { organisation_id: _org, ...payload } = assetPayload("", classId, v);
  return unwrap(await db.from("assets").update(payload).eq("id", assetId).select("*").single());
}

export async function archiveAsset(
  db: HvemsClient,
  assetId: string,
  input: { reason: string; effective_date: string; disposal: "disposed" | "sold" | "transferred_out" | "written_off" | "other"; open_issues_acknowledged: boolean },
): Promise<void> {
  unwrap(
    await db.rpc("archive_asset", {
      p_asset_id: assetId,
      p_reason: input.reason,
      p_effective_date: input.effective_date,
      p_disposal: input.disposal,
      p_open_issues_acknowledged: input.open_issues_acknowledged,
    }),
  );
}

export async function importAssets(db: HvemsClient, organisationId: string, rows: Record<string, string>[], dryRun: boolean): Promise<ImportResult> {
  return unwrap(await db.rpc("import_assets", { p_organisation_id: organisationId, p_rows: rows, p_dry_run: dryRun }));
}

export async function listMeterReadings(db: HvemsClient, assetId: string, limit = 50): Promise<MeterReading[]> {
  return unwrap(await db.from("meter_readings").select("*").eq("asset_id", assetId).order("read_at", { ascending: false }).limit(limit));
}

export async function recordMeterReading(
  db: HvemsClient,
  input: {
    assetId: string;
    unit: MeterUnit;
    value: number;
    readAt?: Date;
    clientRequestId?: string;
    lowerReason?: string;
    confirmJump?: boolean;
    /** Start tracking this unit as well when the asset doesn't yet. */
    addMeter?: boolean;
  },
): Promise<MeterReading> {
  return unwrap(
    await db.rpc("record_meter_reading", {
      p_asset_id: input.assetId,
      p_unit: input.unit,
      p_value: input.value,
      p_read_at: (input.readAt ?? new Date()).toISOString(),
      p_source: "manual",
      p_client_request_id: input.clientRequestId ?? null,
      p_lower_reason: input.lowerReason ?? null,
      p_confirm_jump: input.confirmJump ?? false,
      p_add_meter: input.addMeter ?? false,
    }),
  );
}

export async function listConditionHistory(db: HvemsClient, assetId: string): Promise<ConditionHistoryEntry[]> {
  return unwrap(
    await db.from("asset_condition_history").select("id, asset_id, from_condition, to_condition, cause_kind, changed_at").eq("asset_id", assetId).order("changed_at", { ascending: false }).limit(50),
  );
}

// ------------------------------------------------------------- clients & sites
export async function listClients(db: HvemsClient, organisationId: string): Promise<Client[]> {
  return unwrap(await db.from("clients").select("*").eq("organisation_id", organisationId).is("archived_at", null).order("name"));
}

export async function createClientRecord(db: HvemsClient, organisationId: string, v: ClientFormValues): Promise<Client> {
  return unwrap(await db.from("clients").insert({ organisation_id: organisationId, ...v }).select("*").single());
}

/**
 * Update a client. `v` holds only the fields the form sent; fields cleared in
 * the form arrive as undefined and are stored as NULL. RLS requires clients.manage.
 */
export async function updateClientRecord(db: HvemsClient, clientId: string, v: Partial<ClientFormValues>): Promise<Client> {
  return unwrap(await db.from("clients").update(nullify(v)).eq("id", clientId).select("*").single());
}

export async function listSites(db: HvemsClient, organisationId: string): Promise<Site[]> {
  return unwrap(await db.from("sites").select("*").eq("organisation_id", organisationId).is("archived_at", null).order("name"));
}

export async function createSite(db: HvemsClient, organisationId: string, v: SiteFormValues): Promise<Site> {
  return unwrap(await db.from("sites").insert({ organisation_id: organisationId, ...v }).select("*").single());
}

/** Update a site (RLS requires sites.manage). Cleared fields are stored as NULL. */
export async function updateSite(db: HvemsClient, siteId: string, v: Partial<SiteFormValues>): Promise<Site> {
  return unwrap(await db.from("sites").update(nullify(v)).eq("id", siteId).select("*").single());
}

function nullify<T extends Record<string, unknown>>(v: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === undefined ? null : x]));
}

// ------------------------------------------------------------- Super Admin: organisations
/** Super Admin only (platform_administrator with MFA); enforced by the database. */
export async function adminUpdateOrganisation(
  db: HvemsClient,
  organisationId: string,
  v: { name: string; legal_name?: string; abn?: string; timezone: string },
): Promise<void> {
  unwrap(
    await db.rpc("admin_update_organisation", {
      p_organisation_id: organisationId,
      p_name: v.name,
      p_legal_name: v.legal_name ?? null,
      p_abn: v.abn ?? null,
      p_timezone: v.timezone,
    }),
  );
}

/** Suspend (de-activate) or reinstate an organisation, with a reason. Super Admin only. */
export async function adminSetOrganisationSuspended(db: HvemsClient, organisationId: string, suspend: boolean, reason: string): Promise<string> {
  return unwrap(await db.rpc("admin_set_organisation_suspended", { p_organisation_id: organisationId, p_suspend: suspend, p_reason: reason })) as string;
}

// ------------------------------------------------------------- audit & settings
export interface AuditFilter {
  /** An organisation id, "platform" for platform-level events, or undefined for all the caller may see. */
  organisationId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
  /** ISO dates (inclusive), already converted to instants by the caller. */
  from?: string;
  to?: string;
  limit?: number;
}

const AUDIT_COLUMNS = "id, occurred_at, organisation_id, actor_user_id, actor_method, action, entity_type, entity_id, changes, context";

/**
 * Audit history (AUD-01/02). RLS decides what the caller sees: their own
 * organisations with audit.view, or everything for HVEMS staff with MFA.
 */
export async function listAuditEvents(db: HvemsClient, q: AuditFilter): Promise<AuditEvent[]> {
  let query = db.from("audit_events").select(AUDIT_COLUMNS);
  if (q.organisationId === "platform") query = query.is("organisation_id", null);
  else if (q.organisationId) query = query.eq("organisation_id", q.organisationId);
  if (q.entityType) query = query.eq("entity_type", q.entityType);
  if (q.entityId) query = query.eq("entity_id", q.entityId);
  if (q.action) query = query.eq("action", q.action);
  if (q.actorUserId) query = query.eq("actor_user_id", q.actorUserId);
  if (q.from) query = query.gte("occurred_at", q.from);
  if (q.to) query = query.lt("occurred_at", q.to);
  return unwrap(await query.order("occurred_at", { ascending: false }).limit(Math.min(q.limit ?? 200, 5000))) as AuditEvent[];
}

/** Console view: same as listAuditEvents (kept for existing callers). */
export async function listPlatformAuditEvents(db: HvemsClient, q: AuditFilter = {}): Promise<AuditEvent[]> {
  return listAuditEvents(db, q);
}

/** Sign-in and security events (wrong passwords, locks, MFA resets, unlocks, support access). */
export async function listSecurityEvents(
  db: HvemsClient,
  q: { organisationId?: string; eventType?: string; from?: string; to?: string; limit?: number },
): Promise<SecurityEvent[]> {
  let query = db.from("security_events").select("id, occurred_at, user_id, organisation_id, event_type, detail, context");
  if (q.organisationId === "platform") query = query.is("organisation_id", null);
  else if (q.organisationId) query = query.eq("organisation_id", q.organisationId);
  if (q.eventType) query = query.eq("event_type", q.eventType);
  if (q.from) query = query.gte("occurred_at", q.from);
  if (q.to) query = query.lt("occurred_at", q.to);
  return unwrap(await query.order("occurred_at", { ascending: false }).limit(Math.min(q.limit ?? 200, 5000))) as SecurityEvent[];
}

export interface AuditChainCheck {
  checked_days: number;
  broken: { day: string; expected_events: number; found_events: number }[];
  last_sealed: string | null;
}

/** AUD-03: recompute the daily hash chain (HVEMS staff with MFA). */
export async function verifyAuditChain(db: HvemsClient): Promise<AuditChainCheck> {
  return unwrap(await db.rpc("verify_audit_chain", {})) as unknown as AuditChainCheck;
}

export async function listPlatformSettings(db: HvemsClient): Promise<PlatformSetting[]> {
  return unwrap(await db.from("platform_settings").select("key, value, description, status, sow_reference").order("key"));
}

// ---------------------------------------------------------------------------
// Pre-start inspections, defects, notifications
// ---------------------------------------------------------------------------

/** Bucket for pre-start photos; paths are <organisation>/<asset>/<clientRequestId>/<file>. */
export const ORGANISATION_LOGO_BUCKET = "organisation-logos";

/** Where a new company logo is uploaded; the database only accepts this folder and pattern. */
export function organisationLogoPath(organisationId: string, ext: "png" | "jpg" = "png"): string {
  return `${organisationId}/logo-${crypto.randomUUID()}.${ext}`;
}

/** Point the organisation at a newly uploaded logo (or none), then delete the old file. */
export async function setOrganisationLogo(db: HvemsClient, organisationId: string, path: string | null): Promise<void> {
  const { data: before } = await db.from("organisations").select("logo_path").eq("id", organisationId).single();
  const { error } = await db.from("organisations").update({ logo_path: path }).eq("id", organisationId);
  if (error) throw toAppError(error);
  const old = before?.logo_path;
  if (old && old !== path) await db.storage.from(ORGANISATION_LOGO_BUCKET).remove([old]);
}

/** The logo file itself (for PDFs), or null when there is none or it can’t be read. */
export async function downloadOrganisationLogo(db: HvemsClient, path: string | null | undefined): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!path) return null;
  const { data, error } = await db.storage.from(ORGANISATION_LOGO_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || (path.endsWith(".jpg") ? "image/jpeg" : "image/png") };
}

/** A short-lived link to show the logo on screen. */
export async function signOrganisationLogo(db: HvemsClient, path: string | null | undefined, expiresInSeconds = 600): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(ORGANISATION_LOGO_BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

export const INSPECTION_PHOTO_BUCKET = "inspection-photos";

export function inspectionPhotoPath(organisationId: string, assetId: string, clientRequestId: string, fileName: string): string {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "photo.jpg";
  return `${organisationId}/${assetId}/${clientRequestId}/${Date.now()}-${safe}`;
}

/** The checklist that applies to an asset; refuses drivers not permitted on it. */
export async function getPrestartChecklist(db: HvemsClient, assetId: string): Promise<ChecklistItem[]> {
  return unwrap<ChecklistItem[]>(await db.rpc("prestart_checklist", { p_asset_id: assetId }));
}

export async function submitPrestart(
  db: HvemsClient,
  input: {
    assetId: string;
    answers: { item_code: string; answer: InspectionAnswerValue; note?: string }[];
    odometerKm?: number | null;
    engineHours?: number | null;
    notes?: string;
    photos?: { path: string; item_code?: string | null }[];
    declaration: boolean;
    clientRequestId: string;
    confirmJump?: boolean;
    lowerReadingReason?: string;
  },
): Promise<PrestartSubmitResult> {
  return unwrap<PrestartSubmitResult>(
    await db.rpc("submit_prestart", {
      p_asset_id: input.assetId,
      p_answers: input.answers,
      p_odometer_km: input.odometerKm ?? null,
      p_engine_hours: input.engineHours ?? null,
      p_notes: input.notes || null,
      p_photos: input.photos ?? [],
      p_declaration: input.declaration,
      p_client_request_id: input.clientRequestId,
      p_confirm_jump: input.confirmJump ?? false,
      p_lower_reading_reason: input.lowerReadingReason || null,
    }),
  );
}

export type InspectionListItem = Inspection & { asset: { asset_number: string; make: string | null; model: string | null } | null };

export async function listInspections(
  db: HvemsClient,
  filter: {
    organisationId: string;
    assetId?: string;
    /** Who submitted it. */
    submittedBy?: string;
    result?: InspectionListItem["result"];
    /** Submitted at or after / before these instants. */
    from?: Date;
    to?: Date;
    /** Free-text search: operator name, or equipment matching (ids found by the caller). */
    search?: { text: string; assetIds: string[] };
    limit?: number;
  },
): Promise<InspectionListItem[]> {
  let q = db
    .from("inspections")
    .select("*, asset:assets(asset_number, make, model)")
    .eq("organisation_id", filter.organisationId)
    .order("submitted_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.assetId) q = q.eq("asset_id", filter.assetId);
  if (filter.submittedBy) q = q.eq("submitted_by", filter.submittedBy);
  if (filter.result) q = q.eq("result", filter.result);
  if (filter.from) q = q.gte("submitted_at", filter.from.toISOString());
  if (filter.to) q = q.lt("submitted_at", filter.to.toISOString());
  if (filter.search) {
    const t = filter.search.text.replace(/[%_,()*"\\]/g, " ").trim();
    const parts = t ? [`header->>operator_name.ilike.*${t}*`] : [];
    if (filter.search.assetIds.length) parts.push(`asset_id.in.(${filter.search.assetIds.join(",")})`);
    if (parts.length) q = q.or(parts.join(","));
  }
  return unwrap<InspectionListItem[]>(await q);
}

export async function getInspection(
  db: HvemsClient,
  id: string,
): Promise<{ inspection: Inspection; answers: InspectionAnswer[]; photos: InspectionPhoto[]; defects: Defect[] }> {
  const [inspection, answers, photos, defects] = await Promise.all([
    db.from("inspections").select("*").eq("id", id).single(),
    db.from("inspection_answers").select("*").eq("inspection_id", id).order("sort_order"),
    db.from("inspection_photos").select("*").eq("inspection_id", id).order("created_at"),
    db.from("defects").select("*").eq("inspection_id", id).order("reported_at"),
  ]);
  return {
    inspection: unwrap<Inspection>(inspection),
    answers: unwrap<InspectionAnswer[]>(answers),
    photos: unwrap<InspectionPhoto[]>(photos),
    defects: unwrap<Defect[]>(defects),
  };
}

/** Short-lived signed URLs for private pre-start photos (RLS on storage decides who may see them). */
export async function signInspectionPhotos(db: HvemsClient, paths: string[], expiresInSeconds = 600): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await db.storage.from(INSPECTION_PHOTO_BUCKET).createSignedUrls(paths, expiresInSeconds);
  if (error) throw toAppError(error);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export type DefectListItem = Defect & { asset: { asset_number: string; make: string | null; model: string | null } | null };

export async function listDefects(
  db: HvemsClient,
  filter: { organisationId: string; assetId?: string; status?: "open" | "closed"; limit?: number },
): Promise<DefectListItem[]> {
  let q = db
    .from("defects")
    .select("*, asset:assets(asset_number, make, model)")
    .eq("organisation_id", filter.organisationId)
    .order("reported_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.assetId) q = q.eq("asset_id", filter.assetId);
  if (filter.status) q = q.eq("status", filter.status);
  return unwrap<DefectListItem[]>(await q);
}

export async function listMyNotifications(db: HvemsClient, organisationId: string, limit = 50): Promise<AppNotification[]> {
  return unwrap<AppNotification[]>(
    await db.from("notifications").select("*").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(limit),
  );
}

export async function countUnreadNotifications(db: HvemsClient, organisationId: string): Promise<number> {
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .is("read_at", null);
  if (error) throw toAppError(error);
  return count ?? 0;
}

export async function markNotificationsRead(db: HvemsClient, ids?: string[]): Promise<number> {
  return unwrap<number>(await db.rpc("mark_notifications_read", { p_ids: ids ?? null }));
}

// ---------------------------------------------------------------------------
// Defect triage and two-step clearance (O-09)
// ---------------------------------------------------------------------------

/** Evidence photos live in the same private bucket: <organisation>/<asset>/<folder>/<file>. */
export function evidencePhotoPath(organisationId: string, assetId: string, folder: string, fileName: string): string {
  return inspectionPhotoPath(organisationId, assetId, folder, fileName);
}

export async function getDefect(db: HvemsClient, id: string): Promise<DefectListItem> {
  return unwrap<DefectListItem>(await db.from("defects").select("*, asset:assets(asset_number, make, model)").eq("id", id).single());
}

export async function triageDefect(
  db: HvemsClient,
  input: { defectId: string; severity: DefectSeverityValue; reason?: string; evidence?: string[] },
): Promise<void> {
  unwrap(
    await db.rpc("triage_defect", {
      p_defect_id: input.defectId,
      p_severity: input.severity,
      p_reason: input.reason || null,
      p_evidence: input.evidence ?? [],
    }),
  );
}

export async function dismissDefect(db: HvemsClient, defectId: string, reason: string): Promise<void> {
  unwrap(await db.rpc("dismiss_defect", { p_defect_id: defectId, p_reason: reason }));
}

export async function mergeDefect(db: HvemsClient, defectId: string, intoId: string, reason?: string): Promise<void> {
  unwrap(await db.rpc("merge_defect", { p_defect_id: defectId, p_into_id: intoId, p_reason: reason || null }));
}

export async function deferDefect(db: HvemsClient, defectId: string, newDue: string, reason: string): Promise<void> {
  unwrap(await db.rpc("defer_defect", { p_defect_id: defectId, p_new_due: newDue, p_reason: reason }));
}

/** Mark repaired. For a Critical defect the equipment then waits for return to service. */
export async function clearDefect(
  db: HvemsClient,
  input: { defectId: string; repairDetails: string; repairedBy?: string | null; evidence?: string[] },
): Promise<{ awaiting_return_to_service: boolean }> {
  return unwrap(
    await db.rpc("clear_defect", {
      p_defect_id: input.defectId,
      p_repair_details: input.repairDetails,
      p_repaired_by: input.repairedBy || null,
      p_evidence: input.evidence ?? [],
    }),
  );
}

export async function returnToService(db: HvemsClient, assetId: string, note: string, evidence: string[] = []): Promise<void> {
  unwrap(await db.rpc("return_to_service", { p_asset_id: assetId, p_note: note, p_evidence: evidence }));
}

export async function listOpenConditionCauses(db: HvemsClient, assetId: string): Promise<OpenConditionCause[]> {
  return unwrap<OpenConditionCause[]>(
    await db
      .from("asset_condition_causes")
      .select("id, kind, source_type, source_id, opened_at")
      .eq("asset_id", assetId)
      .is("resolved_at", null)
      .order("opened_at"),
  );
}

export async function listReturnToServiceEvents(db: HvemsClient, assetId: string, limit = 10): Promise<ReturnToServiceEvent[]> {
  return unwrap<ReturnToServiceEvent[]>(
    await db.from("return_to_service_events").select("*").eq("asset_id", assetId).order("returned_at", { ascending: false }).limit(limit),
  );
}

// ---------------------------------------------------------------------------
// Holds, breakdowns, regulator notices, critical alerts
// ---------------------------------------------------------------------------
type WithAsset<T> = T & { asset: { asset_number: string; make: string | null; model: string | null } | null };
const ASSET = "asset:assets(asset_number, make, model)";

export async function placeHold(db: HvemsClient, assetId: string, kind: Hold["kind"], reason: string): Promise<string> {
  return unwrap<string>(await db.rpc("place_hold", { p_asset_id: assetId, p_kind: kind, p_reason: reason }));
}

export async function removeHold(db: HvemsClient, holdId: string, note: string): Promise<{ awaiting_return_to_service: boolean }> {
  return unwrap(await db.rpc("remove_hold", { p_hold_id: holdId, p_note: note }));
}

export async function reportBreakdown(
  db: HvemsClient,
  input: { assetId: string; description: string; location?: string; evidence?: string[] },
): Promise<string> {
  return unwrap<string>(
    await db.rpc("report_breakdown", {
      p_asset_id: input.assetId,
      p_description: input.description,
      p_location: input.location || null,
      p_evidence: input.evidence ?? [],
    }),
  );
}

export async function resolveBreakdown(db: HvemsClient, breakdownId: string, resolution: string, evidence: string[] = []): Promise<void> {
  unwrap(await db.rpc("resolve_breakdown", { p_breakdown_id: breakdownId, p_resolution: resolution, p_evidence: evidence }));
}

export async function recordRegulatorNotice(
  db: HvemsClient,
  input: {
    assetId: string;
    authority: string;
    severity: RegulatorNotice["severity"];
    issuedOn: string;
    details: string;
    noticeNumber?: string;
    clearBy?: string;
    evidence?: string[];
  },
): Promise<string> {
  return unwrap<string>(
    await db.rpc("record_regulator_notice", {
      p_asset_id: input.assetId,
      p_authority: input.authority,
      p_severity: input.severity,
      p_issued_on: input.issuedOn,
      p_details: input.details,
      p_notice_number: input.noticeNumber || null,
      p_clear_by: input.clearBy || null,
      p_evidence: input.evidence ?? [],
    }),
  );
}

export async function clearRegulatorNotice(db: HvemsClient, noticeId: string, clearedOn: string, reference: string, evidence: string[] = []): Promise<void> {
  unwrap(await db.rpc("clear_regulator_notice", { p_notice_id: noticeId, p_cleared_on: clearedOn, p_reference: reference, p_evidence: evidence }));
}

export async function acknowledgeAlert(db: HvemsClient, alertId: string): Promise<void> {
  unwrap(await db.rpc("acknowledge_alert", { p_alert_id: alertId }));
}

/** Open holds, breakdowns and notices for one asset or the whole company. */
export async function listActiveSafetyEvents(
  db: HvemsClient,
  filter: { organisationId: string; assetId?: string },
): Promise<{ holds: WithAsset<Hold>[]; breakdowns: WithAsset<Breakdown>[]; notices: WithAsset<RegulatorNotice>[] }> {
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => (filter.assetId ? q.eq("asset_id", filter.assetId) : q);
  const [holds, breakdowns, notices] = await Promise.all([
    scope(db.from("holds").select(`*, ${ASSET}`).eq("organisation_id", filter.organisationId).is("removed_at", null)).order("placed_at", { ascending: false }),
    scope(db.from("breakdowns").select(`*, ${ASSET}`).eq("organisation_id", filter.organisationId).eq("status", "open")).order("reported_at", { ascending: false }),
    scope(db.from("regulator_notices").select(`*, ${ASSET}`).eq("organisation_id", filter.organisationId).eq("status", "open")).order("issued_on", { ascending: false }),
  ]);
  return {
    holds: unwrap<WithAsset<Hold>[]>(holds),
    breakdowns: unwrap<WithAsset<Breakdown>[]>(breakdowns),
    notices: unwrap<WithAsset<RegulatorNotice>[]>(notices),
  };
}

export async function listCriticalAlerts(db: HvemsClient, organisationId: string, limit = 50): Promise<WithAsset<CriticalAlert>[]> {
  return unwrap<WithAsset<CriticalAlert>[]>(
    await db.from("critical_alerts").select(`*, ${ASSET}`).eq("organisation_id", organisationId).order("raised_at", { ascending: false }).limit(limit),
  );
}

// ---------------------------------------------------------------------------
// Equipment QR codes and driver profiles (O-10)
// ---------------------------------------------------------------------------

/** Operator ID as shown to people: OP-0001. */
export function formatDriverId(n: number): string {
  return `OP-${String(n).padStart(4, "0")}`;
}

/** Accepts "OP-0001", "op1", "0001" or "1"; older "D-0001" IDs still work. */
export function parseDriverId(value: string): number | null {
  const m = value.trim().match(/^(?:op|o|d)?\s*-?\s*0*(\d{1,6})$/i);
  return m ? Number(m[1]) : null;
}

/** "ABCDEFGHJK" -> "ABCD-EFGH-JK" for labels and screens. */
export function formatShortCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

export async function getEquipmentCode(db: HvemsClient, assetId: string): Promise<EquipmentCode | null> {
  return unwrap<EquipmentCode | null>(
    await db.from("equipment_codes").select("id, asset_id, token, short_code, created_at, revoked_at").eq("asset_id", assetId).is("revoked_at", null).maybeSingle(),
  );
}

export async function generateEquipmentCode(db: HvemsClient, assetId: string, replaceReason?: string): Promise<string> {
  return unwrap<string>(await db.rpc("generate_equipment_code", { p_asset_id: assetId, p_replace_reason: replaceReason || null }));
}

/** Service role only: the scanned machine, or null for an unknown or revoked code. */
export async function getEquipmentPublic(admin: HvemsClient, code: string): Promise<EquipmentPublic | null> {
  return unwrap<EquipmentPublic | null>(await admin.rpc("equipment_public", { p_code: code }));
}

export async function listDriverCredentials(db: HvemsClient, organisationId: string): Promise<DriverCredential[]> {
  return unwrap<DriverCredential[]>(
    await db
      .from("driver_credentials")
      .select("id, organisation_id, driver_id, kind, label, number, issued_by, expires_on, updated_at")
      .eq("organisation_id", organisationId)
      .order("kind"),
  );
}

export interface DriverCredentialInput {
  kind: DriverCredential["kind"];
  label: string | null;
  number: string;
  issued_by: string | null;
  expires_on: string | null;
}

/** Add a credential, or update one when `id` is given. RLS: drivers.manage. */
export async function saveDriverCredential(
  db: HvemsClient,
  input: DriverCredentialInput & { organisationId: string; driverId: string; id?: string },
): Promise<void> {
  const { organisationId, driverId, id, ...values } = input;
  if (id) {
    const res = await db.from("driver_credentials").update(values).eq("id", id).eq("organisation_id", organisationId).select("id");
    if (!unwrap(res)?.length) throw new AppError("not_found", "Credential not found");
  } else {
    unwrap(await db.from("driver_credentials").insert({ ...values, organisation_id: organisationId, driver_id: driverId }));
  }
}

export async function deleteDriverCredential(db: HvemsClient, organisationId: string, id: string): Promise<void> {
  unwrap(await db.from("driver_credentials").delete().eq("id", id).eq("organisation_id", organisationId));
}

export async function listDrivers(db: HvemsClient, organisationId: string): Promise<DriverProfile[]> {
  return unwrap<DriverProfile[]>(
    await db
      .from("driver_profiles")
      .select("id, organisation_id, driver_number, full_name, phone, user_id, membership_id, setup_expires_at, failed_attempts, locked_until, last_sign_in_at, active, created_at")
      .eq("organisation_id", organisationId)
      .order("driver_number"),
  );
}

export async function createDriverProfile(
  db: HvemsClient,
  input: { organisationId: string; fullName: string; phone?: string },
): Promise<{ id: string; driver_number: number; setup_code: string; setup_expires_at: string }> {
  return unwrap(await db.rpc("create_driver_profile", { p_organisation_id: input.organisationId, p_full_name: input.fullName, p_phone: input.phone || null }));
}

export async function resetDriverSetup(db: HvemsClient, driverId: string): Promise<{ driver_number: number; setup_code: string; setup_expires_at: string }> {
  return unwrap(await db.rpc("reset_driver_setup", { p_driver_id: driverId }));
}

export async function setDriverActive(db: HvemsClient, driverId: string, active: boolean): Promise<void> {
  unwrap(await db.rpc("set_driver_active", { p_driver_id: driverId, p_active: active }));
}

/** Equipment a member may operate (drivers see only these). */
export async function listOperatorPermissions(db: HvemsClient, membershipId: string): Promise<{ id: string; asset_id: string | null; site_id: string | null }[]> {
  return unwrap(await db.from("asset_operator_permissions").select("id, asset_id, site_id").eq("membership_id", membershipId));
}

export async function setOperatorEquipment(db: HvemsClient, organisationId: string, membershipId: string, assetIds: string[]): Promise<void> {
  const current = await listOperatorPermissions(db, membershipId);
  const have = new Set(current.filter((p) => p.asset_id).map((p) => p.asset_id as string));
  const want = new Set(assetIds);
  const remove = current.filter((p) => p.asset_id && !want.has(p.asset_id)).map((p) => p.id);
  const add = assetIds.filter((a) => !have.has(a));
  if (remove.length) unwrap(await db.from("asset_operator_permissions").delete().in("id", remove));
  if (add.length) {
    unwrap(await db.from("asset_operator_permissions").insert(add.map((asset_id) => ({ organisation_id: organisationId, membership_id: membershipId, asset_id }))));
  }
}

// ------------------------------------------------------------- MFA recovery and reset (ACC-03, ACC-15)
export interface MfaRecoveryStatus {
  remaining: number;
  generated_at: string | null;
}

export type RecoveryCodeResult = { ok: true; user_id: string } | { ok: false; code: string; message: string };

/** New recovery codes for the signed-in user (needs an MFA session). Shown once; earlier codes stop working. */
export async function generateMfaRecoveryCodes(db: HvemsClient): Promise<string[]> {
  return unwrap<string[]>(await db.rpc("generate_mfa_recovery_codes")) ?? [];
}

export async function getMfaRecoveryStatus(db: HvemsClient): Promise<MfaRecoveryStatus> {
  const s = unwrap(await db.rpc("my_mfa_recovery_status")) as unknown as MfaRecoveryStatus | null;
  return { remaining: Number(s?.remaining ?? 0), generated_at: s?.generated_at ?? null };
}

/** Spend a recovery code. A wrong code is a result, not an error, so the lockout count is kept. */
export async function redeemMfaRecoveryCode(db: HvemsClient, code: string): Promise<RecoveryCodeResult> {
  return unwrap(await db.rpc("use_mfa_recovery_code", { p_code: code })) as unknown as RecoveryCodeResult;
}

/** Owner or Company Admin resets a member's MFA; returns the member's user id. */
export async function resetMemberMfa(db: HvemsClient, membershipId: string, reason: string): Promise<string> {
  return unwrap<string>(await db.rpc("reset_member_mfa", { p_membership_id: membershipId, p_reason: reason }));
}

/** Super Admin resets anyone's MFA; returns the user id. */
export async function adminResetUserMfa(db: HvemsClient, userId: string, reason: string): Promise<string> {
  return unwrap<string>(await db.rpc("admin_reset_user_mfa", { p_user_id: userId, p_reason: reason }));
}

// ------------------------------------------------------------- sign-in locks (O-11)
export interface MemberSignInLock {
  membership_id: string;
  failed_count: number;
  /** Set while the member is locked out. */
  locked_until: string | null;
}

/** Members with recent wrong passwords or a lock (Owner, Company Admin, Super Admin). */
export async function listMemberSignInLocks(db: HvemsClient, organisationId: string): Promise<MemberSignInLock[]> {
  return unwrap<MemberSignInLock[]>(await db.rpc("member_sign_in_locks", { p_organisation_id: organisationId })) ?? [];
}

/** Owner or Company Admin clears a member's wrong passwords or lock. */
export async function unlockMemberSignIn(db: HvemsClient, membershipId: string): Promise<void> {
  unwrap(await db.rpc("unlock_member_sign_in", { p_membership_id: membershipId }));
}

/** Super Admin clears anyone's wrong passwords or lock. */
export async function adminUnlockSignIn(db: HvemsClient, userId: string): Promise<void> {
  unwrap(await db.rpc("admin_unlock_sign_in", { p_user_id: userId }));
}

// ------------------------------------------------------------- support access (ADM-07)
const SUPPORT_COLUMNS = "id, staff_user_id, organisation_id, reason, starts_at, expires_at, ended_at, ended_by";

/** Support sessions for an organisation, newest first (Owner, Super Admin, or the staff member's own). */
export async function listSupportSessions(db: HvemsClient, organisationId: string, limit = 20): Promise<SupportSession[]> {
  return unwrap(
    await db.from("support_access_grants").select(SUPPORT_COLUMNS).eq("organisation_id", organisationId).order("starts_at", { ascending: false }).limit(limit),
  ) as SupportSession[];
}

export type StartSupportResult = { ok: true; grant_id: string } | { ok: false; code: string; message: string };

/**
 * HVEMS staff with MFA open a read-only session (reason, at most 60 minutes)
 * with the company's current support PIN. A wrong PIN is a result, not an
 * error, so the attempt (5 wrong = locked) is kept.
 */
export async function startSupportAccess(db: HvemsClient, organisationId: string, reason: string, minutes: number, pin: string): Promise<StartSupportResult> {
  return unwrap(await db.rpc("start_support_access", { p_organisation_id: organisationId, p_reason: reason, p_minutes: minutes, p_pin: pin })) as unknown as StartSupportResult;
}

export interface SupportPin {
  pin: string;
  valid_until: string;
  rotation_hours: number;
}

/** Owner / Company Admin: the company's current support PIN. */
export async function getSupportPin(db: HvemsClient, organisationId: string): Promise<SupportPin> {
  return unwrap(await db.rpc("my_support_pin", { p_organisation_id: organisationId })) as unknown as SupportPin;
}

/** Owner / Company Admin: replace the support PIN now. */
export async function rotateSupportPin(db: HvemsClient, organisationId: string): Promise<SupportPin> {
  return unwrap(await db.rpc("rotate_support_pin", { p_organisation_id: organisationId })) as unknown as SupportPin;
}

export async function endSupportAccess(db: HvemsClient, grantId: string): Promise<void> {
  unwrap(await db.rpc("end_support_access", { p_grant_id: grantId }));
}

/** The Owner ends an HVEMS support session for their organisation. */
export async function ownerEndSupportAccess(db: HvemsClient, grantId: string): Promise<void> {
  unwrap(await db.rpc("owner_end_support_access", { p_grant_id: grantId }));
}

export function isSupportSessionActive(s: Pick<SupportSession, "ended_at" | "expires_at">, now = Date.now()): boolean {
  return !s.ended_at && new Date(s.expires_at).getTime() > now;
}

// ------------------------------------------------------------- equipment count history (AST-16)
export interface AssetCountEvent {
  id: number;
  occurred_at: string;
  asset_id: string;
  delta: number;
  reason: "created" | "imported" | "archived" | "restored" | "converted" | "merged";
  /** Recorded from 11 Nov 2026; earlier events have none. */
  count_before: number | null;
  count_after: number | null;
  actor_user_id: string | null;
  asset?: { asset_number: string } | null;
}

/** Count history for billing (RLS: org.billing.view or HVEMS staff). */
export async function listAssetCountEvents(db: HvemsClient, organisationId: string, limit = 50): Promise<AssetCountEvent[]> {
  return unwrap(
    await db
      .from("asset_count_events")
      .select("id, occurred_at, asset_id, delta, reason, count_before, count_after, actor_user_id, asset:assets(asset_number)")
      .eq("organisation_id", organisationId)
      .order("id", { ascending: false })
      .limit(limit),
  ) as unknown as AssetCountEvent[];
}

// ------------------------------------------------------------- missed pre-starts (2B)
/** Missed pre-starts, newest first (RLS: inspections.review). */
export async function listMissedPrestarts(
  db: HvemsClient,
  organisationId: string,
  status: "open" | "reviewed" = "open",
  limit = 200,
  filter: { assetId?: string; frequency?: MissedPrestart["frequency"]; /** Only these equipment (from a search). */ assetIds?: string[]; /** Due on or after / on or before (yyyy-mm-dd). */ from?: string; to?: string } = {},
): Promise<MissedPrestart[]> {
  let q = db
    .from("missed_prestarts")
    .select("id, organisation_id, asset_id, frequency, period_start, period_end, status, review_note, reviewed_by, reviewed_at, asset:assets(asset_number, make, model)")
    .eq("organisation_id", organisationId);
  q = status === "open" ? q.eq("status", "open") : q.neq("status", "open");
  if (filter.assetId) q = q.eq("asset_id", filter.assetId);
  if (filter.frequency) q = q.eq("frequency", filter.frequency);
  if (filter.from) q = q.gte("period_end", filter.from);
  if (filter.to) q = q.lte("period_start", filter.to);
  if (filter.assetIds) q = q.in("asset_id", filter.assetIds.length ? filter.assetIds : ["00000000-0000-0000-0000-000000000000"]);
  return unwrap(await q.order("period_start", { ascending: false }).limit(limit)) as unknown as MissedPrestart[];
}

export async function countOpenMissedPrestarts(db: HvemsClient, organisationId: string): Promise<number> {
  const { count, error } = await db.from("missed_prestarts").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("status", "open");
  if (error) throw toAppError(error);
  return count ?? 0;
}

/** A manager reviews it: the equipment wasn't used, or the check was missed (note required). */
export async function reviewMissedPrestart(db: HvemsClient, id: string, outcome: "not_used" | "missed", note?: string): Promise<void> {
  unwrap(await db.rpc("review_missed_prestart", { p_id: id, p_outcome: outcome, p_note: note ?? undefined }));
}

// ------------------------------------------------------------- maintenance (2C: CS-17, CS-18)
export type ServiceStatus = "overdue" | "due_soon" | "ok";

export interface ServiceScheduleRow {
  id: string;
  organisation_id: string;
  asset_id: string;
  name: string;
  interval_days: number | null;
  interval_km: number | null;
  interval_hours: number | null;
  last_done_on: string | null;
  last_done_km: number | null;
  last_done_hours: number | null;
  notes: string | null;
  next_due_on: string | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  current_km: number | null;
  current_hours: number | null;
  status: ServiceStatus;
  /** A technician chose the next due when the last job was done. */
  next_due_chosen?: boolean;
}

export interface WorkOrder {
  id: string;
  organisation_id: string;
  number: number;
  asset_id: string;
  service_plan_id: string | null;
  defect_id: string | null;
  title: string;
  description: string | null;
  kind: "internal" | "vendor";
  vendor_name: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  assigned_to: string | null;
  due_on: string | null;
  status: "open" | "in_progress" | "completed" | "closed" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  odometer_km: number | null;
  engine_hours: number | null;
  labour_hours: number | null;
  cost_cents: number | null;
  closed_at: string | null;
  closed_by: string | null;
  close_note: string | null;
  reopen_count: number;
  last_reopen_reason: string | null;
  cancel_reason: string | null;
  /** Qualification the work needs (2C workforce). */
  required_qualification: Exclude<QualificationKind, "other"> | null;
  /** Recorded by the database whenever the person, due date or requirement changes. */
  assignment_warnings: AllocationWarning[];
  /** Next service due the technician chose in the post-work report (applied when closed). */
  next_due_on: string | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  created_at: string;
  asset?: { asset_number: string; make: string | null; model: string | null } | null;
}

/** "WO-0007" */
export function formatWorkOrderNumber(n: number): string {
  return `WO-${String(n).padStart(4, "0")}`;
}

const raw = (db: HvemsClient) => db as unknown as SupabaseClient;

/** Active service plans with next due and status (RLS: work_orders.manage / work_orders.work). */
export async function listServiceSchedule(db: HvemsClient, organisationId: string, assetId?: string): Promise<(ServiceScheduleRow & { asset?: { asset_number: string } | null })[]> {
  let q = raw(db).from("service_schedule").select("*").eq("organisation_id", organisationId);
  if (assetId) q = q.eq("asset_id", assetId);
  const rows = unwrap(await q) as ServiceScheduleRow[];
  const ids = [...new Set(rows.map((r) => r.asset_id))];
  const assets = ids.length ? (unwrap(await db.from("assets").select("id, asset_number").in("id", ids)) as { id: string; asset_number: string }[]) : [];
  const num = new Map(assets.map((a) => [a.id, a.asset_number]));
  const order: Record<ServiceStatus, number> = { overdue: 0, due_soon: 1, ok: 2 };
  return rows
    .map((r) => ({ ...r, asset: { asset_number: num.get(r.asset_id) ?? "—" } }))
    .sort((a, b) => order[a.status] - order[b.status] || (a.next_due_on ?? "9999").localeCompare(b.next_due_on ?? "9999"));
}

export interface ServicePlanInput {
  asset_id: string;
  name: string;
  interval_days: number | null;
  interval_km: number | null;
  interval_hours: number | null;
  last_done_on: string | null;
  last_done_km: number | null;
  last_done_hours: number | null;
  notes: string | null;
}

export async function createServicePlan(db: HvemsClient, organisationId: string, input: ServicePlanInput): Promise<void> {
  unwrap(await raw(db).from("service_plans").insert({ ...input, organisation_id: organisationId }));
}

export async function setServicePlanActive(db: HvemsClient, organisationId: string, id: string, active: boolean): Promise<void> {
  unwrap(await raw(db).from("service_plans").update({ active }).eq("id", id).eq("organisation_id", organisationId));
}

const WO_COLUMNS = "*, asset:assets(asset_number, make, model)";

export async function listWorkOrders(db: HvemsClient, organisationId: string, filter: { open?: boolean; assetId?: string; limit?: number } = {}): Promise<WorkOrder[]> {
  let q = raw(db).from("work_orders").select(WO_COLUMNS).eq("organisation_id", organisationId);
  if (filter.open === true) q = q.in("status", ["open", "in_progress", "completed"]);
  if (filter.open === false) q = q.in("status", ["closed", "cancelled"]);
  if (filter.assetId) q = q.eq("asset_id", filter.assetId);
  return unwrap(await q.order("number", { ascending: false }).limit(filter.limit ?? 200)) as WorkOrder[];
}

export async function getWorkOrder(db: HvemsClient, organisationId: string, id: string): Promise<WorkOrder | null> {
  return (unwrap(await raw(db).from("work_orders").select(WO_COLUMNS).eq("organisation_id", organisationId).eq("id", id).maybeSingle()) as WorkOrder | null) ?? null;
}

export interface WorkOrderInput {
  asset_id: string;
  title: string;
  description?: string | null;
  kind: "internal" | "vendor";
  vendor_name?: string | null;
  priority: WorkOrder["priority"];
  assigned_to?: string | null;
  due_on?: string | null;
  service_plan_id?: string | null;
  defect_id?: string | null;
}

export async function createWorkOrder(db: HvemsClient, organisationId: string, w: WorkOrderInput): Promise<{ id: string; number: number }> {
  return unwrap(
    await raw(db).rpc("create_work_order", {
      p_organisation_id: organisationId,
      p_asset_id: w.asset_id,
      p_title: w.title,
      p_description: w.description ?? null,
      p_kind: w.kind,
      p_vendor_name: w.vendor_name ?? null,
      p_priority: w.priority,
      p_assigned_to: w.assigned_to ?? null,
      p_due_on: w.due_on ?? null,
      p_service_plan_id: w.service_plan_id ?? null,
      p_defect_id: w.defect_id ?? null,
    }),
  ) as { id: string; number: number };
}

export type WorkOrderAction = "start" | "complete" | "close" | "reopen" | "cancel";

/** Technicians start and complete; managers close, reopen and cancel (the database checks). */
export async function updateWorkOrderStatus(
  db: HvemsClient,
  id: string,
  action: WorkOrderAction,
  extra: { notes?: string; odometer_km?: number | null; engine_hours?: number | null; labour_hours?: number | null; cost_cents?: number | null } = {},
): Promise<void> {
  unwrap(
    await raw(db).rpc("update_work_order_status", {
      p_id: id,
      p_action: action,
      p_notes: extra.notes ?? null,
      p_odometer_km: extra.odometer_km ?? null,
      p_engine_hours: extra.engine_hours ?? null,
      p_labour_hours: extra.labour_hours ?? null,
      p_cost_cents: extra.cost_cents ?? null,
    }),
  );
}

/** Names for people by user id (co-members only, RLS). Operator accounts have no real email, so it is never shown. */
export async function getPersonNames(db: HvemsClient, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const { data } = await db.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.full_name || (p.email && !p.email.endsWith(".invalid") ? p.email : "Operator"),
    ]),
  );
}

/** Counts for the dashboard's "To do" card. Each is 0 when the person can't see that area (RLS). */
export async function getDashboardTodo(db: HvemsClient, organisationId: string) {
  const count = async (p: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await p;
    return error ? 0 : (n ?? 0);
  };
  const head = { count: "exact" as const, head: true };
  const [pendingReadings, criticalDefects, minorDefects, advisoryDefects, missedPrestarts, overdueServices, dueSoonServices, openWorkOrders, workOrdersToReview] = await Promise.all([
    count(raw(db).from("meter_readings").select("id", head).eq("organisation_id", organisationId).eq("status", "pending_acceptance")),
    count(db.from("defects").select("id", head).eq("organisation_id", organisationId).eq("status", "open").eq("severity", "critical")),
    count(db.from("defects").select("id", head).eq("organisation_id", organisationId).eq("status", "open").eq("severity", "minor")),
    count(db.from("defects").select("id", head).eq("organisation_id", organisationId).eq("status", "open").eq("severity", "advisory")),
    count(db.from("missed_prestarts").select("id", head).eq("organisation_id", organisationId).eq("status", "open")),
    count(raw(db).from("service_schedule").select("id", head).eq("organisation_id", organisationId).eq("status", "overdue")),
    count(raw(db).from("service_schedule").select("id", head).eq("organisation_id", organisationId).eq("status", "due_soon")),
    count(raw(db).from("work_orders").select("id", head).eq("organisation_id", organisationId).in("status", ["open", "in_progress"])),
    count(raw(db).from("work_orders").select("id", head).eq("organisation_id", organisationId).eq("status", "completed")),
  ]);
  return { pendingReadings, criticalDefects, minorDefects, advisoryDefects, missedPrestarts, overdueServices, dueSoonServices, openWorkOrders, workOrdersToReview };
}

// ---------------------------------------------------------------------------
// Workforce (2C, CS-19)
// ---------------------------------------------------------------------------

export interface WorkforceProfile {
  organisation_id: string;
  user_id: string;
  trade: string | null;
  phone: string | null;
  notes: string | null;
  available: boolean;
  updated_at: string;
}
export interface WorkforceQualification {
  id: string;
  organisation_id: string;
  user_id: string;
  kind: QualificationKind;
  label: string | null;
  number: string | null;
  issued_by: string | null;
  expires_on: string | null;
  updated_at: string;
}
export interface WorkforceLeave {
  id: string;
  organisation_id: string;
  user_id: string;
  kind: LeaveKind;
  starts_on: string;
  ends_on: string;
  note: string | null;
  cancelled_at: string | null;
  created_at: string;
}

/** Profiles, qualifications, current and future leave, and open work orders for a company (or one person). */
export async function getWorkforceData(db: HvemsClient, organisationId: string, opts: { userId?: string; today: string; allLeave?: boolean }) {
  let profiles = raw(db).from("workforce_profiles").select("*").eq("organisation_id", organisationId);
  let quals = raw(db).from("workforce_qualifications").select("*").eq("organisation_id", organisationId);
  let leave = raw(db).from("workforce_leave").select("*").eq("organisation_id", organisationId);
  let wos = raw(db).from("work_orders").select("id, number, title, status, due_on, assigned_to, asset:assets(asset_number)").eq("organisation_id", organisationId)
    .in("status", ["open", "in_progress", "completed"]);
  if (opts.userId) {
    profiles = profiles.eq("user_id", opts.userId);
    quals = quals.eq("user_id", opts.userId);
    leave = leave.eq("user_id", opts.userId);
    wos = wos.eq("assigned_to", opts.userId);
  }
  if (!opts.allLeave) leave = leave.is("cancelled_at", null).gte("ends_on", opts.today);
  const [p, q, l, w] = await Promise.all([
    profiles,
    quals.order("expires_on", { ascending: true, nullsFirst: false }),
    leave.order("starts_on", { ascending: !opts.allLeave }).limit(500),
    wos.order("number", { ascending: false }).limit(500),
  ]);
  return {
    profiles: (unwrap(p) ?? []) as WorkforceProfile[],
    qualifications: (unwrap(q) ?? []) as WorkforceQualification[],
    leave: (unwrap(l) ?? []) as WorkforceLeave[],
    workOrders: (unwrap(w) ?? []) as unknown as { id: string; number: number; title: string; status: WorkOrder["status"]; due_on: string | null; assigned_to: string | null; asset: { asset_number: string } | null }[],
  };
}

/** Create or update a person's profile. RLS: workforce.manage. */
export async function saveWorkforceProfile(
  db: HvemsClient,
  organisationId: string,
  userId: string,
  v: { trade: string | null; phone: string | null; notes: string | null; available: boolean },
): Promise<void> {
  // Update first: an upsert would also try to update the key columns, which are not updatable.
  const updated = unwrap(
    await raw(db).from("workforce_profiles").update(v).eq("organisation_id", organisationId).eq("user_id", userId).select("user_id"),
  ) as unknown[] | null;
  if (!updated?.length) unwrap(await raw(db).from("workforce_profiles").insert({ organisation_id: organisationId, user_id: userId, ...v }));
}

export interface QualificationInput {
  kind: QualificationKind;
  label: string | null;
  number: string | null;
  issued_by: string | null;
  expires_on: string | null;
}
export async function saveQualification(db: HvemsClient, input: QualificationInput & { organisationId: string; userId: string; id?: string }): Promise<void> {
  const { organisationId, userId, id, ...values } = input;
  if (id) unwrap(await raw(db).from("workforce_qualifications").update(values).eq("id", id).eq("organisation_id", organisationId));
  else unwrap(await raw(db).from("workforce_qualifications").insert({ ...values, organisation_id: organisationId, user_id: userId }));
}
export async function deleteQualification(db: HvemsClient, organisationId: string, id: string): Promise<void> {
  unwrap(await raw(db).from("workforce_qualifications").delete().eq("id", id).eq("organisation_id", organisationId));
}

export async function addLeave(
  db: HvemsClient,
  organisationId: string,
  userId: string,
  v: { kind: LeaveKind; starts_on: string; ends_on: string; note: string | null },
): Promise<void> {
  unwrap(await raw(db).from("workforce_leave").insert({ organisation_id: organisationId, user_id: userId, ...v }));
}
export async function cancelLeave(db: HvemsClient, id: string): Promise<void> {
  unwrap(await raw(db).rpc("cancel_leave", { p_id: id }));
}

/** What the database would warn about if this person got the work (managers only). */
export async function previewAllocationWarnings(
  db: HvemsClient,
  organisationId: string,
  userId: string,
  dueOn: string | null,
  required: string | null,
): Promise<AllocationWarning[]> {
  return (unwrap(
    await raw(db).rpc("allocation_warnings", { p_organisation_id: organisationId, p_user_id: userId, p_due_on: dueOn, p_required: required }),
  ) ?? []) as AllocationWarning[];
}

/** Set the qualification a work order needs; returns the recorded warnings. */
export async function setWorkOrderRequirement(db: HvemsClient, id: string, required: string | null): Promise<AllocationWarning[]> {
  return (unwrap(await raw(db).rpc("set_work_order_requirement", { p_id: id, p_required: required })) ?? []) as AllocationWarning[];
}

// ---------------------------------------------------------------------------
// Technician workspace: my jobs, pre/post reports, documents, next service due
// ---------------------------------------------------------------------------
export interface WorkOrderReport {
  id: string;
  work_order_id: string;
  kind: "pre" | "post";
  checks: Record<string, "ok" | "issue" | "na">;
  notes: string;
  photo_paths: string[];
  odometer_km: number | null;
  engine_hours: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderFile {
  id: string;
  work_order_id: string;
  kind: "invoice" | "receipt" | "quote" | "photo" | "other";
  path: string;
  file_name: string;
  supplier: string | null;
  reference: string | null;
  amount_cents: number | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface ServiceDueChange {
  id: string;
  service_plan_id: string;
  work_order_id: string | null;
  next_due_on: string | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  set_by: string | null;
  set_at: string;
}

/** Jobs assigned to one person (RLS: work_orders.work / manage). */
export async function listMyJobs(db: HvemsClient, organisationId: string, userId: string, limit = 200): Promise<WorkOrder[]> {
  return unwrap(
    await raw(db).from("work_orders").select(WO_COLUMNS).eq("organisation_id", organisationId).eq("assigned_to", userId).order("number", { ascending: false }).limit(limit),
  ) as WorkOrder[];
}

/** Open jobs nobody has taken yet (a technician starting one takes it). */
export async function listUnassignedJobs(db: HvemsClient, organisationId: string, limit = 50): Promise<WorkOrder[]> {
  return unwrap(
    await raw(db)
      .from("work_orders")
      .select(WO_COLUMNS)
      .eq("organisation_id", organisationId)
      .is("assigned_to", null)
      .eq("kind", "internal")
      .eq("status", "open")
      .order("number", { ascending: false })
      .limit(limit),
  ) as WorkOrder[];
}

export async function listWorkOrderReports(db: HvemsClient, workOrderId: string): Promise<WorkOrderReport[]> {
  return unwrap(await raw(db).from("work_order_reports").select("*").eq("work_order_id", workOrderId)) as WorkOrderReport[];
}

/** Reports for several jobs at once (for list badges). */
export async function listReportKinds(db: HvemsClient, workOrderIds: string[]): Promise<Map<string, Set<"pre" | "post">>> {
  const out = new Map<string, Set<"pre" | "post">>();
  if (!workOrderIds.length) return out;
  const rows = unwrap(await raw(db).from("work_order_reports").select("work_order_id, kind").in("work_order_id", workOrderIds)) as { work_order_id: string; kind: "pre" | "post" }[];
  for (const r of rows) out.set(r.work_order_id, (out.get(r.work_order_id) ?? new Set()).add(r.kind));
  return out;
}

export async function listWorkOrderFiles(db: HvemsClient, workOrderId: string): Promise<WorkOrderFile[]> {
  return unwrap(
    await raw(db).from("work_order_files").select("*").eq("work_order_id", workOrderId).is("removed_at", null).order("uploaded_at", { ascending: false }),
  ) as WorkOrderFile[];
}

export async function getServicePlanRow(db: HvemsClient, planId: string): Promise<ServiceScheduleRow | null> {
  return (unwrap(await raw(db).from("service_schedule").select("*").eq("id", planId).maybeSingle()) as ServiceScheduleRow | null) ?? null;
}

export async function listServiceDueHistory(db: HvemsClient, planId: string, limit = 10): Promise<ServiceDueChange[]> {
  return unwrap(
    await raw(db).from("service_plan_due_history").select("*").eq("service_plan_id", planId).order("set_at", { ascending: false }).limit(limit),
  ) as ServiceDueChange[];
}

export async function submitWorkOrderReport(
  db: HvemsClient,
  input: {
    workOrderId: string;
    kind: "pre" | "post";
    notes: string;
    checks?: Record<string, string>;
    photos?: string[];
    odometerKm?: number | null;
    engineHours?: number | null;
    nextDueOn?: string | null;
    nextDueKm?: number | null;
    nextDueHours?: number | null;
  },
): Promise<string> {
  return unwrap(
    await raw(db).rpc("submit_work_order_report", {
      p_work_order_id: input.workOrderId,
      p_kind: input.kind,
      p_notes: input.notes,
      p_checks: input.checks ?? {},
      p_photos: input.photos ?? [],
      p_odometer_km: input.odometerKm ?? null,
      p_engine_hours: input.engineHours ?? null,
      p_next_due_on: input.nextDueOn ?? null,
      p_next_due_km: input.nextDueKm ?? null,
      p_next_due_hours: input.nextDueHours ?? null,
    }),
  ) as string;
}

export async function addWorkOrderFile(
  db: HvemsClient,
  input: { workOrderId: string; kind: WorkOrderFile["kind"]; path: string; fileName: string; supplier?: string | null; reference?: string | null; amountCents?: number | null },
): Promise<string> {
  return unwrap(
    await raw(db).rpc("add_work_order_file", {
      p_work_order_id: input.workOrderId,
      p_kind: input.kind,
      p_path: input.path,
      p_file_name: input.fileName,
      p_supplier: input.supplier ?? null,
      p_reference: input.reference ?? null,
      p_amount_cents: input.amountCents ?? null,
    }),
  ) as string;
}

export async function removeWorkOrderFile(db: HvemsClient, fileId: string): Promise<void> {
  unwrap(await raw(db).rpc("remove_work_order_file", { p_file_id: fileId }));
}

// ---------------------------------------------------------------------------
// Readings awaiting a manager (lower than the last, or out of sequence)
// ---------------------------------------------------------------------------
export interface PendingReading {
  id: string;
  asset_id: string;
  unit: "km" | "hours";
  value: number;
  read_at: string;
  recorded_by: string | null;
  lower_reading_reason: string | null;
  out_of_sequence: boolean;
  created_at: string;
  asset: { asset_number: string; make: string | null; model: string | null; current_odometer_km: number | null; current_engine_hours: number | null } | null;
}

export async function listPendingReadings(db: HvemsClient, organisationId: string, assetId?: string): Promise<PendingReading[]> {
  let q = raw(db)
    .from("meter_readings")
    .select("id, asset_id, unit, value, read_at, recorded_by, lower_reading_reason, out_of_sequence, created_at, asset:assets(asset_number, make, model, current_odometer_km, current_engine_hours)")
    .eq("organisation_id", organisationId)
    .eq("status", "pending_acceptance");
  if (assetId) q = q.eq("asset_id", assetId);
  return unwrap(await q.order("created_at", { ascending: true }).limit(200)) as unknown as PendingReading[];
}

export async function countPendingReadings(db: HvemsClient, organisationId: string): Promise<number> {
  const { count, error } = await raw(db).from("meter_readings").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("status", "pending_acceptance");
  return error ? 0 : (count ?? 0);
}

export async function decideMeterReading(db: HvemsClient, readingId: string, accept: boolean, note?: string | null): Promise<void> {
  unwrap(await db.rpc("decide_meter_reading", { p_reading_id: readingId, p_accept: accept, p_note: note ?? undefined }));
}
