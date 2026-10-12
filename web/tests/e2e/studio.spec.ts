import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAINLINE, signIn, watch } from "./_harness";

test.beforeEach(async ({ context }) => { await signIn(context); });

test("series cards have generous desktop covers without overflowing a phone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/serials");
  const cards = page.getByTestId("show-library").locator("li");
  expect((await cards.first().boundingBox())!.width).toBeGreaterThan(440);
  expect((await cards.first().getByRole("link").first().boundingBox())!.height).toBeLessThan(300);
  const edge = (await cards.first().boundingBox())!.x;
  expect((await cards.first().getByTestId("series-cover").boundingBox())!.x - edge).toBeLessThan(4);
  expect((await cards.nth(3).boundingBox())!.y).toBeGreaterThan((await cards.first().boundingBox())!.y + 100);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("series cards show gist and both production counts without a click", async ({ page }) => {
  await page.goto("/serials");
  const card = page.getByTestId("show-library").locator("li").filter({ has: page.locator('a[href="/serials/evt_gandhinagar_tribunal"]') });
  await expect(card.getByTestId("series-gist")).toBeVisible();
  await expect(card.getByTestId("series-gist")).not.toBeEmpty();
  await expect(card.getByRole("group", { name: "Episodes written", exact: true })).toBeVisible();
  await expect(card.getByRole("group", { name: "Episodes written", exact: true })).toContainText("12");
  await expect(card.getByRole("group", { name: "Audio generated", exact: true })).toBeVisible();
  await expect(card.getByRole("group", { name: "Audio generated", exact: true })).toContainText("2");
  const unvoiced = page.getByTestId("show-library").locator("li").filter({ has: page.locator('a[href="/serials/story4_family_betrayal"]') });
  await expect(unvoiced.getByRole("group", { name: "Audio generated", exact: true })).toContainText("0");
  await card.getByRole("link").click();
  await expect(page).toHaveURL(/\/serials\/evt_gandhinagar_tribunal$/);
  await expect(page.getByRole("group", { name: "Episodes written", exact: true })).toContainText("12");
  await expect(page.getByRole("group", { name: "Audio generated", exact: true })).toContainText("2 of 12");
  await page.goto('/serials/story4_family_betrayal');
  await expect(page.getByRole("group", { name: "Audio generated", exact: true })).toContainText("0 of 14");
});

test("app chrome keeps navigation without a demo profile or redundant workspace bar", async ({ page }) => {
  for (const route of ["/home", `/serials/${MAINLINE}/cast`]) {
    await page.goto(route);
    await expect(page.getByText("Your workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Priya Raghavan", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Welcome, Priya", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Studio", exact: true })).toBeVisible();
    await expect(page.locator("main h1").first()).toBeVisible();
  }
});

test("a studio workspace has persistent navigation and show context", async ({ page }) => {
  const log = watch(page, "studio");
  await page.goto(`/serials/${MAINLINE}/cast`);
  const navigation = page.getByRole("navigation", { name: "Studio" });
  await expect(navigation.getByRole("link", { name: "Discover", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Shows", exact: true })).toBeVisible();
  const show = page.getByRole("navigation", { name: "Show workspace" });
  await expect(show.getByRole("link", { name: "Cast", exact: true })).toHaveAttribute("aria-current", "page");
  await show.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/serials/${MAINLINE}$`));
  await expect(navigation).toBeVisible();
  expect(log.bad()).toEqual([]);
});

test("the cast is a visual library; selecting a person is free and reveals only their workspace", async ({ page }) => {
  let writes = 0;
  page.on("request", r => { if (r.method() === "POST") writes++; });
  await page.goto(`/serials/${MAINLINE}/cast`);
  const people = page.getByRole("link", { name: /^Select character:/ });
  expect(await people.count()).toBeGreaterThan(1);
  const second = people.nth(1);
  const name = (await second.getAttribute("aria-label"))!.replace("Select character: ", "");
  await second.click();
  const inspector = page.getByRole("region", { name: "Selected character" });
  await expect(inspector.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(inspector.getByRole("img", { name: /Present for/ })).toBeVisible();
  const background = inspector.getByTestId("character-background");
  await expect(background).not.toBeVisible();
  await inspector.getByText("Character details", { exact: true }).click();
  await expect(background).toBeVisible();
  expect(writes).toBe(0);
});

test("cast detail disclosures are single-open and keep their contents searchable", async ({ page }) => {
  await page.goto(`/serials/${MAINLINE}/cast`);
  const inspector = page.getByRole("region", { name: "Selected character" });
  await inspector.getByText("Character details", { exact: true }).click();
  await expect(inspector.getByTestId("character-background")).toBeVisible();
  await inspector.getByText("Production options", { exact: true }).click();
  await expect(inspector.getByTestId("character-background")).not.toBeVisible();
  await expect(inspector.getByTestId("character-background")).not.toBeEmpty();
});

test("the workspace fits a phone without losing navigation or the cast", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/serials/${MAINLINE}/cast`);
  await expect(page.getByRole("navigation", { name: "Studio" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected character" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("home stays focused while the sidebar opens the studio guide", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Your story studio", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore new stories/ })).toBeVisible();
  await expect(page.getByTestId("studio-methods")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "Studio", exact: true });
  await navigation.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("studio-methods")).toBeVisible();
  await expect(navigation.getByRole("link", { name: "How it works", exact: true })).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId("studio-methods")).toHaveCount(0);
});

test("the show library uses visual covers and keeps production details on demand", async ({ page }) => {
  await page.goto("/serials");
  await expect(page.getByTestId("show-library")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your series");
  await expect(page.getByText("About your shows", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Next step", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Series details", { exact: true })).toHaveCount(0);
  const cards = page.getByTestId("show-library").locator("li");
  for (const card of await cards.all()) {
    await expect(card.getByTestId("series-gist")).toBeVisible();
    await expect(card.getByRole("link")).toHaveCount(1);
  }
  await expect(page.getByTestId("show-library").getByText(/Fictionalization required|Safe to make|Not checked|Can’t make this|Source clearance|real names and identifying details/i)).toHaveCount(0);
});

test("series details never cover the artwork", async ({ page }) => {
  await page.goto("/serials");
  const library = page.getByTestId("show-library");
  const first = library.locator("li").first();
  const cover = first.getByRole("link").first();
  const destination = await cover.getAttribute("href");
  await expect(cover.getByText("Open series →", { exact: true })).toHaveCount(0);
  const art = await first.getByTestId("series-cover").boundingBox();
  const gist = await first.getByTestId("series-gist").boundingBox();
  expect(gist!.x).toBeGreaterThan(art!.x + art!.width);
  await cover.click();
  await expect(page).toHaveURL(new URL(destination!, "http://localhost:3000").href);
});

test("series gist works without scripts and respects reduced motion", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${baseURL}/serials`);
  const first = page.getByTestId("show-library").locator("li").first();
  await expect(first.getByTestId("series-gist")).toBeVisible();
  expect(await first.evaluate(el => getComputedStyle(el.querySelector("article")!).animationName)).toBe("none");
  await first.getByRole("link").press("Enter");
  await expect(page).toHaveURL(/\/serials\/[^/]+$/);
  await context.close();
});

test("series gist fits the phone and opens with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/serials");
  const card = page.getByTestId("show-library").locator("li").first();
  await expect(card.getByTestId("series-gist")).toBeVisible();
  expect((await card.boundingBox())!.width).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.getByRole("link").press("Enter");
  await expect(page).toHaveURL(/\/serials\/[^/]+$/);
});

test("the control comparison exposes every quoted violation without opening anything", async ({ page }) => {
  const fixture = JSON.parse(readFileSync(path.resolve(process.cwd(), "../data/spinoffs/story1_denied_identity__ratnamma__b033__leak__validation.json"), "utf8"));
  expect(fixture.violations.length).toBeGreaterThan(0);
  await page.goto("/serials/story1_denied_identity/cast/ratnamma/b033");
  await expect(page.getByRole("region", { name: "Validator report", exact: true })).toBeVisible();
  const pair = page.getByRole("region", { name: "Constrained and control comparison" });
  await expect(pair).toBeVisible();
  for (const violation of fixture.violations) {
    if (violation.beat_id) await expect(pair.getByText(violation.beat_id, { exact: true }).first()).toBeVisible();
    if (violation.quote) await expect(pair.getByText(violation.quote, { exact: false }).first()).toBeVisible();
  }
});

test("the brief keeps the legal decision visible and its long evidence closed", async ({ page }) => {
  await page.goto("/sourcing");
  await page.getByTestId("top-pick").getByRole("link", { name: /Open the brief/ }).click();
  const decision = page.getByRole("region", { name: "Commissioning decision" });
  await expect(decision).toBeVisible();
  await expect(decision).not.toBeEmpty();
  const overview = page.locator("details").filter({ has: page.getByText("Story overview", { exact: true }) });
  await expect(overview.locator("p").first()).not.toBeVisible();
  await overview.getByText("Story overview", { exact: true }).click();
  await expect(overview.locator("p").first()).toBeVisible();
});

test("mobile comparison keeps every field inside the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sourcing?view=table");
  await expect(page.getByTestId("story-row").first()).toBeVisible();
  await expect(page.getByTestId("story-row").first().getByTestId("axis")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
