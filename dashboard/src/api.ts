export type Status =
  "waiting" | "in_progress" | "awaiting_signoff" | "decided" | "for_handler";
export type Decision = "approve" | "decline" | "refer";

export interface ClaimSummary {
  claim_id: string;
  customer_name: string;
  claim_type: string;
  submitted_on: string;
  amount_claimed: number;
  status: Status;
  decision: Decision | null;
  payout: number | null;
  paid_amount: number | null;
}

export interface Claim {
  claim_id: string;
  policy_id: string;
  customer_id: string;
  claim_type: string;
  submitted_on: string;
  incident_date: string;
  incident_location: string;
  summary: string;
  story: string;
  items: { description: string; category: string; amount: number }[];
  amount_claimed: number;
  documents: { name: string; type: string; content: string }[];
  status: Status;
  failures: number;
  decision: Decision | null;
  payout: number | null;
  reason: string | null;
  policy_section: string | null;
  decided_at: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  paid_amount: number | null;
  paid_at: string | null;
}

export interface Policy {
  policy_id: string;
  plan: string;
  add_ons: string[];
  purchased_on: string;
  trip: {
    destination: string;
    departs_on: string;
    returns_on: string;
    trip_cost: number;
  };
  travelers: string[];
}

export interface Step {
  text: string;
  created_at: string;
}

export type TodoStatus = "to_do" | "in_progress" | "done" | "for_handler";

export interface Todo {
  content: string;
  status: TodoStatus;
}

export type RunStatus = "running" | "finished" | "stopped";

export interface Run {
  run_id: number;
  cap: number;
  status: RunStatus;
  todos: Todo[];
  summary: string | null;
  started_at: string;
  finished_at: string | null;
  claims: string[];
}

export interface Instructions {
  name: string;
  title: string;
  text: string;
}

export interface Handler {
  handler_id: string;
  name: string;
  role: string;
}

async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(
    path,
    body && {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const { detail } = (await response.json()) as { detail: string };
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export const api = {
  listClaims: () => request<ClaimSummary[]>("/api/claims"),
  getClaim: (claimId: string) => request<Claim>(`/api/claims/${claimId}`),
  getPolicy: (policyId: string) => request<Policy>(`/api/policies/${policyId}`),
  listSteps: (claimId: string) =>
    request<Step[]>(`/api/claims/${claimId}/steps`),
  listHandlers: () => request<Handler[]>("/api/handlers"),
  getInstructions: () => request<Instructions[]>("/api/instructions"),
  getCurrentRun: () => request<Run | null>("/api/runs/current"),
  workQueue: (cap: number) => request<Run>("/api/queue/work", { cap }),
  signOff: (claimId: string, handlerId: string) =>
    request<Claim>(`/api/claims/${claimId}/sign-off`, {
      handler_id: handlerId,
    }),
};
