import { execSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance measurements, slow and so opt-in. Linux only (memory comes from /proc).
 *   BENCH=batch  20 RAWs through denoise + retouch; memory peak, timings and EXIF of every format
 *   BENCH=retouch  exports the retouched portrait for a visual check
 *   BENCH=detect  faces found in the sample RAWs, to check false positives by eye
 *   BENCH=faces  detection rate on Fixtures/faces/lfw (LFW, unpacked by hand), BENCH_FACES images
 * Results go to Fixtures/bench/.
 */
const FIXTURES = join(process.cwd(), 'Fixtures');
const RAW = join(FIXTURES, 'raw');
const OUT = join(FIXTURES, 'bench');

test.setTimeout(2 * 60 * 60 * 1000);

/** Proportional memory of every browser process, so pages shared between them count once. */
function browserMemoryMB(): number {
  let kb = 0;
  for (const pid of execSync("pgrep -f 'chrome|headless_shell' || true").toString().split('\n').filter(Boolean)) {
    try {
      kb += Number(/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))?.[1] ?? 0);
    } catch {
      // The process has just exited.
    }
  }
  return Math.round(kb / 1024);
}

async function load(page: Page, files: string[]) {
  await page.goto('/?e2e');
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.locator('[data-testid=asset-item]:not([data-status=pending]):not([data-status=loading])')).toHaveCount(files.length, { timeout: 30 * 60 * 1000 });
}

const hook = (page: Page, call: string) => page.evaluate(`window.__batch.${call}`);

test('batch of 20 RAWs', async ({ page }) => {
  test.skip(process.env.BENCH !== 'batch');
  mkdirSync(OUT, { recursive: true });
  const copies = join(OUT, 'input');
  rmSync(copies, { recursive: true, force: true });
  mkdirSync(copies);
  const raws = readdirSync(RAW).filter((name) => !name.endsWith('.jpg')).sort();
  const files = Array.from({ length: 20 }, (_, i) => {
    const name = raws[i % raws.length];
    const copy = join(copies, `${Math.floor(i / raws.length)}_${name}`);
    linkSync(join(RAW, name), copy);
    return copy;
  });

  const trace: { t: number; mb: number; done: number }[] = [];
  let done = 0;
  const t0 = Date.now();
  const sampler = setInterval(() => trace.push({ t: Math.round((Date.now() - t0) / 1000), mb: browserMemoryMB(), done }), 2000);
  try {
    await load(page, files);
    const importMs = Date.now() - t0;
    await hook(page, `start({ denoise: 'medium', retouch: true })`);
    let finished = false;
    const report = hook(page, 'wait()').finally(() => (finished = true)) as Promise<{ snapshot: { state: string; done: number; failed: number; failures: unknown[] }; photos: { fileName: string }[] }>;
    while (!finished) {
      await page.waitForTimeout(2000);
      done = ((await hook(page, 'snapshot()')) as { done: number }).done;
    }
    const { snapshot, photos } = await report;
    const peak = Math.max(...trace.map((s) => s.mb));
    writeFileSync(join(OUT, 'batch.json'), JSON.stringify({ importMs, peakMB: peak, snapshot, photos, trace }, null, 1));
    for (let i = 0; i < Math.min(raws.length, photos.length); i++) {
      writeFileSync(join(OUT, photos[i].fileName), Buffer.from((await hook(page, `output(${i})`)) as string, 'base64'));
    }
    console.log('peak MB', peak, 'done', snapshot.done, 'failed', snapshot.failed);
    expect(snapshot).toMatchObject({ state: 'finished', done: 20, failed: 0 });
  } finally {
    clearInterval(sampler);
  }
});

test('retouched portrait', async ({ page }) => {
  test.skip(process.env.BENCH !== 'retouch');
  mkdirSync(OUT, { recursive: true });
  await load(page, [join(FIXTURES, 'faces', 'astronaut.png')]);
  await hook(page, `start({ denoise: null, retouch: true })`);
  await hook(page, 'wait()');
  writeFileSync(join(OUT, 'astronaut_processed.jpg'), Buffer.from((await hook(page, 'output(0)')) as string, 'base64'));
});

test('faces in the sample RAWs', async ({ page }) => {
  test.skip(process.env.BENCH !== 'detect');
  mkdirSync(OUT, { recursive: true });
  await load(page, [...readdirSync(RAW).filter((name) => !name.endsWith('.jpg')).sort().map((name) => join(RAW, name)), join(FIXTURES, 'faces', 'astronaut.png')]);
  await hook(page, `start({ denoise: null, retouch: true })`);
  const { photos } = (await hook(page, 'wait()')) as { photos: { fileName: string; width: number; height: number; faces: unknown[] }[] };
  writeFileSync(join(OUT, 'detect.json'), JSON.stringify(photos.map(({ fileName, width, height, faces }) => ({ fileName, width, height, faces })), null, 1));
  for (let i = 0; i < photos.length; i++) writeFileSync(join(OUT, `detect_${photos[i].fileName}`), Buffer.from((await hook(page, `output(${i})`)) as string, 'base64'));
});

test('face detection rate', async ({ page }) => {
  test.skip(process.env.BENCH !== 'faces');
  const root = join(FIXTURES, 'faces', 'lfw');
  test.skip(!existsSync(root), 'unpack LFW into Fixtures/faces/lfw first');
  // One image per person, evenly spread over the alphabet, so the sample is repeatable.
  const people = readdirSync(root).sort();
  const count = Math.min(Number(process.env.BENCH_FACES ?? 500), people.length);
  const files = Array.from({ length: count }, (_, i) => {
    const person = join(root, people[Math.floor((i * people.length) / count)]);
    return join(person, readdirSync(person).sort()[0]);
  });
  await load(page, files);
  await hook(page, `start({ denoise: null, retouch: true })`);
  const { snapshot, photos } = (await hook(page, 'wait()')) as { snapshot: { done: number; failed: number }; photos: { fileName: string; faces: unknown[] }[] };
  const missed = photos.filter((p) => !p.faces.length).map((p) => p.fileName);
  const multiple = photos.filter((p) => p.faces.length > 1).length;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'faces.json'), JSON.stringify({ count, processed: snapshot.done, failed: snapshot.failed, missed, multiple }, null, 1));
  console.log(`detected ${photos.length - missed.length}/${photos.length}, more than one face in ${multiple}`);
});
