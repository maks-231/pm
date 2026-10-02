import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
});

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card into an empty column", async ({ page }) => {
  // Regression test: closestCorners collision detection used to resolve
  // drops into an empty column to the wrong (nearby, similarly-sized) card
  // in an adjacent column instead of the much larger empty column rect.
  await page.goto("/");

  const discovery = page.getByTestId("column-col-discovery");
  // Empty Discovery deterministically (its remove button), rather than via
  // a drag, so this test isolates exactly the one drag it's checking.
  // (A plain role/name query is ambiguous here: the draggable card article
  // itself has role="button" and its computed accessible name also picks up
  // the nested Remove button's aria-label.)
  await page.getByTestId("card-card-3").locator('button[aria-label^="Delete"]').click();
  await expect(discovery.getByText("Drop a card here")).toBeVisible();

  const card1 = page.getByTestId("card-card-1");
  const card1Box = await card1.boundingBox();
  const discoveryBox = await discovery.boundingBox();
  if (!card1Box || !discoveryBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    card1Box.x + card1Box.width / 2,
    card1Box.y + card1Box.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    discoveryBox.x + discoveryBox.width / 2,
    discoveryBox.y + 100,
    { steps: 12 }
  );
  await page.mouse.up();

  await expect(discovery.getByTestId("card-card-1")).toBeVisible();
});

test("persists changes across a reload and a fresh login", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Persisted card");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Persisted card")).toBeVisible();

  await page.reload();
  await expect(firstColumn.getByText("Persisted card")).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(firstColumn.getByText("Persisted card")).toBeVisible();
});
