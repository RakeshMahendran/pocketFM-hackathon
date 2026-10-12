import { expect, test } from '@playwright/test';

test('a show starts with its story and real production progress, then episodes', async ({ page }) => {
  await page.goto('/serials/evt_gandhinagar_tribunal');
  const overview = page.getByRole('region', { name: 'Series overview', exact: true });
  await expect(overview.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(overview.getByTestId('show-gist')).toBeVisible();
  await expect(overview.getByRole('group', { name: 'Episodes written' })).toContainText('12');
  await expect(overview.getByRole('group', { name: 'Audio generated' })).toContainText('2 of 12');
  await expect(overview.getByRole('group', { name: 'Episodes published' })).toContainText('2');
  await expect(overview.getByText(/\/50|things happen|kept from someone/)).toHaveCount(0);
  const episodes = page.getByRole('region', { name: 'Episodes', exact: true });
  expect((await episodes.boundingBox())!.y).toBeLessThan(600);
  const rows = episodes.getByTestId('episode-row');
  await expect(rows.first().getByText('Audio ready', { exact: true })).toBeVisible();
  await expect(rows.nth(2).getByText('Not generated', { exact: true })).toBeVisible();
  await expect(rows.first().getByTestId('episode-story-details')).not.toBeVisible();
  await rows.first().locator('summary').filter({ hasText: 'Episode details' }).click();
  await expect(rows.first().getByTestId('episode-story-details')).toBeVisible();
  await rows.nth(1).locator('summary').filter({ hasText: 'Episode details' }).click();
  await expect(rows.first().getByTestId('episode-story-details')).not.toBeVisible();
});

test('show production and story reference remain reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/serials/evt_gandhinagar_tribunal');
  await expect(page.getByRole('group', { name: 'Audio generated', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Episodes', exact: true })).toBeVisible();
  await expect(page.getByTestId('show-full-synopsis')).not.toBeVisible();
  await page.locator('summary').filter({ hasText: 'Story overview' }).click();
  await expect(page.getByTestId('show-full-synopsis')).toBeVisible();
  await expect(page.getByTestId('show-full-synopsis')).not.toBeEmpty();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Publishing settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Publishing', exact: true })).toBeInViewport();
});
