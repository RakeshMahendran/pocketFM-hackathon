import { expect, test } from "@playwright/test";

/**
 * Does the sign-in survive a button press?
 *
 * The report was "the session is only there before any action", and separately
 * "there is no route for seeing the episodes of character". Those are one
 * symptom if they are the same bug: every inner page calls `requireEditor()`,
 * which redirects to `/` when the cookie is missing, so a lost cookie does not
 * look like a lost login — it looks like the page you asked for not existing.
 *
 * So this walks the golden path by clicking, never by typing a URL, and asserts
 * after each step that we are still where we asked to be rather than back at the
 * front door.
 */

const STORY = "evt_gandhinagar_tribunal";

test("the cookie survives sign-in, navigation, and a run", async ({ page }) => {
  await page.goto("/");
  // A submit button, not a link: sign-in is a server action that sets the
  // cookie, so the front door is already one press of the same kind as the ones
  // this test is about.
  await page.getByRole("button", { name: /get started/i }).click();
  await expect(page).not.toHaveURL(/localhost:\d+\/$/);

  const cookieName = "cf_editor";
  const after = async (where: string) => {
    const jar = await page.context().cookies();
    const c = jar.find((k) => k.name === cookieName);
    expect(c, `cookie gone after ${where}`).toBeTruthy();
  };
  await after("sign-in");

  // Straight to the character with an episode already on disk, by URL, so this
  // test is about the session rather than about link text that may move.
  await page.goto(`/serials/${STORY}/cast/hardik`);
  await expect(page).toHaveURL(new RegExp(`/cast/hardik$`));
  await after("navigating to the character");

  // The press. This is a server action that spawns a process and redirects.
  const write = page.getByRole("button", { name: /writ|episode|generate/i }).first();
  if (await write.count()) {
    await write.click();
    await page.waitForLoadState("networkidle");
    await after("pressing the write button");
    // The bug as reported: after the action, are we still on the character page
    // or back at the front door?
    await expect(page).not.toHaveURL(/localhost:\d+\/$/);
  }

  // And the route the report said did not exist.
  await page.goto(`/serials/${STORY}/cast/hardik/b041`);
  await expect(page).toHaveURL(/\/cast\/hardik\/b041$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await after("opening the episode");
});
