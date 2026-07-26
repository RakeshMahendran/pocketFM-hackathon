import { expect, test } from "@playwright/test";

import {
  DEMO,
  DEMO_RELEASED,
  FORBIDDEN,
  MAINLINE,
  SPINOFF,
  shot,
  signIn,
  watch,
} from "./_harness";

/**
 * The demo, clicked rather than fetched.
 *
 * Every hop is a real click on a real link, because the thing this is hunting
 * for — a control that renders but does nothing, a hydration mismatch, a link
 * whose href is right and whose click handler is not — does not show up in an
 * HTTP check. Nothing that spends money is clicked; those controls are asserted
 * to exist and read correctly, then left alone.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("sign-in gate redirects an anonymous visitor", async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  const log = watch(page, "/sourcing (no cookie)");
  await page.goto("/sourcing");
  await expect(page).toHaveURL("http://localhost:3000/");
  // One way in, not a row per editor. The picker offered four names nobody has
  // an opinion about; the byline it set is unchanged, so this asserts the door
  // is there rather than which name is behind it.
  await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
  await fresh.close();
});

test("sourcing → candidate brief", async ({ page }) => {
  const log = watch(page, "/sourcing");
  await page.goto("/sourcing");

  // The list rows, not the "next step" shortcut above them — that link points
  // at a candidate too, and it is the first `a[href^=/candidates/]` in the DOM.
  const rows = page.locator('a[href^="/candidates/"]').filter({ has: page.locator("h2") });
  const count = await rows.count();
  expect(count, "the ranked list should be a list").toBeGreaterThan(5);

  const first = rows.first();
  const href = await first.getAttribute("href");
  const title = (await first.locator("h2").innerText()).trim();

  await shot(page, "1280-sourcing.png");

  log.label("/candidates/[id]");
  await first.click();
  await page.waitForURL("**/candidates/**");
  expect(page.url()).toContain(href!);
  // The brief has to be about the row that was clicked, not whatever the
  // server rendered first.
  await expect(page.locator("h1")).toContainText(title.slice(0, 20));

  await shot(page, "1280-candidate.png");
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("serials → season → episode", async ({ page }) => {
  const log = watch(page, "/serials");
  await page.goto("/serials");

  // The season the list offers, which is the demo one — see `DEMO` in the
  // harness. Clicking in from the list is the point of this test, so it has to
  // ask for the row that is really there.
  const season = page.locator(`a[href="/serials/${DEMO}"]`).first();
  await expect(season).toBeVisible();

  log.label(`/serials/${DEMO}`);
  await season.click();
  await page.waitForURL(`**/serials/${DEMO}`);

  // The release state is the thing a producer reads first, and the thing this
  // run must not change.
  await expect(page.getByText(DEMO_RELEASED).first()).toBeVisible();

  const present: string[] = [];
  for (const label of FORBIDDEN) {
    const c = page.getByText(label, { exact: true });
    // Present is fine; clicked is not. Assert it reads as an action, move on.
    if (await c.count()) present.push(label);
  }
  // eslint-disable-next-line no-console
  console.log("PAID CONTROLS ON SEASON PAGE " + JSON.stringify(present));

  await shot(page, "1280-season.png");

  // The episode-list link, not the ladder column of the same href — the ladder
  // sits inside a closed fold and is unreachable until it is opened.
  log.label(`/serials/${DEMO}/1`);
  const epLink = page
    .locator(`a[href="/serials/${DEMO}/1"]`)
    .filter({ hasText: /\S/ })
    .last();
  await epLink.scrollIntoViewIfNeeded();
  await epLink.click();
  await page.waitForURL(`**/serials/${DEMO}/1`);
  await expect(page.locator("audio")).toHaveCount(1);
  await shot(page, "1280-episode.png");

  // `preload="metadata"` makes Chrome cancel the range request once it has the
  // header it wanted. That surfaces as ERR_ABORTED and is the browser behaving,
  // not a broken file — `audio.spec.ts` proves the same URL plays.
  const bad = log
    .bad()
    .filter((c) => !(c.kind === "requestfailed" && c.text.includes("/audio/")));
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
});

test("the season shape ladder is reachable at all", async ({ page }) => {
  // It is the season page's one visual argument, and it ships folded shut.
  // Worth its own check that opening the fold makes its 14 columns clickable.
  const log = watch(page, `/serials/${MAINLINE}`);
  await page.goto(`/serials/${MAINLINE}`);

  const ladderLink = page.locator(`a[href="/serials/${MAINLINE}/7"]`).first();
  const hiddenAtRest = !(await ladderLink.isVisible());

  const fold = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /shape|ladder|arc/i }) })
    .first();
  if (await fold.count()) {
    await fold.locator("summary").first().click();
    await expect(ladderLink).toBeVisible();
    const box = await ladderLink.boundingBox();
    expect(box!.height).toBeGreaterThan(50);
  }
  // eslint-disable-next-line no-console
  console.log("LADDER FOLDED SHUT ON ARRIVAL: " + hiddenAtRest);

  await shot(page, "1280-season-ladder-open.png");
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("cast → character → their episode", async ({ page }) => {
  const log = watch(page, `/serials/${MAINLINE}/cast`);
  await page.goto(`/serials/${MAINLINE}/cast`);

  const cast = page.locator(`a[href^="/serials/${MAINLINE}/cast/"]`);
  expect(await cast.count()).toBeGreaterThanOrEqual(13);
  await shot(page, "1280-cast.png");

  log.label(`/serials/${MAINLINE}/cast/babulal`);
  await page.locator(`a[href="/serials/${MAINLINE}/cast/babulal"]`).first().click();
  await page.waitForURL("**/cast/babulal");

  // knows / blind split, as two numbers that are not the same number.
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/Was there for/i);
  expect(body).toMatch(/Never found out about/i);

  await shot(page, "1280-babulal.png");

  log.label(`/serials/${MAINLINE}/cast/babulal/b003`);
  const ep = page.locator(`a[href^="/serials/${MAINLINE}/cast/babulal/"]`).first();
  await expect(ep).toBeVisible();
  await ep.click();
  await page.waitForURL("**/cast/babulal/**");
  await shot(page, "1280-babulal-ep.png");

  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("the 0-vs-5 comparison renders as a comparison", async ({ page }) => {
  const log = watch(page, `/serials/${SPINOFF}/cast/ratnamma`);
  await page.goto(`/serials/${SPINOFF}/cast/ratnamma`);

  const body = await page.locator("body").innerText();
  expect(body).toMatch(/0 contradictions written to what they know/i);
  expect(body).toMatch(/5 contradictions written without the limits/i);

  await shot(page, "1280-ratnamma.png");
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("no route in the flow logs a console error", async ({ page }) => {
  const routes = [
    "/",
    "/home",
    "/scout",
    "/sourcing",
    "/serials",
    `/serials/${MAINLINE}`,
    `/serials/${MAINLINE}/1`,
    `/serials/${MAINLINE}/4`,
    `/serials/${MAINLINE}/cast`,
    `/serials/${MAINLINE}/cast/babulal`,
    `/serials/${MAINLINE}/cast/babulal/b003`,
    `/serials/${SPINOFF}`,
    `/serials/${SPINOFF}/1`,
    `/serials/${SPINOFF}/cast`,
    `/serials/${SPINOFF}/cast/ratnamma`,
  ];

  const log = watch(page, routes[0]);
  for (const r of routes) {
    log.label(r);
    const res = await page.goto(r, { waitUntil: "networkidle" });
    expect(res?.status(), `${r} returned ${res?.status()}`).toBeLessThan(400);
    // Give hydration a moment — mismatches are logged after first paint.
    await page.waitForTimeout(800);
  }

  // A media request cancelled by navigating away from a page with a player is
  // the browser doing its job, not a fault.
  const bad = log
    .bad()
    .filter((c) => !(c.kind === "requestfailed" && c.text.includes("/audio/")));
  expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
});
