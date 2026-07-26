import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * Shared rigging for the browser sweep.
 *
 * Two jobs: put the demo cookie in place (there is no login form, only a name
 * picker that sets `cf_editor`), and record every console line and uncaught
 * error the browser produced on a route. The recording is appended to a file
 * rather than only asserted on, because a React hydration warning that does not
 * fail a test is still something a producer will see in devtools on stage.
 */

export const OUT_DIR =
  process.env.CF_E2E_OUT ??
  "C:/Users/RAKESH/AppData/Local/Temp/claude/E--RakeshProfessional-PocketFM-canonforge/fdf58884-1637-4cb4-8560-0f7a0623e9b0/scratchpad/e2e";

export const SHOTS = path.join(OUT_DIR, "shots");
const LOG = path.join(OUT_DIR, "console.log.jsonl");

mkdirSync(SHOTS, { recursive: true });

export const MAINLINE = "1a8a1dc47393";
export const SPINOFF = "story1_denied_identity";

/** Controls that spend money or change release state. Never clicked. */
export const FORBIDDEN = [
  "Make this one",
  "Work this character up",
  "Work them up and write their episode",
  "Write their episode",
  "Write it again",
  "Record it",
  "Record it again",
];

export interface Captured {
  route: string;
  kind: "console" | "pageerror" | "requestfailed" | "response";
  level?: string;
  text: string;
  location?: string;
}

/**
 * The browser cancelling its own media fetch.
 *
 * `preload="metadata"` means Chrome asks for the file, reads the header it
 * wanted, and drops the connection — which surfaces as ERR_ABORTED on a request
 * that did exactly what it was supposed to. The same thing happens when the
 * player remounts on a mix change. The route handler answers 206 with
 * `Accept-Ranges`, so this is not a server fault; it is still written to the
 * log, just not counted against the page.
 */
function isMediaAbort(c: Captured): boolean {
  return (
    c.kind === "requestfailed" &&
    c.text.includes("/audio/") &&
    c.text.includes("ERR_ABORTED")
  );
}

export async function signIn(context: BrowserContext, editor = "priya") {
  await context.addCookies([
    {
      name: "cf_editor",
      value: editor,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Everything the browser said, on whatever route was current when it said it.
 *
 * `label()` is how a caller retags the stream as it navigates, so a warning
 * lands against the page that produced it rather than the page the test started
 * on.
 */
export function watch(page: Page, route: string) {
  const seen: Captured[] = [];
  let current = route;

  const push = (c: Captured) => {
    seen.push(c);
    appendFileSync(LOG, JSON.stringify(c) + "\n", "utf-8");
  };

  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const loc = msg.location();
    push({
      route: current,
      kind: "console",
      level: type,
      text: msg.text(),
      location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined,
    });
  });

  page.on("pageerror", (err) => {
    push({
      route: current,
      kind: "pageerror",
      text: `${err.name}: ${err.message}`,
      location: (err.stack ?? "").split("\n")[1]?.trim(),
    });
  });

  page.on("requestfailed", (req) => {
    push({
      route: current,
      kind: "requestfailed",
      text: `${req.method()} ${req.url()} — ${req.failure()?.errorText}`,
    });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      push({
        route: current,
        kind: "response",
        text: `${res.status()} ${res.request().method()} ${res.url()}`,
      });
    }
  });

  return {
    seen,
    label(next: string) {
      current = next;
    },
    /** Only the things that would show red in devtools. */
    bad() {
      return seen
        .filter(
          (c) =>
            c.kind === "pageerror" ||
            c.kind === "requestfailed" ||
            (c.kind === "console" && c.level === "error") ||
            c.kind === "response",
        )
        .filter((c) => !isMediaAbort(c));
    },
  };
}

/**
 * A screenshot that does not lie about the page.
 *
 * Playwright's default `caret: "hide"` writes `caret-color: transparent` into
 * the DOM. Fired before React has hydrated, that mutation is itself a hydration
 * mismatch, and the console error it produces is the harness's, not the app's —
 * an hour was spent on it once. `caret: "initial"` leaves the DOM alone.
 */
export async function shot(page: Page, file: string, fullPage = true) {
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage, caret: "initial" });
}

/** Elements wider than the viewport, or clipped off the right edge. */
export async function overflowing(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: { tag: string; cls: string; right: number; text: string }[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > w + 1 || r.left < -1) {
        // Only the outermost offender — a wide table reports every cell too.
        if (out.some((o) => el.parentElement && o.tag === el.parentElement.tagName))
          continue;
        out.push({
          tag: el.tagName,
          cls: (el.getAttribute("class") ?? "").slice(0, 90),
          right: Math.round(r.right),
          text: (el.textContent ?? "").trim().slice(0, 60),
        });
      }
    }
    // A box that scrolls sideways inside a page that does not. The season's
    // shape ladder is one of these, and a chart whose last episode is past the
    // right edge is the same failure as a clipped page — worse, because there
    // is no scrollbar on the window to hint that something is missing.
    const clipped: { cls: string; visible: number; content: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowX)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        clipped.push({
          cls: (el.getAttribute("class") ?? "").slice(0, 70),
          visible: el.clientWidth,
          content: el.scrollWidth,
        });
      }
    }

    return {
      viewport: w,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrolls: document.documentElement.scrollWidth > w + 1,
      offenders: out.slice(0, 12),
      innerScrollers: clipped,
    };
  });
}
