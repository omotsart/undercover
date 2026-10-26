import { expect, test, type APIRequestContext } from "@playwright/test";

// The tests play the agent's part through the API, so no model is called.
// They share one fresh database and run in order.
test.describe.configure({ mode: "serial" });

async function decide(
  request: APIRequestContext,
  claimId: string,
  payout: number,
) {
  await request.post(`/api/claims/${claimId}/start`);
  await request.post(`/api/claims/${claimId}/steps`, {
    data: { text: "Reading the claim" },
  });
  await request.post(`/api/claims/${claimId}/decision`, {
    data: {
      decision: "approve",
      payout,
      reason: "The claim is covered and the receipts support it.",
      policy_section: "3. Trip Delay",
    },
  });
  return request.post(`/api/claims/${claimId}/pay`, {
    data: { amount: payout },
  });
}

test("the queue loads with 25 waiting claims", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("25 claims")).toBeVisible();
  await expect(page.locator(".status-bar-item").nth(4)).toContainText(
    "25 · 100%",
  );
  await expect(page.getByText("0 · 0%")).toHaveCount(4);
  await expect(page.locator(".status-bar-item").nth(2)).toContainText(
    "Left for a handler",
  );
  await expect(
    page.getByText("Nothing is waiting for sign-off."),
  ).toBeVisible();
  await expect(page.getByText("No decisions yet.")).toBeVisible();
});

// Starting a run would call a model, so these tests never press the button.
test("the queue shows the agent's run and the claims to work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("The agent hasn't run yet.")).toBeVisible();
  await expect(page.getByLabel("Claims to work")).toHaveValue("5");
  await expect(
    page.getByRole("button", { name: "Work the queue" }),
  ).toBeEnabled();
});

test("an approved claim is decided and paid", async ({ page, request }) => {
  expect((await decide(request, "CLM-1001", 420)).ok()).toBe(true);

  await page.goto("/");
  const row = page.getByRole("row").filter({ hasText: "CLM-1001" });
  await expect(row.getByText("Decided")).toBeVisible();
  await expect(row.getByText("Approved")).toBeVisible();
  await expect(row.getByText("$420.00")).toHaveCount(2);

  await row.getByRole("link", { name: "CLM-1001" }).click();
  await expect(page).toHaveURL("/claims/CLM-1001");
  await expect(
    page.getByText("The claim is covered and the receipts support it."),
  ).toBeVisible();
  await expect(page.getByText("3. Trip Delay")).toBeVisible();
  await expect(page.getByText(/^Paid \$420\.00 on/)).toBeVisible();
  await expect(page.getByText("Reading the claim")).toBeVisible();
});

test("a payout over $1,000 waits for a handler's sign-off", async ({
  page,
  request,
}) => {
  const payment = await decide(request, "CLM-1002", 1500);
  expect(payment.status()).toBe(409);

  await page.goto("/");
  const panel = page.getByRole("region", { name: "Next for sign-off" });
  await expect(panel.getByText("$1,500.00")).toBeVisible();
  await panel.getByRole("link", { name: /CLM-1002/ }).click();

  await expect(page).toHaveURL("/claims/CLM-1002");
  await expect(
    page.getByText("The payment waits for a handler's sign-off.").first(),
  ).toBeVisible();
  await page.getByLabel("Handler").selectOption({ label: "Dana Whitfield" });
  await page.getByRole("button", { name: "Sign off and pay" }).click();
  await expect(
    page.getByText(/^Paid \$1,500\.00 on .*, signed off by Dana Whitfield\.$/),
  ).toBeVisible();
  await expect(page.locator("h1 + .chip")).toHaveText("Decided");
});

test("In progress moves, unless motion is reduced", async ({
  page,
  request,
}) => {
  await request.post("/api/claims/CLM-1003/start");
  const animation = () =>
    page
      .locator(".status-bar .status-in_progress.is-live")
      .evaluate((el) => getComputedStyle(el, "::before").animationName);

  await page.goto("/");
  expect(await animation()).toBe("hatch-move");
  await expect(page.locator(".claims-table .is-live")).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
});

test("rows that open a claim share hover, focus and the arrow", async ({
  page,
  request,
}) => {
  await request.post("/api/claims/CLM-1004/start");
  await request.post("/api/claims/CLM-1004/decision", {
    data: {
      decision: "approve",
      payout: 1200,
      reason: "The bag was delayed for two days.",
      policy_section: "4. Baggage Delay",
    },
  });
  await page.goto("/");

  const row = page.getByRole("row").filter({ hasText: "CLM-1005" });
  await row.hover();
  await expect(row).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(row.locator(".row-arrow")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 3, 0)",
  );

  const panel = page.getByRole("region", { name: "Next for sign-off" });
  const signOff = panel.getByRole("link", { name: /CLM-1004/ });
  await signOff.hover();
  await expect(signOff).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.1)",
  );

  const button = page.getByRole("button", { name: "Work the queue" });
  await button.hover();
  await expect(button).toHaveCSS("filter", "brightness(0.94)");
  await page.mouse.move(0, 0);

  // Keyboard focus, starting from the control just before each row: the
  // last filter tab before the table, the last pager button before the
  // right-hand column.
  const focused = () =>
    page.evaluate(() => document.activeElement?.textContent ?? "");
  await page.getByRole("button", { name: /^Decided/ }).focus();
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("CLM-1001");
  const link = page.getByRole("link", { name: "CLM-1001" });
  const outline = await link.evaluate((el) => {
    const style = getComputedStyle(el, "::after");
    return `${style.outlineStyle} ${style.outlineColor}`;
  });
  expect(outline).toBe("solid rgb(35, 35, 35)");
  await expect(page.getByRole("row").filter({ hasText: "CLM-1001" })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );

  await page.getByRole("button", { name: "Next page" }).focus();
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("CLM-1004Danielle Okafor$1,200.00›");
  await expect(signOff).toHaveCSS("outline-style", "solid");
  await expect(signOff).toHaveCSS("outline-color", "rgb(255, 255, 255)");
});

test("the table keeps one line a row and its page across a claim", async ({
  page,
}) => {
  await page.goto("/");
  const medical = page.getByRole("row").filter({ hasText: "CLM-1003" });
  await expect(medical).toHaveCSS("height", "44px");
  await expect(medical.getByRole("cell").nth(2)).toHaveCSS(
    "white-space",
    "nowrap",
  );
  const gap = await page.locator(".claims-head").evaluate((head) => {
    const [claimed, status] = [head.children[4], head.children[5]];
    const left =
      status.getBoundingClientRect().left +
      parseFloat(getComputedStyle(status).paddingLeft);
    return left - claimed.getBoundingClientRect().right;
  });
  expect(gap).toBeGreaterThanOrEqual(24);

  await page.getByRole("button", { name: "Page 2" }).click();
  await expect(page).toHaveURL("/?page=2");
  const firstRow = page.locator(".claims-body .row-link").first();
  const first = await firstRow.textContent();
  await firstRow.click();
  await expect(page).toHaveURL(`/claims/${first ?? ""}`);
  await page.goBack();
  await expect(page).toHaveURL("/?page=2");
  await expect(page.locator(".claims-body .row-link").first()).toHaveText(
    first ?? "",
  );
  await expect(page.getByRole("button", { name: "Page 2" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("Show all opens every row and keeps the column in view", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.locator(".claims-body .claim-row")).toHaveCount(25);
  await expect(page.locator(".side-column")).toHaveCSS("position", "sticky");
  await expect(page.locator(".pager")).toHaveCSS("visibility", "hidden");
  await page.getByRole("button", { name: "Collapse" }).click();
  await expect(page.locator(".pager")).toHaveCSS("visibility", "visible");
  await expect(page.locator(".side-column")).toHaveCSS("position", "static");
});

test("Referred's icon and the legends read clearly", async ({
  page,
  request,
}) => {
  await request.post("/api/claims/CLM-1005/start");
  await request.post("/api/claims/CLM-1005/decision", {
    data: {
      decision: "refer",
      payout: 0,
      reason: "The embassy receipt is missing.",
      policy_section: "Claims manual 5. Documents and document requests",
    },
  });
  await page.goto("/");
  await expect(
    page.locator(".claims-table .decision-refer .decision-icon"),
  ).toHaveCSS("color", "rgb(35, 35, 35)");
  const legendRow = page.locator(".legend li").first();
  await expect(legendRow).toHaveCSS("justify-content", "normal");
  await expect(legendRow).toHaveCSS("column-gap", "8px");
});

test("the two columns end on one line, and stack in order", async ({
  page,
}) => {
  const bottoms = () =>
    page.evaluate(() =>
      [".queue-main", ".queue-grid .side-column"].map((selector) =>
        Math.round(
          document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0,
        ),
      ),
    );
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".claims-body .claim-row").first()).toBeVisible();
    const [left, right] = await bottoms();
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    const scroll = page.locator(".table-scroll");
    expect(await scroll.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(
      0,
    );
  }

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/");
  const order = await page.evaluate(() =>
    [
      ".status-card",
      ".queue-grid .dark-panel",
      ".run-card",
      ".table-card",
      ".decisions-card",
      ".ring-card",
    ].map((selector) =>
      Math.round(
        document.querySelector(selector)?.getBoundingClientRect().top ?? 0,
      ),
    ),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await expect(page.locator(".claims-body .claim-row")).toHaveCount(10);
});

test("the instructions are shown read only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Instructions" }).click();
  for (const name of [
    "Running the queue",
    "Working a claim",
    "How to work a claim",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

for (const path of ["/", "/instructions", "/claims/CLM-1002"]) {
  test(`${path} doesn't scroll sideways on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}
