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
  await expect(page.locator(".status-bar-item").nth(3)).toContainText(
    "25 · 100%",
  );
  await expect(page.getByText("0 · 0%")).toHaveCount(3);
  await expect(
    page.getByText("Nothing is waiting for sign-off."),
  ).toBeVisible();
  await expect(page.getByText("No decisions yet.")).toBeVisible();
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
