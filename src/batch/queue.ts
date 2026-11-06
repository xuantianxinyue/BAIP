import type { PhotoAsset, ProcessingOptions } from '../core';
import type { BatchEvent, BatchRunner, ExportSink, PhotoProcessor } from './batch';

/** Blocks the runner between photos while paused. */
class PauseGate {
  private paused = false;
  private waiters: (() => void)[] = [];

  get isPaused() {
    return this.paused;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    for (const wake of this.waiters.splice(0)) wake();
  }

  wait(): Promise<void> {
    return this.paused ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }
}

/** One photo at a time; a failing photo is reported and skipped, the batch carries on. */
export class SerialBatchRunner implements BatchRunner {
  constructor(
    private readonly processor: PhotoProcessor,
    private readonly sink: ExportSink,
    private readonly beforeEach: () => Promise<void> = () => Promise.resolve(),
  ) {}

  async *run(assets: PhotoAsset[], options: ProcessingOptions, signal: AbortSignal = new AbortController().signal): AsyncGenerator<BatchEvent> {
    let succeeded = 0;
    let failed = 0;
    for (const asset of assets) {
      await this.beforeEach();
      if (signal.aborted) break;
      yield { type: 'started', assetId: asset.id };
      const t0 = performance.now();
      try {
        const photo = await this.processor.process(asset, options, signal);
        await this.sink.write(photo);
        const { blob: _blob, ...info } = photo;
        succeeded++;
        yield { type: 'finished', assetId: asset.id, ms: performance.now() - t0, photo: info };
      } catch (e) {
        if (signal.aborted) break;
        failed++;
        yield { type: 'failed', assetId: asset.id, message: e instanceof Error ? e.message : String(e) };
      }
    }
    yield { type: 'completed', succeeded, failed, cancelled: assets.length - succeeded - failed };
  }
}

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface BatchItem {
  id: string;
  name: string;
  status: BatchItemStatus;
  ms?: number;
  error?: string;
}

export type BatchState = 'idle' | 'running' | 'paused' | 'finished' | 'cancelled';

export interface BatchSnapshot {
  state: BatchState;
  items: BatchItem[];
  done: number;
  failed: number;
  remaining: number;
  /** The failure list shown at the end of a batch. */
  failures: { name: string; error: string }[];
}

/**
 * The batch queue the UI talks to: wraps a runner with pause / resume / cancel and turns its events
 * into snapshots. Pause takes effect between photos (the running photo finishes); cancel aborts the
 * running photo at once.
 */
export class BatchQueue {
  private readonly gate = new PauseGate();
  private readonly abort = new AbortController();
  private readonly runner: BatchRunner;
  private items: BatchItem[];
  private state: BatchState = 'idle';

  constructor(
    private readonly assets: PhotoAsset[],
    private readonly options: ProcessingOptions,
    processor: PhotoProcessor,
    sink: ExportSink,
    private readonly onChange: (snapshot: BatchSnapshot) => void = () => {},
  ) {
    this.runner = new SerialBatchRunner(processor, sink, () => this.gate.wait());
    this.items = assets.map((a) => ({ id: a.id, name: a.name, status: 'pending' }));
  }

  /** Runs to the end of the batch and resolves with the final snapshot. */
  async start(): Promise<BatchSnapshot> {
    if (this.state !== 'idle') throw new Error('批处理已启动');
    this.setState(this.gate.isPaused ? 'paused' : 'running');
    for await (const event of this.runner.run(this.assets, this.options, this.abort.signal)) this.apply(event);
    return this.snapshot();
  }

  pause() {
    if (this.state !== 'running') return;
    this.gate.pause();
    this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.gate.resume();
    this.setState('running');
  }

  cancel() {
    if (this.state !== 'running' && this.state !== 'paused') return;
    this.abort.abort();
    this.gate.resume();
    this.setState('cancelled');
  }

  snapshot(): BatchSnapshot {
    const count = (status: BatchItemStatus) => this.items.filter((i) => i.status === status).length;
    return {
      state: this.state,
      items: this.items,
      done: count('done'),
      failed: count('failed'),
      remaining: count('pending') + count('running'),
      failures: this.items.filter((i) => i.status === 'failed').map((i) => ({ name: i.name, error: i.error ?? '' })),
    };
  }

  private apply(event: BatchEvent) {
    switch (event.type) {
      case 'started':
        this.patch(event.assetId, { status: 'running' });
        break;
      case 'finished':
        this.patch(event.assetId, { status: 'done', ms: event.ms });
        break;
      case 'failed':
        this.patch(event.assetId, { status: 'failed', error: event.message });
        break;
      case 'completed':
        this.items = this.items.map((i) => (i.status === 'pending' || i.status === 'running' ? { ...i, status: 'cancelled' } : i));
        this.setState(this.abort.signal.aborted ? 'cancelled' : 'finished');
        break;
    }
  }

  private patch(id: string, patch: Partial<BatchItem>) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.onChange(this.snapshot());
  }

  private setState(state: BatchState) {
    this.state = state;
    this.onChange(this.snapshot());
  }
}
