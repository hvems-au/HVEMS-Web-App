/** Client-safe mirror of ActionState (lib/actions.ts is server-only). */
export type ClientActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; code: string; message: string; fieldErrors?: Record<string, string> };

export const idleState: ClientActionState = { status: "idle" };
