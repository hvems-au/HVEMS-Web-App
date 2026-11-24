import { fullExportResponse } from "@/features/reports/full-export-route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return fullExportResponse((await params).orgId);
}
