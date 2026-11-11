import type { WorkOrder } from "@hvems/api-client";
import { Badge } from "@/components/ui/primitives";

const STATUS: Record<WorkOrder["status"], { tone: "blue" | "amber" | "green" | "grey" | "orange"; text: string }> = {
  open: { tone: "blue", text: "Open" },
  in_progress: { tone: "orange", text: "In progress" },
  completed: { tone: "amber", text: "To review" },
  closed: { tone: "green", text: "Closed" },
  cancelled: { tone: "grey", text: "Cancelled" },
};
const PRIORITY: Record<WorkOrder["priority"], { tone: "grey" | "blue" | "amber" | "red"; text: string }> = {
  low: { tone: "grey", text: "Low" },
  normal: { tone: "blue", text: "Normal" },
  high: { tone: "amber", text: "High" },
  urgent: { tone: "red", text: "Urgent" },
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrder["status"] }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].text}</Badge>;
}
export function PriorityBadge({ priority }: { priority: WorkOrder["priority"] }) {
  return <Badge tone={PRIORITY[priority].tone}>{PRIORITY[priority].text}</Badge>;
}
