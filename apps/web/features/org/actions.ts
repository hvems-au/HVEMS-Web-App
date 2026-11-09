"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, revokeInvitation } from "@hvems/api-client";
import { GRANT_LABELS, MEMBER_GRANTS, type MemberGrant, type MemberRole } from "@hvems/permissions";
import { createOrganisationSchema, inviteMemberSchema, z } from "@hvems/validation";
import { errorState, fieldErrorsFrom, type ActionState } from "@/lib/actions";
import { currentOrigin } from "@/lib/current-portal";
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
  if (!base.success) return { status: "error", code: "invalid", message: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(base.error) };
  try {
    const db = await createSupabaseServerClient();
    const patch: Record<string, unknown> = {
      name: base.data.name,
      abn: base.data.abn || null,
      legal_name: String(form.get("legal_name") ?? "").trim() || null,
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
