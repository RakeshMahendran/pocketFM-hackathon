import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end browser checks for the commissioning console.
 *
 * Deliberately NOT wired into `npm run build` or any existing script: this is a
 * hand-run harness, invoked as `npx playwright test`. It points at whatever dev
 * server is already listening on :3000 rather than starting one, because the
 * demo machine runs `npm run dev` in its own terminal and a second server on a
 * taken port fails in a way that looks like the app is broken.
 */

const PORT = process.env.CF_WEB_PORT ?? "3000";

/**
 * `CF_DEMO=1` turns this into a screen recorder.
 *
 * Video off by default: the checks run dozens of times and a webm per test is
 * waste. For the demo capture it is the whole point, so one flag flips the
 * recording on, unmutes the player, and drops the retry — a second take of a
 * three-minute walkthrough is not a recovery, it is a different video.
 */
const DEMO = process.env.CF_DEMO === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  /* A recording is one continuous take; a timeout mid-walk truncates it. */
  ...(DEMO ? { timeout: 300_000 } : {}),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "off",
    video: DEMO
      ? { mode: "on", size: { width: 1280, height: 800 } }
      : "off",
    launchOptions: {
      args: [
        // Media has to be startable without a real user gesture so the player
        // test can assert the file actually decodes, and audible output on a
        // headless box is noise.
        "--autoplay-policy=no-user-gesture-required",
        // ...except when recording, where the point is that you can hear it.
        ...(DEMO ? [] : ["--mute-audio"]),
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
