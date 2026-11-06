import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Phase 2 core pipeline, driven through the `?e2e` hooks (the batch UI is phase 3). Needs `npm run samples`. */
const RAW = join(process.cwd(), 'Fixtures', 'raw');
const SMALL_RAW = join(RAW, 'Canon_5DMkIII_converted.dng');
/** No people, but a coiled cord that YuNet's default threshold takes for three faces. */
const NO_FACE_RAW = join(RAW, 'Canon_5DMkIII.CR2');
const PORTRAIT = join(process.cwd(), 'Fixtures', 'faces', 'astronaut.png');
test.skip(!existsSync(SMALL_RAW) || !existsSync(PORTRAIT), 'run `npm run samples` first');

interface Report {
  snapshot: { state: string; done: number; failed: number; remaining: number; failures: { name: string; error: string }[]; items: { name: string; status: string }[] };
  photos: { fileName: string; width: number; height: number; bytes: number; faces?: unknown[]; backend?: string; hash: number; timings: Record<string, number>; exif: { cameraModel?: string; iso?: number } | null }[];
}

type Batch = { start(o: object): void; pause(): void; resume(): void; cancel(): void; wait(): Promise<Report>; snapshot(): Report['snapshot'] };
const batch = <T,>(page: Page, run: (b: Batch, arg: object) => T | Promise<T>, arg: object = {}) =>
  page.evaluate(([source, a]) => new Function('b', 'a', `return (${source})(b, a)`)((window as unknown as { __batch: Batch }).__batch, a), [run.toString(), arg] as const) as Promise<T>;

function trackExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) external.push(req.url());
  });
  return external;
}

async function load(page: Page, files: string[], ready = files.length) {
  await page.goto('/?e2e');
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.locator('[data-testid=asset-item]:not([data-status=pending]):not([data-status=loading])')).toHaveCount(ready, { timeout: 120_000 });
}

const run = async (page: Page, options: object) => {
  await batch(page, (b, o) => b.start(o), options);
  return batch(page, (b) => b.wait());
};

test('denoises a RAW in the worker and exports a JPG with its EXIF', async ({ page }) => {
  const external = trackExternalRequests(page);
  await load(page, [SMALL_RAW]);
  const { snapshot, photos } = await run(page, { denoise: 'medium', retouch: false });
  console.log('denoise', JSON.stringify(photos[0]));
  expect(snapshot).toMatchObject({ state: 'finished', done: 1, failed: 0 });
  expect(photos[0]).toMatchObject({ fileName: 'Canon_5DMkIII_converted_processed.jpg', width: 1920, height: 1080 });
  expect(photos[0].bytes).toBeGreaterThan(100_000);
  expect(photos[0].exif?.cameraModel).toContain('5D Mark III');
  expect(photos[0].timings.denoise).toBeGreaterThan(0);
  expect(external).toEqual([]);
});

test('the denoise tiers give different results', async ({ page }) => {
  await load(page, [SMALL_RAW]);
  const hashes = new Set<number>();
  for (const denoise of ['low', 'high']) hashes.add((await run(page, { denoise, retouch: false })).photos[0].hash);
  expect(hashes.size).toBe(2);
});

test('finds the face in a portrait and retouches it; a photo without faces passes through', async ({ page }) => {
  await load(page, [PORTRAIT, NO_FACE_RAW]);
  const { snapshot, photos } = await run(page, { denoise: null, retouch: true });
  console.log('retouch', JSON.stringify(photos));
  expect(snapshot).toMatchObject({ done: 2, failed: 0 });
  expect(photos.find((p) => p.fileName.startsWith('astronaut'))!.faces).toHaveLength(1);
  expect(photos.find((p) => p.fileName.startsWith('Canon'))!.faces).toHaveLength(0);
});

test('a corrupt file is skipped and listed; the batch carries on', async ({ page }) => {
  const dir = join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const corrupt = join(dir, 'broken.CR2');
  writeFileSync(corrupt, 'this is not a raw file');
  await load(page, [corrupt, PORTRAIT]);
  const { snapshot, photos } = await run(page, { denoise: null, retouch: false });
  expect(snapshot).toMatchObject({ state: 'finished', done: 1, failed: 1 });
  expect(snapshot.failures[0].name).toBe('broken.CR2');
  expect(photos.map((p) => p.fileName)).toEqual(['astronaut_processed.jpg']);
});

test('pause holds the next photo, resume continues, cancel stops at once', async ({ page }) => {
  await load(page, [PORTRAIT, SMALL_RAW]);
  await batch(page, (b, o) => b.start(o), { denoise: null, retouch: false });
  await batch(page, (b) => b.pause());
  await expect.poll(() => batch(page, (b) => b.snapshot().done), { timeout: 60_000 }).toBe(1);
  await page.waitForTimeout(500);
  expect(await batch(page, (b) => b.snapshot())).toMatchObject({ state: 'paused', done: 1, remaining: 1 });
  await batch(page, (b) => b.resume());
  expect((await batch(page, (b) => b.wait())).snapshot).toMatchObject({ state: 'finished', done: 2 });

  await batch(page, (b, o) => b.start(o), { denoise: 'high', retouch: false });
  await expect.poll(() => batch(page, (b) => b.snapshot().items[0].status)).toBe('running');
  await batch(page, (b) => b.cancel());
  const { snapshot } = await batch(page, (b) => b.wait());
  expect(snapshot).toMatchObject({ state: 'cancelled', failed: 0, remaining: 0 });
});
