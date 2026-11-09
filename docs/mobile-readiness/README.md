# Mobile readiness (Stage 3: React Native + Expo)

The Android and iOS apps will be one Expo codebase on the **same Supabase project**. No second database and no backend rebuild.

## Already in place
| Need | How it is met |
|---|---|
| Shared API contract | `@hvems/api-client` takes any `SupabaseClient`; the Expo app passes one created with `expo-secure-store` session storage |
| Shared types and validation | `@hvems/types`, `@hvems/validation` (Zod) and `@hvems/domain` are plain TypeScript with no DOM or Next.js imports |
| Shared permissions | `@hvems/permissions` mirrors the DB matrix; `my_capabilities(org)` drives the UI |
| Business rules server-side | Postgres RPCs and triggers (ADR-004); the app never needs Next.js Server Actions |
| Stable record ids | Every table uses UUIDs, and clients may supply the id on insert (e.g. `createAsset(…, id)`), so offline drafts keep their id after sync |
| Idempotent submissions | `client_request_id` + unique index on submission tables (`meter_readings` today; inspections, defect reports, work notes, labour, completion drafts in 2B/2C). A retried sync returns the original record |
| Conflict flags, not overwrites | Out-of-sequence readings are kept and flagged; later: older template versions flagged, reassigned work keeps notes |
| Passing inspections never clear Critical defects | Guaranteed by the condition engine regardless of submission time (ADR-005) |
| Identification method | `identification_method` recorded on submissions; driver PIN on a shared depot device sets `driver_pin` (2B) |
| Design tokens | `@hvems/ui` tokens are platform-neutral |
| Online-only actions | Clearance, approvals, payments, marketplace actions and administration are RPCs that require a live session; the app disables them offline |

## To add in later increments
- **Sync design:** an Expo SQLite outbox of pending RPC calls with `client_request_id`, ordered with Critical faults first (SoW §7.2), photos uploaded separately to Storage with resumable uploads, and per-record status "Not sent / Sending / Sent / Needs attention".
- **Download sets:** RPCs returning a device's assigned work, permitted assets, current template versions and open defects, with `updated_since` cursors.
- **Push:** `device_tokens` table + notification outbox → Expo push (Stage 3).
- **Device security:** SQLite encrypted at rest (SQLCipher), secure store for tokens, sign-out warns about unsent records, access removal applied on next connect.
- **Depot mode:** Driver ID + PIN identification RPC that returns a short-lived, scope-limited token for submissions only (2B design).
