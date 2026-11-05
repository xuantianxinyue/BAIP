import { existsSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** 1.6 基础查看与文件管理 — needs `npm run samples`. */
const RAW = join(process.cwd(), 'Fixtures', 'raw');
const need = ['Canon_350D_portrait.CR2', 'Canon_5DMkIII_converted.dng', 'Nikon_D750.NEF'];
const haveSamples = need.every((f) => existsSync(join(RAW, f)));
test.skip(!haveSamples, 'run `npm run samples` first');

/**
 * Fixtures/folder-import (git-ignored), hard-linked from Fixtures/raw:
 *   Canon_350D_portrait.CR2, notes.txt, IMG_0001.xmp, ._Canon_350D_portrait.CR2 (macOS sidecar),
 *   day2/Canon_5DMkIII_converted.dng, day2/Nikon_D750.NEF
 */
function folderFixture(): string {
  const dir = join(process.cwd(), 'Fixtures', 'folder-import');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'day2'), { recursive: true });
  linkSync(join(RAW, 'Canon_350D_portrait.CR2'), join(dir, 'Canon_350D_portrait.CR2'));
  linkSync(join(RAW, 'Canon_5DMkIII_converted.dng'), join(dir, 'day2', 'Canon_5DMkIII_converted.dng'));
  linkSync(join(RAW, 'Nikon_D750.NEF'), join(dir, 'day2', 'Nikon_D750.NEF'));
  writeFileSync(join(dir, 'notes.txt'), 'not an image');
  writeFileSync(join(dir, 'IMG_0001.xmp'), '<x:xmpmeta/>');
  writeFileSync(join(dir, '._Canon_350D_portrait.CR2'), 'AppleDouble');
  return dir;
}

const items = (page: Page) => page.getByTestId('asset-item');
const names = (page: Page) => items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
const currentName = (page: Page) => page.locator('[data-testid=asset-item][data-current=true]').getAttribute('data-name');
const item = (page: Page, name: string) => page.locator(`[data-testid=asset-item][data-name="${name}"]`);

async function importFolder(page: Page) {
  await page.getByTestId('folder-input').setInputFiles(folderFixture());
  await expect(page.locator('[data-testid=asset-item][data-status=ready]')).toHaveCount(3, { timeout: 120_000 });
}
/** Natural order: "Canon_5D…" before "Canon_350D…" (5 < 350). */
const BY_NAME = ['Canon_5DMkIII_converted.dng', 'Canon_350D_portrait.CR2', 'Nikon_D750.NEF'];
async function sortByName(page: Page) {
  await page.getByTestId('sort-key').selectOption('name');
  await expect.poll(() => names(page)).toEqual(BY_NAME);
}

test('folder import drops unsupported files and skips duplicates; file import drops them too', async ({ page }) => {
  await page.goto('/');
  await importFolder(page);
  await expect(page.getByTestId('import-toast')).toHaveText('导入 3 张 · 跳过 3 个不支持的文件');
  await expect(items(page)).toHaveCount(3);
  await expect(page.getByTestId('total-count')).toHaveText('共 3 张');

  await page.getByTestId('folder-input').setInputFiles(folderFixture());
  await expect(page.getByTestId('import-toast')).toHaveText('没有可导入的新照片 · 跳过 3 个不支持的文件 · 3 个重复');
  await expect(items(page)).toHaveCount(3);

  await page.getByTestId('file-input').setInputFiles([join(process.cwd(), 'Fixtures', 'folder-import', 'notes.txt'), join(RAW, 'Nikon_D750.NEF')]);
  await expect(page.getByTestId('import-toast')).toHaveText('没有可导入的新照片 · 跳过 1 个不支持的文件 · 1 个重复');
  await expect(items(page)).toHaveCount(3);
});

test('sorts by capture time / file name and groups by format', async ({ page }) => {
  await page.goto('/');
  await importFolder(page);

  // default: capture time ascending, undated last
  const captures = await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-capture')));
  const dated = captures.filter((c): c is string => !!c);
  expect(dated.length).toBeGreaterThan(0);
  expect(dated).toEqual([...dated].sort());
  expect(captures.slice(0, dated.length)).toEqual(dated);

  await sortByName(page);
  await page.getByTestId('sort-direction').click();
  await expect.poll(() => names(page)).toEqual([...BY_NAME].reverse());

  await page.getByTestId('group-toggle').check();
  await expect(page.getByTestId('group-label')).toHaveText(['CR2 · 1', 'DNG · 1', 'NEF · 1']);
  await expect.poll(() => names(page)).toEqual(['Canon_350D_portrait.CR2', 'Canon_5DMkIII_converted.dng', 'Nikon_D750.NEF']);
  await page.getByTestId('group-toggle').uncheck();
  await expect(page.getByTestId('group-label')).toHaveCount(0);
});

test('selection: click, Cmd/Ctrl+click, Shift+click, select all, Esc and multi-select mode', async ({ page }) => {
  await page.goto('/');
  await importFolder(page);
  await sortByName(page);
  const [a, b, c] = BY_NAME;
  const count = page.getByTestId('selection-count');

  await item(page, a).click();
  expect(await currentName(page)).toBe(a);
  await expect(count).toHaveText('已选 1 张');

  await item(page, c).click({ modifiers: ['ControlOrMeta'] });
  expect(await currentName(page)).toBe(c);
  await expect(count).toHaveText('已选 2 张');
  await expect(item(page, b)).toHaveAttribute('data-selected', 'false');

  await item(page, a).click();
  await item(page, c).click({ modifiers: ['Shift'] });
  await expect(count).toHaveText('已选 3 张');
  expect(await currentName(page)).toBe(c);

  await page.keyboard.press('Escape');
  await expect(count).toHaveText('已选 0 张');
  expect(await currentName(page)).toBe(c);
  await expect(page.getByTestId('remove-button')).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(count).toHaveText('已选 3 张');
  await page.keyboard.press('Escape');

  // multi-select mode: clicks tick photos, the open photo stays
  await page.getByTestId('multiselect-toggle').click();
  await item(page, b).click();
  await item(page, a).click();
  await expect(count).toHaveText('已选 2 张');
  expect(await currentName(page)).toBe(c);
  await item(page, a).click();
  await expect(count).toHaveText('已选 1 张');
  await page.getByTestId('multiselect-toggle').click();
  await expect(count).toHaveText('已选 1 张');
  await item(page, a).click();
  expect(await currentName(page)).toBe(a);
  await expect(count).toHaveText('已选 1 张');
});

test('removing asks for confirmation, keeps files on disk and opens the neighbour', async ({ page }) => {
  await page.goto('/');
  await importFolder(page);
  await sortByName(page);
  await item(page, 'Canon_350D_portrait.CR2').click();

  await page.keyboard.press('Delete');
  await expect(page.getByTestId('confirm-dialog')).toHaveText(/从列表移除 1 张照片？磁盘上的原文件不会被删除。/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(items(page)).toHaveCount(3);

  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect(items(page)).toHaveCount(2);
  expect(await currentName(page)).toBe('Nikon_D750.NEF');
  expect(existsSync(join(process.cwd(), 'Fixtures', 'folder-import', 'Canon_350D_portrait.CR2'))).toBe(true);

  await page.getByTestId('remove-button').click();
  await page.getByTestId('confirm-cancel').click();
  await expect(items(page)).toHaveCount(2);

  await page.getByTestId('clear-button').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveText(/从列表移除 2 张照片/);
  await page.getByTestId('confirm-ok').click();
  await expect(items(page)).toHaveCount(0);
  await expect(page.getByTestId('total-count')).toHaveText('共 0 张');
});

test('arrow keys switch photos and the filmstrip follows; page buttons scroll it', async ({ page }) => {
  const all = readdirSync(RAW).map((f) => join(RAW, f));
  await page.setViewportSize({ width: 760, height: 720 });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(all);
  await expect(page.locator('[data-testid=asset-item][data-status=ready]')).toHaveCount(all.length, { timeout: 240_000 });
  await page.getByTestId('sort-key').selectOption('name');
  const order = (await names(page)) as string[];

  await items(page).first().click();
  for (let i = 1; i < order.length; i++) await page.keyboard.press('ArrowRight');
  expect(await currentName(page)).toBe(order.at(-1));
  await expect(item(page, order.at(-1)!)).toBeInViewport();
  await expect(item(page, order[0])).not.toBeInViewport();
  await page.keyboard.press('ArrowLeft');
  expect(await currentName(page)).toBe(order.at(-2));

  const scroller = page.getByTestId('filmstrip-scroller');
  const before = await scroller.evaluate((e) => e.scrollLeft);
  await page.getByTestId('filmstrip-prev').click();
  await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBeLessThan(before);
  await page.getByTestId('filmstrip-next').click();
  await expect.poll(() => scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
});

test('zoom: wheel and drag, 100% loads the full-resolution original, switching photos resets', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles([join(RAW, 'Nikon_D750.NEF'), join(RAW, 'Canon_5DMkIII_converted.dng')]);
  await expect(page.locator('[data-testid=asset-item][data-status=ready]')).toHaveCount(2, { timeout: 120_000 });
  await page.getByTestId('sort-key').selectOption('name');
  await item(page, 'Nikon_D750.NEF').click();

  const viewer = page.getByTestId('viewer');
  const zoom = page.getByTestId('zoom-level');
  const fitText = await zoom.innerText();
  const fit = parseInt(fitText, 10);
  expect(fit).toBeLessThan(100);
  await expect(page.getByTestId('viewer-source')).toHaveText('预览');

  const box = (await viewer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => parseInt(await zoom.innerText(), 10)).toBeGreaterThan(fit);

  await viewer.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(zoom).toHaveText('100%');
  await expect(page.getByTestId('viewer-source')).toHaveText('原图（LibRaw）', { timeout: 60_000 });
  await expect(page.getByTestId('full-image')).toHaveAttribute('data-width', '6032');
  await expect(page.getByTestId('full-image')).toHaveAttribute('data-height', '4032');
  console.log(`full-resolution load (Nikon D750, 24 MP): ${await viewer.getAttribute('data-full-ms')} ms`);

  const imageBox = page.getByTestId('viewer-image-box');
  const left = await imageBox.evaluate((e) => e.getBoundingClientRect().left);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => imageBox.evaluate((e) => e.getBoundingClientRect().left)).toBeGreaterThan(left + 100);

  await page.getByTestId('zoom-fit').click();
  await expect(zoom).toHaveText(fitText);
  await expect(page.getByTestId('viewer-source')).toHaveText('原图（LibRaw）');

  await page.keyboard.press('ArrowLeft');
  expect(await currentName(page)).toBe('Canon_5DMkIII_converted.dng');
  await expect(page.getByTestId('viewer-source')).toHaveText('预览');
  await expect(page.getByTestId('full-image')).toHaveCount(0);
});

test('portrait RAW is shown upright in the viewer, the thumbnail and the full-resolution image', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(join(RAW, 'Canon_350D_portrait.CR2'));
  await expect(page.locator('[data-testid=asset-item][data-status=ready]')).toHaveCount(1, { timeout: 60_000 });
  const natural = (testId: string) => page.getByTestId(testId).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  await expect.poll(() => natural('preview-image').then(([w, h]) => w > 0 && w < h)).toBe(true);
  await expect.poll(() => natural('thumb-image').then(([w, h]) => w > 0 && w < h)).toBe(true);
  await page.getByTestId('zoom-100').click();
  const full = page.getByTestId('full-image');
  await expect(full).toBeAttached({ timeout: 60_000 });
  const [w, h] = [Number(await full.getAttribute('data-width')), Number(await full.getAttribute('data-height'))];
  console.log(`portrait full decode: ${w} × ${h}`);
  expect(w).toBeLessThan(h);
});
