import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS, type PhotoAsset, type ProcessingOptions } from '../core';
import type { ExportSink, PhotoProcessor, ProcessedPhoto } from './batch';
import { BatchQueue, type BatchSnapshot } from './queue';

const OPTIONS: ProcessingOptions = { denoise: 'medium', retouch: true, export: DEFAULT_EXPORT_OPTIONS };
const assets = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `p${i}.CR2` }) as PhotoAsset);
const photo = (fileName: string): ProcessedPhoto => ({ fileName, blob: new Blob(), width: 1, height: 1, timings: { decode: 0, encode: 0, total: 0 } });

/** A processor whose photos finish only when the test says so. */
function manualProcessor() {
  const pending: { id: string; finish: () => void; fail: (e: Error) => void }[] = [];
  let live = 0;
  let peak = 0;
  const processor: PhotoProcessor = {
    process: (asset, _options, signal) =>
      new Promise((resolve, reject) => {
        peak = Math.max(peak, ++live);
        const done = (f: () => void) => {
          live--;
          f();
        };
        signal.addEventListener('abort', () => done(() => reject(new Error('aborted'))));
        pending.push({ id: asset.id, finish: () => done(() => resolve(photo(asset.name))), fail: (e) => done(() => reject(e)) });
      }),
  };
  return { processor, pending, peak: () => peak };
}

const memorySink = () => {
  const written: string[] = [];
  const sink: ExportSink = { write: async (p) => void written.push(p.fileName) };
  return { sink, written };
};

const tick = () => new Promise((r) => setTimeout(r));

describe('BatchQueue', () => {
  it('processes strictly one photo at a time, in order', async () => {
    const { processor, pending, peak } = manualProcessor();
    const { sink, written } = memorySink();
    const queue = new BatchQueue(assets(3), OPTIONS, processor, sink);
    const finished = queue.start();
    for (let i = 0; i < 3; i++) {
      await tick();
      expect(pending).toHaveLength(i + 1);
      pending[i].finish();
    }
    const result = await finished;
    expect(result).toMatchObject({ state: 'finished', done: 3, failed: 0, remaining: 0 });
    expect(written).toEqual(['p0.CR2', 'p1.CR2', 'p2.CR2']);
    expect(peak()).toBe(1);
  });

  it('skips a failing photo, carries on and lists the failure', async () => {
    const { processor, pending } = manualProcessor();
    const { sink, written } = memorySink();
    const queue = new BatchQueue(assets(3), OPTIONS, processor, sink);
    const finished = queue.start();
    await tick();
    pending[0].finish();
    await tick();
    pending[1].fail(new Error('文件损坏'));
    await tick();
    pending[2].finish();
    expect(await finished).toMatchObject({ state: 'finished', done: 2, failed: 1, failures: [{ name: 'p1.CR2', error: '文件损坏' }] });
    expect(written).toEqual(['p0.CR2', 'p2.CR2']);
  });

  it('counts a failed export as a failed photo', async () => {
    const { processor, pending } = manualProcessor();
    const queue = new BatchQueue(assets(1), OPTIONS, processor, { write: () => Promise.reject(new Error('磁盘已满')) });
    const finished = queue.start();
    await tick();
    pending[0].finish();
    expect(await finished).toMatchObject({ done: 0, failed: 1, failures: [{ error: '磁盘已满' }] });
  });

  it('pauses between photos and continues on resume', async () => {
    const { processor, pending } = manualProcessor();
    const { sink } = memorySink();
    const queue = new BatchQueue(assets(2), OPTIONS, processor, sink);
    const finished = queue.start();
    await tick();
    queue.pause();
    expect(queue.snapshot().state).toBe('paused');
    pending[0].finish(); // the running photo still finishes
    await tick();
    await tick();
    expect(pending).toHaveLength(1);
    expect(queue.snapshot()).toMatchObject({ done: 1, remaining: 1 });
    queue.resume();
    await tick();
    expect(pending).toHaveLength(2);
    pending[1].finish();
    expect(await finished).toMatchObject({ state: 'finished', done: 2 });
  });

  it('cancel aborts the running photo and drops the rest, without reporting failures', async () => {
    const { processor } = manualProcessor();
    const { sink, written } = memorySink();
    const queue = new BatchQueue(assets(3), OPTIONS, processor, sink);
    const finished = queue.start();
    await tick();
    queue.cancel();
    const result = await finished;
    expect(result).toMatchObject({ state: 'cancelled', done: 0, failed: 0, remaining: 0 });
    expect(result.items.map((i) => i.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect(written).toEqual([]);
  });

  it('cancel works while paused', async () => {
    const { processor, pending } = manualProcessor();
    const { sink } = memorySink();
    const queue = new BatchQueue(assets(2), OPTIONS, processor, sink);
    const finished = queue.start();
    await tick();
    queue.pause();
    pending[0].finish();
    await tick();
    queue.cancel();
    expect(await finished).toMatchObject({ state: 'cancelled', done: 1, failed: 0 });
    expect(pending).toHaveLength(1);
  });

  it('reports every change', async () => {
    const { processor, pending } = manualProcessor();
    const { sink } = memorySink();
    const seen: BatchSnapshot[] = [];
    const queue = new BatchQueue(assets(1), OPTIONS, processor, sink, (s) => seen.push(s));
    const finished = queue.start();
    await tick();
    pending[0].finish();
    await finished;
    expect(seen.map((s) => s.items[0].status)).toEqual(['pending', 'running', 'done', 'done']);
    expect(seen.at(-1)!.state).toBe('finished');
  });
});
