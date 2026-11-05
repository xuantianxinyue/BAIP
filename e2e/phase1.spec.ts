import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURES = join(process.cwd(), 'Fixtures', 'raw');
const fixtures = existsSync(FIXTURES) ? readdirSync(FIXTURES).map((f) => join(FIXTURES, f)) : [];

/** Records every request that leaves localhost, so the test can assert the app is fully offline. */
function trackExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(req.url());
  });
  return external;
}

test('AI self-test passes and the page is cross-origin isolated', async ({ page }) => {
  const external = trackExternalRequests(page);
  await page.goto('/');
  await expect(page.getByText('RAW AI 批处理')).toBeVisible();
  await page.getByTestId('selftest-button').click();
  const result = page.getByTestId('selftest-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  console.log(await result.innerText());
  await expect(result).toHaveAttribute('data-passed', 'true');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(external).toEqual([]);
});

test('imports sample RAW files and shows previews + EXIF', async ({ page }) => {
  test.skip(fixtures.length === 0, 'run `npm run samples` first');
  const external = trackExternalRequests(page);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(fixtures);
  const items = page.getByTestId('asset-item');
  await expect(items).toHaveCount(fixtures.length);
  await expect(page.locator('[data-testid=asset-item][data-status=ready]')).toHaveCount(fixtures.length, { timeout: 240_000 });

  for (let i = 0; i < fixtures.length; i++) {
    const item = items.nth(i);
    await item.click();
    await expect(page.getByTestId('preview-image')).toBeVisible();
    const camera = await page.getByTestId('exif-相机').innerText();
    const size = await page.getByTestId('exif-尺寸').innerText();
    console.log(`${(await item.innerText()).split('\n')[0]} | ${await item.getAttribute('data-load-ms')} ms | ${camera.replace('\n', ': ')} | ${size.replace('\n', ': ')}`);
  }
  await page.screenshot({ path: 'test-results/phase1-import.png' });
  expect(external).toEqual([]);
});

test('LibRaw full decode returns RGB pixel data', async ({ page }) => {
  const raw = fixtures.find((f) => f.endsWith('Nikon_D750.NEF'));
  test.skip(!raw, 'run `npm run samples` first');
  await page.goto('/?e2e');
  await page.getByTestId('file-input').setInputFiles(raw!);
  const result = await page.evaluate(() => (window as unknown as { __decodeLastImport: () => Promise<unknown> }).__decodeLastImport());
  console.log('full decode', JSON.stringify(result));
  expect(result).toMatchObject({ width: 6032, channels: 3, bitsPerSample: 16 });
});
