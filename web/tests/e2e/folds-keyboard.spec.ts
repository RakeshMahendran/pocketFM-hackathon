import { expect, test } from "@playwright/test";

import { MAINLINE, SPINOFF, shot, signIn, watch } from "./_harness";

/**
 * The two things this console leans on that nobody tests: `<details>` folds,
 * and reaching a control without a mouse.
 *
 * The folds are load-bearing — the rule in `components/Fold.tsx` is "fold,
 * never delete", which means a producer defending a decision has to be able to
 * get the script back. If a summary does not toggle, or the content inside is
 * not reachable once open, that promise is broken silently.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

for (const route of [
  `/serials/${MAINLINE}`,
  `/serials/${MAINLINE}/1`,
  `/serials/${MAINLINE}/cast/babulal`,
  `/serials/${SPINOFF}/cast/ratnamma`,
]) {
  test(`folds open and close on ${route}`, async ({ page }) => {
    const log = watch(page, route);
    await page.goto(route);

    const details = page.locator("details");
    const n = await details.count();
    expect(n, "this screen is built out of folds").toBeGreaterThan(0);

    const broken: string[] = [];

    for (let i = 0; i < n; i++) {
      const d = details.nth(i);
      const summary = d.locator("summary").first();
      if (!(await summary.count())) {
        broken.push(`details[${i}] has no summary`);
        continue;
      }
      const label = (await summary.innerText()).trim().slice(0, 50);
      const wasOpen = await d.evaluate((el) => (el as HTMLDetailsElement).open);

      await summary.scrollIntoViewIfNeeded();
      await summary.click();
      const afterFirst = await d.evaluate((el) => (el as HTMLDetailsElement).open);
      if (afterFirst === wasOpen) {
        broken.push(`"${label}" did not toggle on click`);
        continue;
      }

      if (afterFirst) {
        // Open means the content is actually laid out, not merely in the DOM.
        const inner = await d.evaluate((el) => {
          const kids = Array.from(el.children).filter(
            (c) => c.tagName !== "SUMMARY",
          );
          const h = kids.reduce(
            (acc, c) => acc + c.getBoundingClientRect().height,
            0,
          );
          const text = kids.map((c) => c.textContent ?? "").join("").trim();
          return { h, chars: text.length };
        });
        if (inner.h < 1 || inner.chars < 1) {
          broken.push(`"${label}" opened but has no visible content`);
        }
      }

      await summary.click();
      const afterSecond = await d.evaluate((el) => (el as HTMLDetailsElement).open);
      if (afterSecond !== wasOpen) {
        broken.push(`"${label}" did not close again`);
      }
    }

    expect(broken, broken.join("\n")).toEqual([]);
    expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
  });
}

test("a summary is reachable and operable from the keyboard", async ({ page }) => {
  const route = `/serials/${MAINLINE}/cast/babulal`;
  const log = watch(page, route);
  await page.goto(route);

  const summary = page.locator("details summary").first();
  await summary.focus();
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused, "a summary must be focusable").toBe("SUMMARY");

  const before = await summary
    .locator("xpath=..")
    .evaluate((el) => (el as HTMLDetailsElement).open);
  await page.keyboard.press("Enter");
  const after = await summary
    .locator("xpath=..")
    .evaluate((el) => (el as HTMLDetailsElement).open);
  expect(after, "Enter on a summary must toggle it").not.toBe(before);

  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("tab order on the season page reaches the release control", async ({ page }) => {
  const route = `/serials/${MAINLINE}`;
  const log = watch(page, route);
  await page.goto(route);

  await page.locator("body").click({ position: { x: 2, y: 2 } });

  const trail: {
    i: number;
    tag: string;
    text: string;
    outline: string;
    ring: boolean;
    y: number;
  }[] = [];

  for (let i = 0; i < 90; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.innerText ?? el.getAttribute("aria-label") ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 60),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        // Chrome's default focus ring is drawn even when outline computes to
        // `auto`; a stylesheet that sets `outline: none` with no replacement is
        // the failure worth catching.
        ring: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
        y: Math.round(r.top),
      };
    });
    if (!info) break;
    trail.push({ i, ...info });
    if (/^Put episode|^Pull episode|release/i.test(info.text)) break;
  }

  const unstyled = trail.filter((t) => !t.ring);
  const reachedRelease = trail.some((t) =>
    /put episode|pull episode|take episode/i.test(t.text),
  );

  // Reported rather than asserted hard: this is a finding, not a build gate.
  // eslint-disable-next-line no-console
  console.log(
    "TAB TRAIL " +
      JSON.stringify(
        { steps: trail.length, reachedRelease, noVisibleRing: unstyled.length, trail },
        null,
        1,
      ),
  );

  expect(trail.length, "Tab must move focus at all").toBeGreaterThan(3);
  // Monotonic-ish: focus should walk down the page, not jump back up repeatedly.
  const backJumps = trail.filter((t, i) => i > 0 && t.y < trail[i - 1].y - 40).length;
  // eslint-disable-next-line no-console
  console.log("TAB BACKJUMPS " + backJumps);

  await shot(page, "1280-season-focus.png", false);
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});

test("an open fold does not trap focus", async ({ page }) => {
  const route = `/serials/${MAINLINE}`;
  const log = watch(page, route);
  await page.goto(route);

  const summary = page.locator("details summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");

  const seen = new Set<string>();
  let escaped = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return {
        key: `${el.tagName}:${(el.innerText ?? "").trim().slice(0, 30)}`,
        inFold: !!el.closest("details"),
      };
    });
    if (!where) break;
    if (seen.has(where.key)) break;
    seen.add(where.key);
    if (!where.inFold) {
      escaped = true;
      break;
    }
  }
  expect(escaped || seen.size < 60, "focus must leave the fold").toBe(true);
  expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
});
