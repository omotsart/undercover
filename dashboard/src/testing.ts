import { vi } from "vitest";
import type { ClaimSummary } from "./api";

class Failure {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {}
}

export function failure(status: number, detail: string) {
  return new Failure(status, detail);
}

export function stubApi(routes: Record<string, unknown>) {
  const fetch = vi.fn((path: string, init?: RequestInit) => {
    const route =
      routes[`${init?.method ?? "GET"} ${path}`] ??
      failure(404, `${path} not found`);
    return Promise.resolve(
      route instanceof Failure
        ? new Response(JSON.stringify({ detail: route.detail }), {
            status: route.status,
          })
        : new Response(JSON.stringify(route)),
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

export function summary(overrides: Partial<ClaimSummary>): ClaimSummary {
  return {
    claim_id: "CLM-1001",
    customer_name: "Maya Patel",
    claim_type: "trip_delay",
    submitted_on: "2026-06-24",
    amount_claimed: 420,
    status: "waiting",
    decision: null,
    payout: null,
    paid_amount: null,
    ...overrides,
  };
}
