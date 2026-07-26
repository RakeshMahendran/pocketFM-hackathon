import { test, expect, type Page } from "@playwright/test";

/**
 * The three-minute walkthrough, driven and recorded.
 *
 *   cd web
 *   $env:CF_DEMO="1"; npx playwright test demo.spec.ts
 *
 * The webm lands under `test-results/`. Narration is recorded separately over
 * the top — the beats below hold long enough to speak the matching paragraph in
 * `docs/DEMO_SCRIPT.md`, so the two line up without editing.
 *
 * Why a script rather than a person clicking: a live walkthrough spends its
 * first ten seconds finding the cursor, and a retake costs three minutes. This
 * hits the same marks every time, and if the data moves the run fails instead of
 * quietly recording a video of the wrong numbers — every assertion here is a
 * fact the narration states out loud.
 *
 * It clicks nothing that spends money and releases nothing.
 */

const DEMO_STORY = "evt_gandhinagar_tribunal";
const AUDIO_STORY = "story1_denied_identity";

/**
 * Seconds on screen, per beat of `docs/DEMO_SCRIPT.md`.
 *
 * Budgeted rather than guessed. A first pass used one generic four-second hold
 * everywhere and came out at sixty-six seconds — fine as a click-through, far
 * too fast to narrate, and it gave the same weight to the sourcing list as to
 * the verdict the whole product exists to produce.
 *
 * Roughly 150 words a minute, so a hold of N seconds carries about 2.5N words.
 * The claim gets a full minute because it is the only part a judge cannot get
 * from a screenshot.
 */
const BEAT = {
  settle: 2_500,
  /** A sentence. */
  read: 9_000,
  /** A paragraph — the season, the split, the verdict. */
  dwell: 14_000,
  /** Play the recording. Do not talk over the first line. */
  listen: 18_000,
} as const;

/**
 * Move to a thing, then hold.
 *
 * Scrolling to an element and pausing reads as somebody looking at it. Jumping
 * between screens with no dwell reads as a page-load test, which is the
 * difference between a demo and a smoke check.
 */
async function look(page: Page, selector: string, hold = BEAT.read) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  await page.waitForTimeout(hold);
}

/*
 * Opt-in, and given room to run.
 *
 * Two things kept this from ever passing. It is a recording tool rather than a
 * check — the holds below add up to about three minutes on purpose — and it ran
 * under the 90-second per-test timeout every other spec wants, so it timed out
 * at the same mark every time no matter what the app did. It also recorded a
 * video on every ordinary suite run, which is a minute and a half spent on a
 * take nobody asked for.
 *
 * So: skipped unless `CF_DEMO` is set, which is what the docstring above already
 * told people to do, and allowed the wall-clock its own script budgets for.
 */
test.skip(!process.env.CF_DEMO, "recording take — set CF_DEMO=1 to run it");

test("three minute walkthrough", async ({ page, context }) => {
  test.setTimeout(6 * 60_000);

  await context.addCookies([
    { name: "cf_editor", value: "priya", domain: "localhost", path: "/" },
  ]);

  // ---- 0:20 what it found -------------------------------------------------
  await page.goto("/sourcing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(BEAT.read);

  // The narration says this number out loud, and discovery has been re-run
  // mid-session before — 29 became 30 between writing the script and recording
  // it. So it is read off the page and printed rather than asserted against a
  // literal: the take survives, and the console tells you what to say.
  const found = await page
    .locator("text=/\\d+ found/")
    .first()
    .textContent();
  console.log(`\n  NARRATION — candidates on screen: ${found?.trim()}\n`);
  await page.waitForTimeout(BEAT.settle);

  // The demo story has to be reachable from here, or the walk is two demos
  // stitched together. This is the one fact about this screen worth failing on.
  await expect(page.locator("body")).toContainText("The Court That Never Was");

  // ---- 0:45 the season ----------------------------------------------------
  await page.goto(`/serials/${DEMO_STORY}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(BEAT.read);

  // "twelve episodes, and underneath them a record of who was kept in the dark"
  await look(page, "#whats-out", BEAT.dwell);

  // ---- 1:15 hear it -------------------------------------------------------
  // The other story: two languages and a sound-effects toggle, which is the
  // stronger thirty seconds. Narration covers the change of show.
  await page.goto(`/serials/${AUDIO_STORY}/1`);
  const player = page.locator("audio").first();
  await expect(player).toBeAttached();
  await player.scrollIntoViewIfNeeded();
  await page.waitForTimeout(BEAT.settle);

  await player.evaluate((el: HTMLAudioElement) => el.play());
  await page.waitForTimeout(BEAT.listen);
  await player.evaluate((el: HTMLAudioElement) => el.pause());

  // What the director decided, while the last line is still in the ear.
  await look(page, "text=/played .* different ways/i", BEAT.dwell);

  // ---- 1:40 the claim -----------------------------------------------------
  await page.goto(`/serials/${DEMO_STORY}/cast`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(BEAT.read);

  await page.goto(`/serials/${DEMO_STORY}/cast/manjula`);
  // 5 seen against 44 shut out. The gap is the pitch, so it is asserted.
  await expect(page.locator("body")).toContainText("5");
  await expect(page.locator("body")).toContainText("44");
  await page.waitForTimeout(BEAT.dwell);

  await page.goto(`/serials/${DEMO_STORY}/cast/manjula/b024`);
  await expect(page.locator("body")).toContainText(/0 contradictions/i);
  await page.waitForTimeout(BEAT.dwell);

  // The beat that carries it: not the green verdict, the list of attacks that
  // failed. Opened on camera, because a fold nobody opens proves nothing.
  const attempts = page
    .locator("summary")
    .filter({ hasText: /could not make stick/i })
    .first();
  if (await attempts.count()) {
    await attempts.scrollIntoViewIfNeeded();
    await attempts.click();
    await page.waitForTimeout(BEAT.dwell * 2);
  }

  // ---- 2:40 the closer: what it takes to put one out ----------------------
  //
  // This was a refusal beat until the morning of the recording: the season
  // named a living man, the check called it fatal, and the panel was red.
  // Somebody then gave both people real fictional counterparts, and it passed.
  // That is the check having worked rather than the check being gone — but it
  // means the ending is now the release control, not the wall.
  //
  // The control is shown and NOT pressed. Releasing is free and reversible, but
  // a recording that changes state leaves the next take starting somewhere
  // else, and the sentence over this shot is about what happens on the click
  // rather than the click itself.
  await page.goto(`/serials/${DEMO_STORY}`);
  await look(page, "#whats-out", BEAT.settle);

  const release = page.locator("text=/Put episode 1 out/i").first();
  await release.scrollIntoViewIfNeeded();
  await expect(release).toBeVisible();
  await page.waitForTimeout(BEAT.dwell * 2);
});
