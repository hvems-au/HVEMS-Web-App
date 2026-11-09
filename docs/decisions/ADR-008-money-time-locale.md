# ADR-008 — Money, time and locale

**Status:** Accepted (implements D-01, D-03, decision #13, SoW §12.1) · **Date:** 2026-11-09

- **Money:** integer AUD cents everywhere (DB `integer/bigint`, TS `number` checked as integers). Prices are GST-inclusive final prices; GST is shown as one-eleventh only once `gst.registered` is switched on (settings, not code).
- **Business calendar:** Australia/Brisbane (fixed UTC+10, no daylight saving). Billing months, the waiver reset at 00:00 on the 1st and the 14-day qualification use it (`@hvems/domain/calendar`).
- **Site time:** each site has its own IANA timezone for due dates and inspection days.
- **Locale:** Australian English, `dd/mm/yyyy`, metric units, `en-AU` number formatting.
- **Timestamps:** stored as `timestamptz` (UTC); converted only for display.
