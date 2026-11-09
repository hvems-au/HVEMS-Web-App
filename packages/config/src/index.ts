/**
 * Environment validation. Public values may reach the browser; server values
 * must never be read in client components.
 */
import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  /** HVEMS's helpdesk contact form or support mailto (SoW §11.2, Figma F-08). Unset hides the link. */
  NEXT_PUBLIC_SUPPORT_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
});

const serverSchema = z.object({
  ADMIN_HOST: z.string().min(1).default("admin.localhost:3000"),
  SUPABASE_SECRET_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export function readPublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const parsed = publicSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Missing or invalid public environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

export function readServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverSchema.parse(source);
}

export const SUPABASE_PROJECT_REF = "anvqykllajezwaasguqp";
