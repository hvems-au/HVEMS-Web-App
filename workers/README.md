# workers/

Reserved for durable background processing that doesn't fit Supabase Edge Functions or `pg_cron` (for example large report exports or nightly off-site backups to an HVEMS-owned S3 bucket, ADR-002). Nothing here yet. Scheduled database work (alert escalation, waiver issue on the 1st, authorisation sweeps) will use `pg_cron` + queue tables from increment 2B.
