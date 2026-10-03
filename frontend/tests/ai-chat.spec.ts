import { expect, test } from "@playwright/test";

// Real calls to the Anthropic API (same acceptance as the backend's live
// smoke tests, see backend/AGENTS.md) — this layer verifies the sidebar's
// wiring (send, render reply, refresh the board), not AI correctness,
// which Part 9's backend test suite already covers thoroughly (mocked +
// live). Needs ANTHROPIC_API_KEY set.

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
});

test("answers a non-mutating question without changing the board", async ({
  page,
}) => {
  await page.goto("/");
  const backlog = page.getByTestId("column-col-backlog");
  await expect(backlog.locator('[data-testid^="card-"]').first()).toBeVisible();
  const cardsBefore = await backlog.locator('[data-testid^="card-"]').count();

  await page.getByRole("button", { name: /ai chat/i }).click();
  await page
    .getByLabel("Chat message")
    .fill("How many columns are on my board? Answer in one short sentence.");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByTestId("chat-message-assistant")).toBeVisible({
    timeout: 30_000,
  });

  const cardsAfter = await backlog.locator('[data-testid^="card-"]').count();
  expect(cardsAfter).toBe(cardsBefore);
});

test("adds a card via the sidebar and the board updates live", async ({
  page,
}) => {
  await page.goto("/");
  const backlog = page.getByTestId("column-col-backlog");

  await page.getByRole("button", { name: /ai chat/i }).click();
  await page
    .getByLabel("Chat message")
    .fill("Please add a new card titled exactly 'E2E Chat Card' to my Backlog column.");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByTestId("chat-message-assistant")).toBeVisible({
    timeout: 30_000,
  });
  // No manual reload here — proves the board refreshed from the chat
  // response alone.
  await expect(backlog.getByText("E2E Chat Card")).toBeVisible();
});
