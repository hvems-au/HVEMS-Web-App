"use client";
import { SignInLock } from "@/components/sign-in-lock";
import { unlockMemberSignInAction } from "./actions";

export function MemberSignInLock(props: { portal: string; orgId: string; membershipId: string; name: string; failedCount: number; lockedUntilText: string | null }) {
  const { portal, orgId, membershipId, ...rest } = props;
  return <SignInLock {...rest} unlock={() => unlockMemberSignInAction(portal, orgId, membershipId)} />;
}
