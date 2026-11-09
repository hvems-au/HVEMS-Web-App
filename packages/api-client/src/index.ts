/**
 * HVEMS API client — the typed contract over Supabase (tables under RLS +
 * RPC functions) shared by the Next.js web app and the future React Native
 * app. Every function takes a Supabase client authenticated as the end user,
 * so the database enforces permissions; nothing here relies on Next.js.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type {
  Asset,
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
import type { AssetCondition } from "@hvems/domain";
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

export async function createOrganisation(db: HvemsClient, input: { kind: OrganisationKind; name: string; abn?: string }): Promise<string> {
  return unwrap(await db.rpc("create_organisation", { p_kind: input.kind, p_name: input.name, p_abn: input.abn || null }));
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
export async function listAssetClasses(db: HvemsClient): Promise<AssetClass[]> {
  return unwrap(await db.from("asset_classes").select("*").eq("active", true).order("sort_order"));
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
  input: { reason: string; effective_date: string; disposal: "retired" | "sold" | "other"; open_issues_acknowledged: boolean },
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

export async function listSites(db: HvemsClient, organisationId: string): Promise<Site[]> {
  return unwrap(await db.from("sites").select("*").eq("organisation_id", organisationId).is("archived_at", null).order("name"));
}

export async function createSite(db: HvemsClient, organisationId: string, v: SiteFormValues): Promise<Site> {
  return unwrap(await db.from("sites").insert({ organisation_id: organisationId, ...v }).select("*").single());
}

// ------------------------------------------------------------- audit & settings
export async function listAuditEvents(
  db: HvemsClient,
  q: { organisationId: string; entityType?: string; entityId?: string; limit?: number },
): Promise<AuditEvent[]> {
  let query = db
    .from("audit_events")
    .select("id, occurred_at, organisation_id, actor_user_id, actor_method, action, entity_type, entity_id, changes")
    .eq("organisation_id", q.organisationId);
  if (q.entityType) query = query.eq("entity_type", q.entityType);
  if (q.entityId) query = query.eq("entity_id", q.entityId);
  return unwrap(await query.order("occurred_at", { ascending: false }).limit(Math.min(q.limit ?? 100, 500)));
}

export async function listPlatformSettings(db: HvemsClient): Promise<PlatformSetting[]> {
  return unwrap(await db.from("platform_settings").select("key, value, description, status, sow_reference").order("key"));
}
