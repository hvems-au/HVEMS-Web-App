import type { Metadata } from "next";
import { formatDateTimeAU } from "@hvems/domain";
import { PageHeader } from "@/components/shell/page";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { RemoveReviewButton } from "@/features/marketplace/case-decision";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };

/** Messages where contact details were hidden before an engagement (MKT-08), and reviews (MKT-17). */
export default async function ModerationPage() {
  const db = await createSupabaseServerClient();
  const [flags, reviews] = await Promise.all([
    db
      .from("marketplace_message_flags")
      .select("message_id, original_body, message:marketplace_messages(body, from_provider, created_at, job:marketplace_jobs(title, number))")
      .order("message_id")
      .limit(200),
    db.from("engagement_reviews").select("engagement_id, rating, comment, reply, created_at, removed_at, removed_reason, provider:organisations(name)").order("created_at", { ascending: false }).limit(200),
  ]);
  type Flag = { message_id: string; original_body: string; message: { body: string; from_provider: boolean; created_at: string; job: { title: string; number: number } | null } | null };
  type Review = { engagement_id: string; rating: number; comment: string | null; reply: string | null; created_at: string; removed_at: string | null; removed_reason: string | null; provider: { name: string } | null };
  const flagRows = ((flags.data ?? []) as unknown as Flag[]).sort((a, b) => (b.message?.created_at ?? "").localeCompare(a.message?.created_at ?? ""));
  const reviewRows = (reviews.data ?? []) as unknown as Review[];

  return (
    <>
      <PageHeader title="Moderation" description="Contact details hidden in pre-engagement messages, and reviews that may breach the guidelines." />
      <Card className="mb-5">
        <CardHeader title={`Hidden contact details (${flagRows.length})`} description="What was written, and what the other party saw" />
        <CardBody className="pt-0">
          {flagRows.length === 0 ? (
            <p className="text-[14px] text-ink-muted">Nothing flagged.</p>
          ) : (
            <ul className="divide-y divide-stroke text-[14px]">
              {flagRows.map((f) => (
                <li key={f.message_id} className="py-3">
                  <p className="text-[12.5px] text-ink-subtle">
                    {f.message?.from_provider ? "Provider" : "Customer"} · job {f.message?.job?.number} {f.message?.job?.title} ·{" "}
                    {f.message?.created_at ? formatDateTimeAU(new Date(f.message.created_at)) : ""}
                  </p>
                  <p className="mt-1">{f.original_body}</p>
                  <p className="mt-1 text-ink-muted">Shown as: {f.message?.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Reviews" description="Removed reviews stay here for audit" />
        <CardBody className="pt-0">
          {reviewRows.length === 0 ? (
            <p className="text-[14px] text-ink-muted">No reviews yet.</p>
          ) : (
            <ul className="divide-y divide-stroke text-[14px]">
              {reviewRows.map((r) => (
                <li key={r.engagement_id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <span>
                    <span className="font-medium">{r.provider?.name}</span> · {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)} · {formatDateTimeAU(new Date(r.created_at))}
                    {r.comment ? <span className="block">{r.comment}</span> : null}
                    {r.reply ? <span className="block text-ink-muted">Reply: {r.reply}</span> : null}
                    {r.removed_at ? <span className="block text-danger-ink">Removed: {r.removed_reason}</span> : null}
                  </span>
                  {r.removed_at ? <Badge tone="grey">Removed</Badge> : <RemoveReviewButton engagementId={r.engagement_id} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
