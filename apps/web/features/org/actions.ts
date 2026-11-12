"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, ownerEndSupportAccess, resetMemberMfa, revokeInvitation, rotateSupportPin, setOrganisationLogo, unlockMemberSignIn } from "@hvems/api-client";
import { GRANT_LABELS, MEMBER_GRANTS, type MemberGrant, type MemberRole } from "@hvems/permissions";
import { createOrganisationSchema, inviteMemberSchema, organisationContactSchema, z } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { currentOrigin } from "@/lib/current-portal";
import { removeAllMfaFactors } from "@/lib/mfa-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function teamPath(portal: string, orgId: string) {
  return `/${portal}/${orgId}/team`;
}

export async function inviteMemberAction(portal: string, orgId: string, _prev: ActionState<{ link: string }>, form: FormData): Promise<ActionState<{ link: string }>> {
  const parsed = inviteMemberSchema.safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    const inv = await createInvitation(db, { organisationId: orgId, email: parsed.data.email, role: parsed.data.role as MemberRole });
    revalidatePath(teamPath(portal, orgId));
    return {
      status: "success",
      message: `Invitation created for ${parsed.data.email}.`,
      // Invitations are accepted in the portal that serves this organisation.
      data: { link: `${await currentOrigin()}/invite/${inv.token}` },
    };
  } catch (e) {
    return errorState(e);
  }
}

export async function revokeInvitationAction(portal: string, orgId: string, invitationId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await revokeInvitation(db, invitationId);
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "Invitation revoked" };
  } catch (e) {
    return errorState(e);
  }
}

export async function changeRoleAction(portal: string, orgId: string, membershipId: string, role: MemberRole): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("update_member_role", { p_membership_id: membershipId, p_role: role });
    if (error) throw error;
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "Role updated" };
  } catch (e) {
    return errorState(e);
  }
}

/** A member's additional roles (permissions are the union of all their roles). */
export async function setAdditionalRolesAction(portal: string, orgId: string, membershipId: string, roles: MemberRole[]): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("set_member_additional_roles", { p_membership_id: membershipId, p_roles: roles });
    if (error) throw error;
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: roles.length ? "Roles updated" : "Additional roles removed" };
  } catch (e) {
    return errorState(e);
  }
}

export async function removeMemberAction(portal: string, orgId: string, membershipId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("remove_member", { p_membership_id: membershipId, p_reason: null });
    if (error) throw error;
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "Member removed" };
  } catch (e) {
    return errorState(e);
  }
}

const grantSchema = z
  .object({
    grant: z.enum(MEMBER_GRANTS),
    approval_limit: z.string().optional(),
    competency_note: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.grant === "approval_limit" && !(Number(v.approval_limit) > 0)) {
      ctx.addIssue({ code: "custom", path: ["approval_limit"], message: "Enter an approval limit in dollars" });
    }
    if (v.grant === "clearance_authority" && (v.competency_note ?? "").length < 3) {
      ctx.addIssue({ code: "custom", path: ["competency_note"], message: "Record the person's training, qualification or experience" });
    }
  });

export async function assignGrantAction(portal: string, orgId: string, membershipId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = grantSchema.safeParse({
    grant: form.get("grant"),
    approval_limit: form.get("approval_limit") ?? undefined,
    competency_note: form.get("competency_note") ?? undefined,
  });
  if (!parsed.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("assign_grant", {
      p_membership_id: membershipId,
      p_grant: parsed.data.grant as MemberGrant,
      p_approval_limit_cents: parsed.data.grant === "approval_limit" ? Math.round(Number(parsed.data.approval_limit) * 100) : null,
      p_competency_note: parsed.data.competency_note ?? null,
    });
    if (error) throw error;
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: `${GRANT_LABELS[parsed.data.grant]} assigned` };
  } catch (e) {
    return errorState(e);
  }
}

export async function revokeGrantAction(portal: string, orgId: string, grantId: string, reason: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.rpc("revoke_grant", { p_grant_id: grantId, p_reason: reason });
    if (error) throw error;
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "Grant revoked" };
  } catch (e) {
    return errorState(e);
  }
}

export async function updateOrganisationAction(portal: string, orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const base = createOrganisationSchema.safeParse({ kind: form.get("kind"), name: form.get("name"), abn: form.get("abn") ?? "" });
  const contact = organisationContactSchema.safeParse({
    timezone: form.get("timezone"),
    contact_name: form.get("contact_name") ?? "",
    contact_email: form.get("contact_email") ?? "",
    contact_phone: form.get("contact_phone") ?? "",
  });
  if (!base.success || !contact.success) {
    return {
      status: "error",
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: { ...(base.success ? {} : fieldErrorsFrom(base.error)), ...(contact.success ? {} : fieldErrorsFrom(contact.error)) },
    };
  }
  try {
    const db = await createSupabaseServerClient();
    // Cleared contact fields are stored as empty (null).
    const patch: Record<string, unknown> = {
      name: base.data.name,
      abn: base.data.abn || null,
      legal_name: String(form.get("legal_name") ?? "").trim() || null,
      timezone: contact.data.timezone,
      contact_name: contact.data.contact_name ?? null,
      contact_email: contact.data.contact_email ?? null,
      contact_phone: contact.data.contact_phone ?? null,
    };
    if (form.get("kind") === "company") {
      patch.settings = {
        overdue_service_sets_needs_attention: form.get("overdue_service_sets_needs_attention") === "on",
        repairer_cannot_clear_own_critical: form.get("repairer_cannot_clear_own_critical") === "on",
      };
    }
    const { data, error } = await db.from("organisations").update(patch).eq("id", orgId).select("id");
    if (error) throw error;
    if (!data?.length) return { status: "error", code: "forbidden", message: "You don't have permission to change these settings." };
    revalidatePath(`/${portal}/${orgId}`, "layout");
    return { status: "success", message: "Settings saved" };
  } catch (e) {
    return errorState(e);
  }
}

/** Save (or clear) the company logo after the browser has uploaded it to the organisation's folder. */
export async function setOrganisationLogoAction(portal: string, orgId: string, path: string | null): Promise<ActionState> {
  const validOrg = z.string().uuid().safeParse(orgId).success;
  const validPath = path === null || new RegExp("^" + orgId + "/logo-[A-Za-z0-9-]{1,64}\\.(png|jpg)$").test(path);
  if (!validOrg || !validPath) return { status: "error", code: "invalid", message: "That logo upload isn't valid. Try again." };
  try {
    const db = await createSupabaseServerClient();
    await setOrganisationLogo(db, orgId, path);
    revalidatePath(`/${portal}/${orgId}`, "layout");
    return { status: "success", message: path ? "Logo saved" : "Logo removed" };
  } catch (e) {
    return errorState(e);
  }
}

/**
 * Owner or Company Admin resets a member's MFA (lost phone, no recovery codes).
 * The database decides (capability, own MFA, not the Owner, reason) and records
 * it; only then are the member's authenticators removed.
 */
export async function resetMemberMfaAction(portal: string, orgId: string, membershipId: string, reason: string): Promise<ActionState> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { status: "error", code: "reason_required", message: "Give a reason for the reset." };
  try {
    const db = await createSupabaseServerClient();
    const userId = await resetMemberMfa(db, membershipId, trimmed.slice(0, 500));
    await removeAllMfaFactors(userId);
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "MFA reset. They'll set up their authenticator app at their next sign-in." };
  } catch (e) {
    return errorState(e);
  }
}

/** Owner or Company Admin clears a member's wrong passwords or sign-in lock (O-11). */
export async function unlockMemberSignInAction(portal: string, orgId: string, membershipId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await unlockMemberSignIn(db, membershipId);
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "Sign-in unlocked. They can sign in again now." };
  } catch (e) {
    return errorState(e);
  }
}

/** The Owner ends an HVEMS support session (ADM-07). */
export async function ownerEndSupportAccessAction(portal: string, orgId: string, grantId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await ownerEndSupportAccess(db, grantId);
    revalidatePath(teamPath(portal, orgId));
    return { status: "success", message: "HVEMS support access ended" };
  } catch (e) {
    return errorState(e);
  }
}

/** Owner / Company Admin: replace the support PIN now (old PIN stops working). */
export async function rotateSupportPinAction(portal: string, orgId: string): Promise<ActionState> {
  try {
    const db = await createSupabaseServerClient();
    await rotateSupportPin(db, orgId);
    revalidatePath(`/${portal}/${orgId}/settings`);
    return { status: "success", message: "New support PIN created. The old one no longer works." };
  } catch (e) {
    return errorState(e);
  }
}
