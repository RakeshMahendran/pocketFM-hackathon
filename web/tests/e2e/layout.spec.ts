import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { MAINLINE, OUT_DIR, SHOTS, SPINOFF, overflowing, shot, signIn, watch } from "./_harness";

/**
 * The two screens the demo will actually be shown on.
 *
 * 1280×800 is the laptop lid; 1440×900 is what most projectors and capture
 * cards land on. Anything that overflows horizontally at either width shows up
 * on stage as a cut-off sentence or a sideways scrollbar, and neither is
 * recoverable mid-pitch.
 */

const SIZES = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
];

const ROUTES: [string, string][] = [
  ["sourcing", "/sourcing"],
  ["serials", "/serials"],
  ["season", `/serials/${MAINLINE}`],
  ["episode", `/serials/${MAINLINE}/1`],
  ["cast", `/serials/${MAINLINE}/cast`],
  ["character", `/serials/${MAINLINE}/cast/babulal`],
  ["char-episode", `/serials/${MAINLINE}/cast/babulal/b003`],
  ["ratnamma", `/serials/${SPINOFF}/cast/ratnamma`],
  ["spinoff-ep", `/serials/${SPINOFF}/1`],
  ["scout", "/scout"],
];

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

for (const size of SIZES) {
  test(`layout at ${size.w}x${size.h}`, async ({ page }) => {
    await page.setViewportSize({ width: size.w, height: size.h });
    const log = watch(page, "layout");
    const report: Record<string, unknown> = {};

    for (const [name, route] of ROUTES) {
      log.label(route);
      await page.goto(route, { waitUntil: "networkidle" });
      // Everything folded shut is measured shut, which measures nothing. Open
      // every fold first: a chart that only overflows once it is visible is
      // still a chart with its last column off the edge.
      await page.evaluate(() => {
        document
          .querySelectorAll("details")
          .forEach((d) => ((d as HTMLDetailsElement).open = true));
      });
      await page.waitForTimeout(250);
      const shotPath = `${SHOTS}/${size.w}-${name}.png`;
      await shot(page, `${size.w}-${name}.png`);
      const o = await overflowing(page);
      report[route] = { ...o, shot: shotPath };
    }

    writeFileSync(
      `${OUT_DIR}/layout-${size.w}.json`,
      JSON.stringify(report, null, 2),
      "utf-8",
    );

    const bleeding = Object.entries(report).filter(
      ([, v]) => (v as { bodyScrolls: boolean }).bodyScrolls,
    );
    const clipped = Object.entries(report)
      .map(([r, v]) => [r, (v as { innerScrollers: unknown[] }).innerScrollers])
      .filter(([, s]) => (s as unknown[]).length > 0);
    // eslint-disable-next-line no-console
    console.log(`OVERFLOW@${size.w} ` + JSON.stringify(bleeding, null, 1));
    // eslint-disable-next-line no-console
    console.log(`CLIPPED@${size.w} ` + JSON.stringify(clipped, null, 1));

    expect(log.bad(), JSON.stringify(log.bad(), null, 2)).toEqual([]);
    expect(
      bleeding.map(([r]) => r),
      "no page may scroll sideways on the demo laptop",
    ).toEqual([]);
  });
}
