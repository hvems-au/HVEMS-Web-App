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
  SecurityEvent,
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
import type { AssetCondition, MeterType } from "@hvems/domain";
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
    return new AppError(pg.hint, pg.message, details);
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
      .select("id, organisation_id, user_id, role, status, created_at, profile:profiles!inner(full_name, email), grants:membership_grants(id, membership_id, grant_type, approval_limit_cents, competency_note, assigned_at, revoked_at)")
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
  filter: { organisationId: string; assetId?: string; limit?: number },
): Promise<InspectionListItem[]> {
  let q = db
    .from("inspections")
    .select("*, asset:assets(asset_number, make, model)")
    .eq("organisation_id", filter.organisationId)
    .order("submitted_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.assetId) q = q.eq("asset_id", filter.assetId);
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

/** Driver ID as shown to people: D-0001. */
export function formatDriverId(n: number): string {
  return `D-${String(n).padStart(4, "0")}`;
}

/** Accepts "D-0001", "d1", "0001" or "1". */
export function parseDriverId(value: string): number | null {
  const m = value.trim().match(/^d?-?0*(\d{1,6})$/i);
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
