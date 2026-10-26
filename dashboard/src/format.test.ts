import { expect, it } from "vitest";
import { STATUSES, claimType, countBy, date, money, percent } from "./format";

it("formats money in US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
});

it("formats dates like Jul 6, 2026", () => {
  expect(date("2026-07-06")).toBe("Jul 6, 2026");
  expect(date("2026-07-06T23:59:00+00:00")).toBe("Jul 6, 2026");
});

it("names claim types", () => {
  expect(claimType("trip_delay")).toBe("Trip delay");
  expect(claimType("something_new")).toBe("something_new");
});

it("counts by key and gives whole percentages", () => {
  const counts = countBy(
    STATUSES,
    ["waiting", "waiting", "decided"],
    (status) => status,
  );
  expect(counts).toEqual({
    decided: 1,
    awaiting_signoff: 0,
    for_handler: 0,
    in_progress: 0,
    waiting: 2,
  });
  expect(percent(2, 3)).toBe("67%");
  expect(percent(0, 0)).toBe("0%");
});
