import { expect, test } from "@playwright/test";

import { signIn, watch } from "./_harness";

/**
 * What the commissioning list has to put on screen.
 *
 * The old list rendered `one_line` and `why_not` as two equal paragraphs and
 * nothing else — so the four fields an editor actually decides on (what the
 * story sells, how long a season it makes, how the score breaks down, and which
 * axis carried it) were all one click away on the brief, after the decision.
 *
 * These check the decision is answerable from the list, not that any particular
 * markup exists: every assertion is a field a person has to be able to read
 * before spending money.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("the list answers the commissioning decision without a click", async ({
  page,
}) => {
  const log = watch(page, "/sourcing");
  await page.goto("/sourcing");

  const hero = page.getByTestId("top-pick");
  await expect(hero).toBeVisible();

  // Why it sells. The pulp hook, and the field the old list never showed.
  await expect(hero.getByTestId("sells")).not.toBeEmpty();

  // The season length. This is the revenue number — 180 episodes is a year of
  // daily unlocks — and it decided nothing while it was invisible.
  await expect(hero.getByTestId("episodes")).toContainText(/\d+/);

  // The score, and the five axes behind it. `engine_longevity` can refuse a
  // winner outright in `_check_winner()`, so a total with no breakdown hides
  // the one axis that is allowed to say no.
  await expect(hero.getByTestId("total")).toContainText(/\d+/);
  await expect(hero.getByTestId("axis")).toHaveCount(5);

  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("every row carries the five axes in one fixed order", async ({ page }) => {
  await page.goto("/sourcing");

  const rows = page.getByTestId("story-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(3);

  // Fixed slot order is the whole point: slot 3 is only scannable down the
  // column if slot 3 is the same measure in every row. Sorting within a row
  // would destroy the comparison and still look fine.
  const order = ["engine", "hook", "feeling", "conflict", "cast"];
  for (const row of (await rows.all()).slice(0, 5)) {
    await expect(row.getByTestId("axis")).toHaveCount(5);
    const labels = await row.getByTestId("axis").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-axis")),
    );
    expect(labels).toEqual(order);
  }
});

test("the case against a story is one click away, not on the row", async ({
  page,
}) => {
  await page.goto("/sourcing");

  const row = page.getByTestId("story-row").first();
  const fold = row.getByTestId("case-against");

  // Present in the DOM — find-in-page still reaches it, nothing was deleted —
  // but not shown until asked for. This is the whole answer to "too much text".
  await expect(fold).toHaveCount(1);
  await expect(fold).not.toBeVisible();

  // The control is a <summary>, which Chromium does not expose as a button —
  // so this clicks the element a person clicks, and asserts separately that its
  // accessible name says what opening it reveals. The visible text is the title
  // alone, which tells someone on a screen reader nothing about the fold.
  const toggle = row.locator("summary");
  await expect(toggle).toHaveAccessibleName(/why it sells/i);
  await toggle.click();

  await expect(fold).toBeVisible();
  await expect(fold).not.toBeEmpty();
});

test("opening one row closes the last", async ({ page }) => {
  await page.goto("/sourcing");

  const rows = page.getByTestId("story-row");
  const first = rows.nth(0);
  const second = rows.nth(1);

  await first.locator("summary").click();
  await expect(first.getByTestId("case-against")).toBeVisible();

  // Single-open, via `<details name>` and no JavaScript. NN/g's objection to
  // accordions is that people leave them all open and the list turns to mush;
  // this is the fix, and it is worth a test because it is one attribute that
  // would be easy to drop in a refactor and impossible to notice.
  await second.locator("summary").click();
  await expect(second.getByTestId("case-against")).toBeVisible();
  await expect(first.getByTestId("case-against")).not.toBeVisible();
});

test("a blocked story is still listed, and still refuses", async ({ page }) => {
  await page.goto("/sourcing");

  const blocked = page.getByTestId("story-row").filter({
    has: page.getByTestId("blocked"),
  });

  // The corpus currently holds none, so this asserts the shape only when one
  // exists. A blocked row must never be hidden — an editor needs to see that
  // the search found it and that the law, not taste, is what stopped it.
  if ((await blocked.count()) > 0) {
    await expect(blocked.first()).toBeVisible();
    await expect(blocked.first().getByTestId("blocked")).toContainText(
      /blocked/i,
    );
  }
});
