import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { failure, stubApi, summary } from "./testing";

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
  stubApi({ "GET /api/claims": QUEUE });
  render(<App />);
  expect(await screen.findByText("4 claims")).toBeDefined();
  expect(screen.getAllByText("2 · 50%")).toHaveLength(1);
  expect(screen.getAllByText("1 · 25%")).toHaveLength(2);
  expect(screen.getByText("0 · 0%")).toBeDefined();
  expect(
    screen.getByText("$420.00", { selector: ".big-number .num" }),
  ).toBeDefined();

  const table = screen.getByRole("table", { name: "Claims" });
  expect(within(table).getAllByRole("row")).toHaveLength(5);
  expect(within(table).getAllByText("Approved")).toHaveLength(2);
  expect(within(table).getByText("Declined")).toBeDefined();
  expect(within(table).getAllByText("–")).toHaveLength(2);
  expect(within(table).getAllByText("Jun 24, 2026")).toHaveLength(4);

  const signOff = screen.getByRole("region", { name: "Next for sign-off" });
  expect(within(signOff).getByText("Tomás Reyes")).toBeDefined();
  expect(screen.getByRole("img", { name: "4 claims by status" })).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Working the queue" }),
  ).toHaveProperty("disabled", true);
});

it("shows a line in each card with nothing to show", async () => {
  stubApi({ "GET /api/claims": [summary({})] });
  render(<App />);
  expect(await screen.findByText("No decisions yet.")).toBeDefined();
  expect(screen.getByText("Nothing is waiting for sign-off.")).toBeDefined();
  expect(screen.getAllByText("0 · 0%")).toHaveLength(3);
  expect(screen.getByText("1 · 100%")).toBeDefined();
});

it("shows an empty queue", async () => {
  stubApi({ "GET /api/claims": [] });
  render(<App />);
  expect(await screen.findByText("No claims in the queue.")).toBeDefined();
  expect(screen.getAllByText("0 · 0%")).toHaveLength(4);
});

it("starts the agent on the queue", async () => {
  const fetch = stubApi({
    "GET /api/claims": [summary({})],
    "POST /api/queue/work": { claims: 1 },
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Work the queue" }),
  );
  expect(
    await screen.findByText("The agent is working 1 claims."),
  ).toBeDefined();
  expect(fetch).toHaveBeenCalledWith("/api/queue/work", expect.anything());
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

it("refreshes the queue from the header", async () => {
  const fetch = stubApi({ "GET /api/claims": [summary({})] });
  render(<App />);
  await screen.findByText("1 claims");
  const calls = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(fetch.mock.calls).toHaveLength(calls + 1);
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
