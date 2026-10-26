import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { failure, run, stubApi, summary } from "./testing";

const QUEUE = [
  summary({
    claim_id: "CLM-1001",
    status: "decided",
    decision: "approve",
    payout: 420,
    paid_amount: 420,
  }),
  summary({
    claim_id: "CLM-1002",
    customer_name: "Tomás Reyes",
    status: "awaiting_signoff",
    decision: "approve",
    payout: 1500,
  }),
  summary({ claim_id: "CLM-1003", status: "in_progress" }),
  summary({
    claim_id: "CLM-1004",
    status: "decided",
    decision: "decline",
    payout: 0,
  }),
];

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the queue with its status bar, numbers and cards", async () => {
  stubApi({
    "GET /api/claims": QUEUE,
    "GET /api/runs/current": run({ claims: ["CLM-1003"] }),
  });
  render(<App />);
  expect(await screen.findByText("4 claims")).toBeDefined();
  expect(screen.getAllByText("2 · 50%")).toHaveLength(1);
  expect(screen.getAllByText("1 · 25%")).toHaveLength(2);
  expect(screen.getAllByText("0 · 0%")).toHaveLength(2);
  expect(screen.queryByText("For sign-off")).toBeNull();
  const paid = document.querySelector(".paid-total");
  expect(paid?.textContent).toBe("$420.00Paid");

  const table = screen.getByRole("table", { name: "Claims" });
  expect(within(table).getAllByRole("row")).toHaveLength(5);
  expect(within(table).getAllByText("Approved")).toHaveLength(2);
  expect(within(table).getByText("Declined")).toBeDefined();
  expect(within(table).getAllByText("–")).toHaveLength(2);
  expect(within(table).getAllByText("Jun 24, 2026")).toHaveLength(4);

  const signOff = screen.getByRole("region", { name: "Next for sign-off" });
  expect(within(signOff).getByText("Tomás Reyes")).toBeDefined();
  const titles = (selector: string) =>
    [
      ...(document.querySelector(selector)?.querySelectorAll(".card-title") ??
        []),
    ].map((title) => title.textContent);
  expect(titles(".queue-main")).toEqual(["The agent's run", "Claims"]);
  expect(document.querySelector(".queue-main > .status-card")?.ariaLabel).toBe(
    "Claims by status",
  );
  expect(titles(".side-column")).toEqual([
    "Next for sign-off",
    "Decisions",
    "By status",
  ]);
  expect(screen.getByRole("img", { name: "4 claims by status" })).toBeDefined();
  expect(
    await screen.findByRole("button", { name: "Working the queue" }),
  ).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("Claims to work")).toHaveProperty(
    "disabled",
    true,
  );
});

it("shows a line in each card with nothing to show", async () => {
  stubApi({ "GET /api/claims": [summary({})] });
  render(<App />);
  expect(await screen.findByText("No decisions yet.")).toBeDefined();
  expect(document.querySelector(".paid-total")?.textContent).toBe("$0.00Paid");
  const signOff = screen.getByRole("region", { name: "Next for sign-off" });
  expect(signOff.textContent).toBe("Nothing is waiting for sign-off.");
  expect(within(signOff).queryByRole("heading")).toBeNull();
  expect(screen.getAllByText("0 · 0%")).toHaveLength(4);
  expect(screen.getByText("1 · 100%")).toBeDefined();
});

it("shows an empty queue", async () => {
  stubApi({ "GET /api/claims": [] });
  render(<App />);
  expect(await screen.findByText("No claims in the queue.")).toBeDefined();
  expect(screen.getAllByText("0 · 0%")).toHaveLength(5);
});

const WAITING = ["CLM-1001", "CLM-1002", "CLM-1003", "CLM-1004"].map(
  (claimId) => summary({ claim_id: claimId }),
);

function workQueueBody(fetch: ReturnType<typeof stubApi>) {
  const call = fetch.mock.calls.find(([path]) => path === "/api/queue/work");
  return JSON.parse(call?.[1]?.body as string) as unknown;
}

// The routes object is read on every call, so a test can move the run along.
function startableQueue(started: ReturnType<typeof run>) {
  const routes: Record<string, unknown> = {
    "GET /api/claims": WAITING,
    "GET /api/runs/current": null,
    "POST /api/queue/work": started,
  };
  const fetch = stubApi(routes);
  return { routes, fetch };
}

it("starts a run capped at the claims to work", async () => {
  const { routes, fetch } = startableQueue(run({ cap: 3 }));
  render(<App />);
  const field = await screen.findByLabelText("Claims to work");
  expect(field).toHaveProperty("value", "5");
  fireEvent.change(field, { target: { value: "3" } });
  routes["GET /api/runs/current"] = run({ cap: 3 });
  fireEvent.click(screen.getByRole("button", { name: "Work the queue" }));
  expect(
    await screen.findByText("The agent is working up to 3 claims."),
  ).toBeDefined();
  expect(workQueueBody(fetch)).toEqual({ cap: 3 });
});

it("clears the run's message once the run has finished", async () => {
  const { routes } = startableQueue(run({ cap: 1 }));
  render(<App />);
  routes["GET /api/runs/current"] = run({ cap: 1 });
  fireEvent.change(await screen.findByLabelText("Claims to work"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Work the queue" }));
  await screen.findByText("The agent is working up to 1 claim.");
  routes["GET /api/runs/current"] = run({ cap: 1, status: "finished" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Finished");
  expect(screen.queryByText("The agent is working up to 1 claim.")).toBeNull();
});

it("caps a run at the claims waiting", async () => {
  const { routes, fetch } = startableQueue(run({ cap: 4 }));
  render(<App />);
  const button = await screen.findByRole("button", { name: "Work the queue" });
  routes["GET /api/runs/current"] = run({ cap: 4 });
  fireEvent.click(button);
  await screen.findByText("The agent is working up to 4 claims.");
  expect(workQueueBody(fetch)).toEqual({ cap: 4 });
});

it("keeps Claims to work usable only with claims waiting", async () => {
  stubApi({
    "GET /api/claims": [summary({ status: "decided", decision: "decline" })],
    "GET /api/runs/current": null,
  });
  render(<App />);
  const field = await screen.findByLabelText("Claims to work");
  expect(field).toHaveProperty("disabled", true);
  expect(field.getAttribute("min")).toBe("1");
  expect(field.getAttribute("max")).toBe("1");
});

it("needs at least one claim to work", async () => {
  stubApi({ "GET /api/claims": WAITING, "GET /api/runs/current": null });
  render(<App />);
  fireEvent.change(await screen.findByLabelText("Claims to work"), {
    target: { value: "0" },
  });
  expect(screen.getByRole("button", { name: "Work the queue" })).toHaveProperty(
    "disabled",
    true,
  );
});

it("shows that the agent hasn't run yet", async () => {
  stubApi({ "GET /api/claims": WAITING, "GET /api/runs/current": null });
  render(<App />);
  expect(await screen.findByText("The agent hasn't run yet.")).toBeDefined();
});

it("counts claims left for a handler", async () => {
  stubApi({
    "GET /api/claims": [
      summary({ claim_id: "CLM-1001", status: "for_handler" }),
      summary({ claim_id: "CLM-1002" }),
    ],
    "GET /api/runs/current": null,
  });
  render(<App />);
  const table = await screen.findByRole("table", { name: "Claims" });
  expect(within(table).getByText("Left for a handler")).toBeDefined();
  expect(screen.getAllByText("1 · 50%")).toHaveLength(2);
});

const IN_PROGRESS = [
  summary({ claim_id: "CLM-1001", status: "in_progress" }),
  summary({ claim_id: "CLM-1002" }),
];

function liveElements() {
  return [...document.querySelectorAll(".is-live")].map((el) => el.textContent);
}

it("moves the status bar's In progress when no run is working", async () => {
  stubApi({ "GET /api/claims": IN_PROGRESS, "GET /api/runs/current": null });
  render(<App />);
  await screen.findByText("The agent hasn't run yet.");
  expect(liveElements()).toEqual(["1 · 50%"]);
  expect(
    document.querySelector(".status-bar .status-in_progress.is-live"),
  ).not.toBeNull();
});

it("moves only the run while it works", async () => {
  stubApi({
    "GET /api/claims": IN_PROGRESS,
    "GET /api/runs/current": run({ claims: ["CLM-1001"] }),
    "GET /api/claims/CLM-1001/steps": [],
  });
  render(<App />);
  await screen.findByText("Working");
  expect(liveElements()).toEqual(["Working", "In progress"]);
  expect(document.querySelector(".claims-table .is-live")).toBeNull();
});

it("keeps everything still when nothing is in progress", async () => {
  stubApi({
    "GET /api/claims": [summary({})],
    "GET /api/runs/current": run({ status: "finished" }),
  });
  render(<App />);
  await screen.findByText("Finished");
  expect(liveElements()).toEqual([]);
});

it("ends every row that opens a claim with an arrow", async () => {
  stubApi({ "GET /api/claims": QUEUE, "GET /api/runs/current": null });
  render(<App />);
  await screen.findByText("4 claims");
  const clickable = [...document.querySelectorAll(".clickable-row")];
  expect(clickable).toHaveLength(5);
  for (const row of clickable)
    expect(row.querySelector(".row-arrow")?.textContent).toBe("›");
  const signOff = screen.getByRole("region", { name: "Next for sign-off" });
  expect(within(signOff).getByRole("link").textContent).toBe(
    "CLM-1002Tomás Reyes$1,500.00›",
  );
});

it("draws one claim in 25 as a short arc, not a dot", async () => {
  stubApi({
    "GET /api/claims": [
      summary({ status: "decided", decision: "decline" }),
      ...Array.from({ length: 24 }, () => summary({})),
    ],
    "GET /api/runs/current": null,
  });
  render(<App />);
  await screen.findByText("25 claims");
  const dash = (status: string) =>
    Number(
      document
        .querySelector(`.ring-${status}`)
        ?.getAttribute("stroke-dasharray")
        ?.split(" ")[0],
    );
  expect(dash("decided")).toBe(8);
  expect(dash("waiting")).toBeGreaterThan(250);
});

it("says why the queue didn't start", async () => {
  stubApi({
    "GET /api/claims": [summary({})],
    "POST /api/queue/work": failure(409, "The queue is already being worked."),
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Work the queue" }),
  );
  expect(
    await screen.findByText("The queue is already being worked."),
  ).toBeDefined();
});

it("says when the backend can't be reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByText("offline")).toBeDefined();
});

it("refreshes the queue and the run from the header", async () => {
  const fetch = stubApi({
    "GET /api/claims": [summary({})],
    "GET /api/runs/current": null,
  });
  render(<App />);
  await screen.findByText("1 claim");
  const calls = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(fetch.mock.calls.slice(calls).map(([path]) => path)).toEqual([
    "/api/claims",
    "/api/runs/current",
  ]);
});

it("opens a claim from its row", async () => {
  stubApi({ "GET /api/claims": [summary({})] });
  render(<App />);
  fireEvent.click(await screen.findByRole("link", { name: "CLM-1001" }));
  expect(window.location.pathname).toBe("/claims/CLM-1001");
});

it("shows the agent's instructions, read only", async () => {
  stubApi({
    "GET /api/claims": [],
    "GET /api/instructions": [
      { name: "queue", title: "Running the queue", text: "Work the queue." },
      {
        name: "claim",
        title: "Working a claim",
        text: "## How to work a claim\n\nRead it.",
      },
    ],
  });
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "Instructions" }));
  expect(
    await screen.findByRole("heading", { name: "Running the queue" }),
  ).toBeDefined();
  expect(screen.getByText("Work the queue.")).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "Working a claim" }),
  ).toBeDefined();
  expect(
    screen.getByRole("heading", { name: "How to work a claim" }),
  ).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Queue" }));
  expect(window.location.pathname).toBe("/");
});

it("leaves modified clicks to the browser", () => {
  stubApi({ "GET /api/claims": [] });
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "Instructions" }), {
    ctrlKey: true,
  });
  expect(window.location.pathname).toBe("/");
});
