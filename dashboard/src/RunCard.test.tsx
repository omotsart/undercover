import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RunCard } from "./RunCard";
import { run, stubApi, summary } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CLAIMS = [
  summary({
    claim_id: "CLM-1001",
    status: "decided",
    decision: "approve",
    payout: 420,
    paid_amount: 420,
  }),
  summary({
    claim_id: "CLM-1002",
    claim_type: "baggage",
    amount_claimed: 1150,
    status: "awaiting_signoff",
    decision: "approve",
    payout: 1100,
  }),
  summary({
    claim_id: "CLM-1003",
    status: "decided",
    decision: "decline",
    payout: 0,
  }),
  summary({
    claim_id: "CLM-1004",
    status: "decided",
    decision: "refer",
    payout: 0,
  }),
  summary({ claim_id: "CLM-1005", status: "for_handler" }),
  summary({ claim_id: "CLM-1006", status: "waiting" }),
  summary({ claim_id: "CLM-1007", status: "in_progress" }),
  summary({ claim_id: "CLM-1008", status: "in_progress" }),
  summary({
    claim_id: "CLM-1009",
    status: "decided",
    decision: "approve",
    payout: 90,
  }),
];

function rows() {
  const list = screen.getByRole("list", { name: "Claims in this run" });
  return within(list).getAllByRole("listitem");
}

it("lists the run's claims in order with their outcomes", () => {
  render(
    <RunCard
      claims={CLAIMS}
      run={run({
        status: "finished",
        cap: 6,
        claims: [
          "CLM-1003",
          "CLM-1001",
          "CLM-1002",
          "CLM-1004",
          "CLM-1005",
          "CLM-1006",
          "CLM-1009",
        ],
      })}
    />,
  );
  expect(rows().map((row) => row.textContent)).toEqual([
    "✕CLM-1003Trip delay$420.00Declined›",
    "✓CLM-1001Trip delay$420.00Paid · $420.00›",
    "$CLM-1002Baggage$1,150.00Waiting for sign-off · $1,100.00›",
    "→CLM-1004Trip delay$420.00Referred›",
    "!CLM-1005Trip delay$420.00Left for a handler›",
    "↺CLM-1006Trip delay$420.00Back in the queue›",
    "✓CLM-1009Trip delay$420.00Approved · $90.00›",
  ]);
  expect(
    rows().map((row) => within(row).getByRole("link").getAttribute("href")),
  ).toEqual([
    "/claims/CLM-1003",
    "/claims/CLM-1001",
    "/claims/CLM-1002",
    "/claims/CLM-1004",
    "/claims/CLM-1005",
    "/claims/CLM-1006",
    "/claims/CLM-1009",
  ]);
  expect(screen.getByText("7 of 6 claims")).toBeDefined();
  expect(screen.queryByText("Queued")).toBeNull();
});

it("sums up a finished run", () => {
  render(
    <RunCard
      claims={CLAIMS}
      run={run({
        status: "finished",
        claims: ["CLM-1001", "CLM-1002", "CLM-1003", "CLM-1006"],
        summary: "Four claims worked.",
        todos: [
          { content: "Work CLM-1001", status: "done" },
          { content: "Work CLM-1006", status: "to_do" },
        ],
      })}
    />,
  );
  const metrics = [...document.querySelectorAll(".run-metric")].map(
    (metric) => metric.textContent,
  );
  expect(metrics).toEqual([
    "Paid1$420.00",
    "Waiting for sign-off1$1,100.00",
    "Declined1",
    "Back in the queue1",
  ]);
  expect(screen.getByText("Run summary").closest("details")?.open).toBe(false);
  expect(screen.getByText("Four claims worked.")).toBeDefined();
  const plan = screen.getByText("The agent's plan").closest("details");
  expect(plan?.textContent).toBe(
    "The agent's planDoneWork CLM-1001To doWork CLM-1006",
  );
});

it("shows the claim in work live, with its last step, and the queued plan", async () => {
  const fetch = stubApi({
    "GET /api/claims/CLM-1007/steps": [
      { text: "Reading the claim", created_at: "2026-10-26T18:40:00+00:00" },
      {
        text: "Read the claims manual, 9. Repeat claims",
        created_at: "2026-10-26T18:40:05+00:00",
      },
    ],
  });
  render(
    <RunCard
      claims={CLAIMS}
      run={run({
        cap: 5,
        claims: ["CLM-1001", "CLM-1007", "CLM-1008"],
        todos: [
          { content: "Work CLM-1001", status: "done" },
          { content: "Work CLM-1007", status: "in_progress" },
          { content: "Work CLM-1010 (baggage, $300.00)", status: "to_do" },
          { content: "Check for missed claims", status: "to_do" },
        ],
      })}
    />,
  );
  expect(
    await screen.findByText("Read the claims manual, 9. Repeat claims"),
  ).toBeDefined();
  const [, working, second, ...queued] = rows();
  expect(within(working).queryByRole("link")).toBeNull();
  expect(working.querySelector(".is-live")?.textContent).toBe("In progress");
  expect(within(second).queryByText(/Read the/)).toBeNull();
  expect(queued.map((row) => row.textContent)).toEqual([
    "Work CLM-1010 (baggage, $300.00)Queued",
    "Check for missed claimsQueued",
  ]);
  expect(queued.every((row) => !within(row).queryByRole("link"))).toBe(true);
  expect(document.querySelector(".run-metrics")).toBeNull();
  expect(screen.getByText("3 of 5 claims")).toBeDefined();
  const steps = fetch.mock.calls.filter(([path]) => path.endsWith("/steps"));
  expect(new Set(steps.map(([path]) => path))).toEqual(
    new Set(["/api/claims/CLM-1007/steps"]),
  );
});

it("shows empty queued rows before the agent has a plan", () => {
  render(<RunCard claims={[]} run={run({ cap: 2 })} />);
  expect(rows().map((row) => row.textContent)).toEqual(["Queued", "Queued"]);
});

it("says when a run worked no claims", () => {
  render(<RunCard claims={[]} run={run({ status: "finished" })} />);
  expect(screen.getByText("No claims were worked in this run.")).toBeDefined();
});

it("shows a stopped run with its reason", () => {
  render(
    <RunCard
      claims={[]}
      run={run({
        status: "stopped",
        summary: "The run stopped: The provider is down",
      })}
    />,
  );
  expect(screen.getByText("Stopped")).toBeDefined();
  expect(
    screen.getByText("The run stopped: The provider is down"),
  ).toBeDefined();
});

it("keeps the loading, error and first-run lines", () => {
  const { rerender } = render(<RunCard claims={[]} run={undefined} />);
  expect(screen.getByText("Loading the run.")).toBeDefined();
  rerender(<RunCard claims={[]} run={undefined} error="offline" />);
  expect(screen.getByText("offline")).toBeDefined();
  rerender(<RunCard claims={[]} run={null} />);
  expect(screen.getByText("The agent hasn't run yet.")).toBeDefined();
});
