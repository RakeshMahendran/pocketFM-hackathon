import { expect, test } from "@playwright/test";

import { MAINLINE, SPINOFF, shot, signIn, watch } from "./_harness";

/**
 * The player, asserted as a player.
 *
 * "An `<audio>` element is on the page" is not the claim being made on stage —
 * the claim is that the pipeline produced a file and the file plays. So: the
 * source is fetched and checked for `audio/mpeg`, `play()` is called and
 * `currentTime` has to actually advance, and the effects toggle is required to
 * swap the source *and* land the listener back where they were, which is the
 * one thing the toggle exists for.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

async function srcOf(page: import("@playwright/test").Page) {
  return page.locator("audio").first().evaluate((el) => (el as HTMLAudioElement).src);
}

test("mainline episode 1 audio resolves to a real mp3", async ({ page, request }) => {
  const log = watch(page, `/serials/${MAINLINE}/1`);
  await page.goto(`/serials/${MAINLINE}/1`);

  const audio = page.locator("audio").first();
  await expect(audio).toBeVisible();

  const src = await srcOf(page);
  expect(src).toContain("/audio/");

  const res = await request.get(src, { headers: { Range: "bytes=0-1023" } });
  expect([200, 206]).toContain(res.status());
  expect(res.headers()["content-type"]).toContain("audio/mpeg");

  // Metadata has to land, or the element is decorative.
  await expect
    .poll(
      async () => audio.evaluate((el) => (el as HTMLAudioElement).readyState),
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(1);

  const duration = await audio.evaluate((el) => (el as HTMLAudioElement).duration);
  expect(duration).toBeGreaterThan(10);

  // And it has to advance when told to.
  await audio.evaluate((el) => (el as HTMLAudioElement).play());
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).currentTime), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0.2);

  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("the effects toggle swaps the file and keeps the position", async ({
  page,
  request,
}) => {
  const log = watch(page, `/serials/${MAINLINE}/1`);
  await page.goto(`/serials/${MAINLINE}/1`);

  const audio = page.locator("audio").first();
  const withEffects = page.getByRole("button", { name: /effects/i }).first();
  const voicesOnly = page.getByRole("button", { name: /voices only/i }).first();
  await expect(withEffects).toBeVisible();
  await expect(voicesOnly).toBeVisible();

  const before = await srcOf(page);

  // Seek somewhere unambiguous, start playing, then toggle.
  await audio.evaluate((el) => {
    const a = el as HTMLAudioElement;
    a.currentTime = 42;
    return a.play();
  });
  await page.waitForTimeout(600);
  const at = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  expect(at).toBeGreaterThan(41);

  await voicesOnly.click();

  const after = await srcOf(page);
  expect(after, "toggling the mix must change the source").not.toBe(before);

  const res = await request.get(after, { headers: { Range: "bytes=0-1023" } });
  expect([200, 206]).toContain(res.status());
  expect(res.headers()["content-type"]).toContain("audio/mpeg");

  // Position is restored on loadedmetadata, so poll rather than read once.
  await expect
    .poll(
      async () => audio.evaluate((el) => (el as HTMLAudioElement).currentTime),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(40);

  const stillPlaying = await audio.evaluate(
    (el) => !(el as HTMLAudioElement).paused,
  );
  expect(stillPlaying, "playback must survive the toggle").toBe(true);

  await shot(page, "1280-episode-toggled.png");
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("the spin-off episode offers two languages, both playable", async ({
  page,
  request,
}) => {
  const log = watch(page, `/serials/${SPINOFF}/1`);
  await page.goto(`/serials/${SPINOFF}/1`);

  const audio = page.locator("audio").first();
  await expect(audio).toBeVisible();

  const english = page.getByRole("button", { name: /^English$/i }).first();
  const other = page
    .getByRole("button", { name: /Hindi|Tamil/i })
    .first();
  await expect(english).toBeVisible();
  await expect(other).toBeVisible();

  const first = await srcOf(page);
  const a = await request.get(first, { headers: { Range: "bytes=0-1023" } });
  expect([200, 206]).toContain(a.status());

  await other.click();
  await expect
    .poll(async () => srcOf(page), { timeout: 10_000 })
    .not.toBe(first);

  const second = await srcOf(page);
  const b = await request.get(second, { headers: { Range: "bytes=0-1023" } });
  expect([200, 206]).toContain(b.status());
  expect(b.headers()["content-type"]).toContain("audio/mpeg");

  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).readyState), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(1);

  // A language change deliberately drops position; assert the documented
  // behaviour rather than the opposite.
  const at = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  expect(at).toBeLessThan(1);

  await shot(page, "1280-spinoff-ep.png");
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});
