import { expect, test } from "@playwright/test";

/** Fresh visits can open character work without a session or entry screen. */

const STORY = "evt_gandhinagar_tribunal";

test("the studio stays accessible without cookies (paid run is opt-in)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  const after = async (where: string) => {
    await expect(page.getByRole("navigation", { name: "Studio", exact: true }), where).toBeVisible();
    await expect(page.getByText("Priya Raghavan", { exact: true })).toHaveCount(0);
    expect((await page.context().cookies()).find((cookie) => cookie.name === "cf_editor")).toBeUndefined();
  };
  await after("opening the studio");

  // Straight to the character with an episode already on disk, by URL, so this
  // test is about the session rather than about link text that may move.
  await page.goto(`/serials/${STORY}/cast/hardik`);
  await expect(page).toHaveURL(new RegExp(`/cast/hardik$`));
  await after("navigating to the character");

  // The press. This is a server action that spawns a process and redirects.
  const write = page.getByRole("button", { name: /writ|episode|generate/i }).first();
  // An ordinary UI sweep must never start a paid writer or replace demo data.
  // Opt in explicitly when running against a disposable, offline fixture.
  if (process.env.CF_ALLOW_PAID_E2E === "1" && await write.count()) {
    await write.click();
    await page.waitForLoadState("networkidle");
    await after("pressing the write button");
    // The bug as reported: after the action, are we still on the character page
    // or back at the front door?
    await expect(page).not.toHaveURL(/localhost:\d+\/$/);
  } else {
    test.info().annotations.push({ type: "coverage", description: "Paid generation is not executed in the UI sweep." });
  }

  // And the route the report said did not exist.
  await page.goto(`/serials/${STORY}/cast/hardik/b041`);
  await expect(page).toHaveURL(/\/cast\/hardik\/b041$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await after("opening the episode");
});
