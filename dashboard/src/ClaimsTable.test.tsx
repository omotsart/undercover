import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClaimSummary, Status } from "./api";
import { App } from "./App";
import { pageItems, rowsFor } from "./paging";
import { stubApi, summary } from "./testing";

const STATUSES: Status[] = [
  ...Array<Status>(4).fill("awaiting_signoff"),
  ...Array<Status>(10).fill("waiting"),
  ...Array<Status>(8).fill("decided"),
  ...Array<Status>(2).fill("in_progress"),
  "for_handler",
];

const QUEUE: ClaimSummary[] = STATUSES.map((status, index) =>
  summary({ claim_id: `CLM-${String(1001 + index)}`, status }),
);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(claims = QUEUE) {
  stubApi({ "GET /api/claims": claims, "GET /api/runs/current": null });
  render(<App />);
  return screen.findByRole("table", { name: "Claims" });
}

function shownIds() {
  const table = screen.getByRole("table", { name: "Claims" });
  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

function tab(name: RegExp) {
  return screen.getByRole("button", { name });
}

it("filters the table by status, with a count on each tab", async () => {
  await show();
  const filters = screen.getByRole("group", { name: "Filter claims" });
  expect(
    within(filters)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["All 25", "Waiting for sign-off 4", "Waiting 10", "Decided 8"]);
  expect(tab(/^All/).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(tab(/^Waiting for sign-off/));
  expect(shownIds()).toEqual(["CLM-1001", "CLM-1002", "CLM-1003", "CLM-1004"]);
  expect(tab(/^Waiting for sign-off/).className).toBe("pill active");
  expect(window.location.search).toBe("?status=awaiting_signoff");
});

it("mutes a tab with nothing in it but keeps it clickable", async () => {
  await show(QUEUE.slice(4, 14));
  expect(tab(/^Decided/).className).toBe("pill is-empty");
  fireEvent.click(tab(/^Decided/));
  expect(screen.getByText("No claims with this status.")).toBeDefined();
  expect(window.location.search).toBe("?status=decided");
});

it("pages through the claims, eight to a page beside the column", async () => {
  await show();
  expect(shownIds()).toHaveLength(8);
  expect(shownIds()[0]).toBe("CLM-1001");
  const body = document.querySelector<HTMLElement>(".claims-body");
  expect(body?.style.minHeight).toBe("352px");
  const pages = screen.getByRole("navigation", { name: "Pages" });
  expect(
    within(pages)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["‹", "1", "2", "3", "4", "›"]);
  expect(screen.getByRole("button", { name: "Previous page" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current"),
  ).toBe("page");

  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
  expect(shownIds()[0]).toBe("CLM-1009");
  expect(window.location.search).toBe("?page=2");

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(shownIds()).toEqual(["CLM-1025"]);
  expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty(
    "disabled",
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(shownIds()[0]).toBe("CLM-1017");
  fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
  expect(window.location.search).toBe("");
});

it("goes back to the first page when the tab changes", async () => {
  await show();
  fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
  fireEvent.click(tab(/^Waiting \d/));
  expect(shownIds()[0]).toBe("CLM-1005");
  expect(window.location.search).toBe("?status=waiting");
});

it("opens on the tab and page in the address, as after Back from a claim", async () => {
  window.history.pushState(null, "", "/?status=waiting&page=2");
  await show();
  expect(tab(/^Waiting \d/).getAttribute("aria-pressed")).toBe("true");
  expect(shownIds()).toEqual(["CLM-1013", "CLM-1014"]);
});

it("ignores a page or status the address can't have", async () => {
  window.history.pushState(null, "", "/?status=nonsense&page=9");
  await show();
  expect(tab(/^All/).getAttribute("aria-pressed")).toBe("true");
  expect(shownIds()).toEqual(["CLM-1025"]);
});

it("shows every row, then collapses back to the page", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  await show();
  const column = document.querySelector(".side-column");
  fireEvent.click(screen.getByRole("button", { name: "Show all" }));
  expect(shownIds()).toHaveLength(25);
  expect(
    screen.getByRole("navigation", { name: "Pages", hidden: true }).className,
  ).toBe("pager is-hidden");
  expect(column?.className).toBe("side-column is-sticky");
  const collapse = screen.getByRole("button", { name: "Collapse" });
  expect(collapse.getAttribute("title")).toBe("Collapse");
  expect(collapse.getAttribute("aria-expanded")).toBe("true");

  fireEvent.click(collapse);
  expect(shownIds()).toHaveLength(8);
  expect(column?.className).toBe("side-column");
  expect(scroll).toHaveBeenCalledWith({ block: "start" });
});

it("has no pager or Show all when one page holds everything", async () => {
  await show(QUEUE.slice(0, 5));
  expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
});

it("shows ten rows a page once the columns stack", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  await show();
  await waitFor(() => {
    expect(shownIds()).toHaveLength(10);
  });
});

it("fits the rows to the column beside the table", () => {
  expect(rowsFor(800, 280)).toBe(11);
  expect(rowsFor(300, 280)).toBe(8);
});

it("shortens long runs of page numbers", () => {
  expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(pageItems(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
  expect(pageItems(1, 12)).toEqual([1, 2, "…", 12]);
  expect(pageItems(12, 12)).toEqual([1, "…", 11, 12]);
});
