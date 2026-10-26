import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Claim } from "./api";
import { App } from "./App";
import { failure, stubApi } from "./testing";

function claim(overrides: Partial<Claim>): Claim {
  return {
    claim_id: "CLM-1002",
    policy_id: "POL-2002",
    customer_id: "CUS-3002",
    claim_type: "baggage",
    submitted_on: "2026-07-20",
    incident_date: "2026-07-14",
    incident_location: "Lisbon, Portugal",
    summary: "Suitcase lost on the way out",
    story: "My suitcase never arrived in Lisbon.",
    items: [
      { description: "Suitcase", category: "luggage", amount: 300 },
      { description: "Clothes", category: "clothing", amount: 1200 },
    ],
    amount_claimed: 1500,
    documents: [
      {
        name: "Carrier report",
        type: "carrier_report",
        content: "Bag declared lost.",
      },
    ],
    status: "waiting",
    failures: 0,
    decision: null,
    payout: null,
    reason: null,
    policy_section: null,
    decided_at: null,
    signed_off_by: null,
    signed_off_at: null,
    paid_amount: null,
    paid_at: null,
    ...overrides,
  };
}

const AWAITING = claim({
  status: "awaiting_signoff",
  decision: "approve",
  payout: 1450,
  reason: "The bag was lost by the carrier.",
  policy_section: "5. Baggage and Personal Effects",
  decided_at: "2026-10-23T10:00:00+00:00",
});

const POLICY = {
  policy_id: "POL-2002",
  plan: "premium",
  add_ons: ["electronics_plus"],
  purchased_on: "2026-05-01",
  trip: {
    destination: "Lisbon, Portugal",
    departs_on: "2026-07-13",
    returns_on: "2026-07-27",
    trip_cost: 2400,
  },
  travelers: ["Tom Becker"],
};

const HANDLERS = [
  { handler_id: "HND-01", name: "Dana Whitfield", role: "Senior" },
];

function routes(current: Claim, more: Record<string, unknown> = {}) {
  return {
    "GET /api/claims/CLM-1002": current,
    "GET /api/claims/CLM-1002/steps": [
      { text: "Reading the claim", created_at: "2026-10-23T10:00:00+00:00" },
    ],
    "GET /api/policies/POL-2002": POLICY,
    "GET /api/handlers": HANDLERS,
    ...more,
  };
}

beforeEach(() => {
  window.history.pushState(null, "", "/claims/CLM-1002");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a claim in full before the agent works it", async () => {
  stubApi({ ...routes(claim({})), "GET /api/claims/CLM-1002/steps": [] });
  render(<App />);
  expect(
    await screen.findByText("My suitcase never arrived in Lisbon."),
  ).toBeDefined();
  expect(screen.getByText("Waiting")).toBeDefined();
  expect(screen.getByText("$1,500.00")).toBeDefined();
  expect(screen.getByText("Bag declared lost.")).toBeDefined();
  expect(
    screen.getByText("The agent hasn't decided this claim yet."),
  ).toBeDefined();
  expect(
    await screen.findByText("The agent hasn't worked this claim yet."),
  ).toBeDefined();
  expect(await screen.findByText("Tom Becker")).toBeDefined();
  expect(screen.getByText("Electronics plus")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Sign off and pay" })).toBeNull();
});

it("shows the decision, the steps and the sign-off", async () => {
  stubApi(routes(AWAITING));
  render(<App />);
  expect(
    await screen.findByText("The bag was lost by the carrier."),
  ).toBeDefined();
  expect(screen.getByText("5. Baggage and Personal Effects")).toBeDefined();
  expect(screen.getByText("Approved")).toBeDefined();
  expect(await screen.findByText("Reading the claim")).toBeDefined();
  const panel = screen.getByRole("region", { name: "Sign off" });
  expect(
    within(panel).getByRole("button", { name: "Sign off and pay" }),
  ).toHaveProperty("disabled", true);
});

it("signs off a payout and shows it paid", async () => {
  const paid = claim({
    ...AWAITING,
    status: "decided",
    signed_off_by: "Dana Whitfield",
    paid_amount: 1450,
    paid_at: "2026-10-23T11:00:00+00:00",
  });
  const api = routes(AWAITING, { "POST /api/claims/CLM-1002/sign-off": paid });
  const fetch = stubApi(api);
  render(<App />);
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.change(screen.getByLabelText("Handler"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  api["GET /api/claims/CLM-1002"] = paid;
  expect(
    await screen.findByText(
      "Paid $1,450.00 on Oct 23, 2026, signed off by Dana Whitfield.",
    ),
  ).toBeDefined();
  expect(screen.queryByRole("region", { name: "Sign off" })).toBeNull();
  expect(fetch).toHaveBeenCalledWith(
    "/api/claims/CLM-1002/sign-off",
    expect.objectContaining({ body: JSON.stringify({ handler_id: "HND-01" }) }),
  );
});

it("says why a sign-off was refused", async () => {
  stubApi(
    routes(AWAITING, {
      "POST /api/claims/CLM-1002/sign-off": failure(
        409,
        "CLM-1002 is not waiting for sign-off",
      ),
    }),
  );
  render(<App />);
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.change(screen.getByLabelText("Handler"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  expect(
    await screen.findByText("CLM-1002 is not waiting for sign-off"),
  ).toBeDefined();
});

it("shows an approval that isn't paid yet, and a decline", async () => {
  stubApi(routes(claim({ ...AWAITING, status: "decided", payout: 300 })));
  render(<App />);
  expect(await screen.findByText("Not paid yet.")).toBeDefined();
  cleanup();
  stubApi(
    routes(
      claim({
        status: "decided",
        decision: "decline",
        payout: 0,
        documents: [],
      }),
    ),
  );
  render(<App />);
  expect(await screen.findByText("Declined")).toBeDefined();
  expect(screen.getByText("No documents attached.")).toBeDefined();
});

it("shows a claim left for a handler with the steps of both attempts", async () => {
  stubApi(
    routes(claim({ status: "for_handler", failures: 2 }), {
      "GET /api/claims/CLM-1002/steps": [
        {
          text: "Back in the queue: The model timed out",
          created_at: "2026-10-23T10:00:00+00:00",
        },
        { text: "Attempt 2", created_at: "2026-10-23T10:05:00+00:00" },
        {
          text: "Left for a handler: The model timed out",
          created_at: "2026-10-23T10:06:00+00:00",
        },
      ],
    }),
  );
  render(<App />);
  expect(
    await screen.findByText(
      "The agent couldn't decide this claim. It's left for a handler.",
    ),
  ).toBeDefined();
  expect(screen.getAllByText("Left for a handler")).toHaveLength(1);
  expect(
    await screen.findByText("Left for a handler: The model timed out"),
  ).toBeDefined();
  expect(screen.getByText("Attempt 2")).toBeDefined();
});

it("says when a claim doesn't exist", async () => {
  stubApi({});
  render(<App />);
  expect(
    await screen.findByText("/api/claims/CLM-1002 not found"),
  ).toBeDefined();
  expect(screen.getByRole("link", { name: "Back to the queue" })).toBeDefined();
});

function step(text: string, second: number) {
  return {
    text,
    created_at: `2026-10-23T10:00:${String(second).padStart(2, "0")}+00:00`,
  };
}

function titles(selector: string) {
  return [
    ...(document.querySelector(selector)?.querySelectorAll(".card-title") ??
      []),
  ].map((title) => title.textContent);
}

function stepTexts() {
  const list = document.querySelector(".steps");
  return [...(list?.querySelectorAll(".step-text") ?? [])].map(
    (text) => text.textContent,
  );
}

it("puts the policy under the documents and the steps beside them", async () => {
  stubApi(routes(AWAITING));
  render(<App />);
  await screen.findByText("Lisbon, Portugal", { selector: ".field span" });
  expect(titles(".claim-main")).toEqual([
    "The claim",
    "Items claimed",
    "Documents",
    "Policy",
  ]);
  expect(titles(".claim-side")).toEqual([
    "Decision",
    "Sign off",
    "Agent steps",
  ]);
});

it("lists the newest step first, counts them and renders their markdown", async () => {
  stubApi(
    routes(claim({}), {
      "GET /api/claims/CLM-1002/steps": [
        step("Reading the claim", 1),
        step("**Approve** it:\n\n- the bag\n- the clothes", 2),
      ],
    }),
  );
  render(<App />);
  expect(await screen.findByText("2 steps")).toBeDefined();
  const [newest, oldest] = stepTexts();
  expect(newest.replace(/\s+/g, " ").trim()).toBe(
    "Approve it: the bag the clothes",
  );
  expect(oldest).toBe("Reading the claim");
  const bold = screen.getByText("Approve");
  expect(bold.tagName).toBe("STRONG");
  expect(
    screen
      .getAllByRole("listitem")
      .some((item) => item.textContent === "the bag"),
  ).toBe(true);
});

it("opens every step and folds them back to the top of the card", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  stubApi(
    routes(claim({}), {
      "GET /api/claims/CLM-1002/steps": Array.from({ length: 7 }, (_, index) =>
        step(`Step ${String(index + 1)}`, index),
      ),
    }),
  );
  render(<App />);
  expect(await screen.findByText("7 steps")).toBeDefined();
  const card = document.querySelector(".steps-card");
  const grid = document.querySelector(".claim-grid");
  expect(card?.className).toBe("card steps-card has-more");

  const open = screen.getByRole("button", { name: "Show all steps" });
  expect(open.getAttribute("title")).toBe("Show all steps");
  fireEvent.click(open);
  expect(card?.className).toBe("card steps-card is-open has-more");
  expect(grid?.className).toBe("claim-grid steps-open");
  const collapse = screen.getByRole("button", { name: "Collapse" });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");

  fireEvent.click(collapse);
  expect(card?.className).toBe("card steps-card has-more");
  expect(grid?.className).toBe("claim-grid");
  expect(scroll).toHaveBeenCalledWith({ block: "start" });
});

it("adds a new step at the top and stays folded while the claim is worked", async () => {
  const steps = [step("Reading the claim", 1)];
  stubApi(
    routes(claim({ status: "in_progress" }), {
      "GET /api/claims/CLM-1002/steps": steps,
    }),
  );
  render(<App />);
  expect(await screen.findByText("1 step")).toBeDefined();
  steps.push(step("Read the claims manual, 5. Documents", 2));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("2 steps")).toBeDefined();
  expect(stepTexts()[0]).toBe("Read the claims manual, 5. Documents");
  expect(document.querySelector(".steps-card")?.className).toBe(
    "card steps-card",
  );
});
