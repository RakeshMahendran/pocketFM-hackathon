import { expect, test } from "@playwright/test";

import { MAINLINE, shot, signIn, watch } from "./_harness";

/**
 * The season page on a bad connection.
 *
 * Conference wifi is the real deployment target for a demo, and the failure
 * mode worth catching is an intermediate state that reads as wrong rather than
 * as loading — a release count of zero before the data lands, a fold that is
 * open then snaps shut, an unstyled flash. Shots are taken while it is still
 * arriving, not after.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test("season page under throttle shows no wrong intermediate state", async ({
  page,
}) => {
  const route = `/serials/${MAINLINE}`;
  const log = watch(page, route);

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
    connectionType: "cellular3g",
  });

  const nav = page.goto(route, { waitUntil: "load" });

  const frames: { at: number; text: string }[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    frames.push({ at: i * 400, text: text.replace(/\s+/g, " ").slice(0, 300) });
    await shot(page, `slow-season-${i}.png`, false).catch(() => {});
  }
  await nav;
  await page.waitForLoadState("networkidle");

  // A wrong number on screen for a second is worse than nothing on screen: the
  // count is the claim being made.
  const wrongCount = frames.filter(
    (f) => /of 14/.test(f.text) && !/5 of 14/.test(f.text),
  );
  // eslint-disable-next-line no-console
  console.log("SLOW FRAMES " + JSON.stringify(frames, null, 1));
  expect(wrongCount, JSON.stringify(wrongCount, null, 2)).toEqual([]);

  await expect(page.getByText(/5 of 14/i).first()).toBeVisible();

  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});
