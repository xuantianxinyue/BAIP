import { DecodeError, type PhotoAsset, type ProcessingOptions } from '../core';
import type { PhotoProcessor, ProcessedPhoto } from './batch';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

const spawn = () => new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });

/** Runs one request on `worker`. Aborting, or the worker dying, rejects it; `onDead` then drops the worker. */
function request<T>(worker: Worker, message: WorkerRequest, signal: AbortSignal | undefined, accept: (response: WorkerResponse) => T, onDead: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = worker.onerror = null;
    };
    const die = (error: Error) => {
      cleanup();
      worker.terminate();
      onDead();
      reject(error);
    };
    const onAbort = () => die(new DecodeError('aborted', '已取消'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      cleanup();
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(accept(data));
    };
    // An uncaught error here usually means the worker ran out of memory: it is not reusable.
    worker.onerror = (e) => die(new Error(`处理进程崩溃：${e.message || '内存不足或运行时错误'}`));
    worker.postMessage(message);
  });
}

/** Processes photos in one long-lived worker, so models load once per batch. */
export class WorkerPhotoProcessor implements PhotoProcessor {
  private worker?: Worker;
  private nextId = 0;

  process(asset: PhotoAsset, options: ProcessingOptions, signal: AbortSignal): Promise<ProcessedPhoto> {
    this.worker ??= spawn();
    const message: WorkerRequest = { type: 'process', id: ++this.nextId, file: asset.file, options };
    return request(this.worker, message, signal, (r) => (r as Extract<WorkerResponse, { type: 'processed' }>).photo, () => (this.worker = undefined));
  }

  /** Frees the worker and everything it holds. The next photo starts a new one. */
  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
  }
}

/** Decodes a file at full resolution in a worker of its own, ending the worker afterwards. */
export async function decodeToBitmap(file: File, signal: AbortSignal): Promise<ImageBitmap> {
  const worker = spawn();
  try {
    return await request(worker, { type: 'decode', id: 1, file }, signal, (r) => (r as Extract<WorkerResponse, { type: 'decoded' }>).bitmap, () => {});
  } finally {
    worker.terminate();
  }
}
